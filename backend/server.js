import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

/* ================= DB ================= */

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'rootpassword',
  database: process.env.MYSQL_DATABASE || 'soutenance',
  waitForConnections: true,
  connectionLimit: 10,
});

/* ================= UPLOAD ================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

const toDateTimeString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

/* ================= ANALYSE ================= */

const analyzeSim = (simNumber, lines, cdrId) => {
  const totalAppels = lines.length;
  if (totalAppels === 0) throw new Error('Aucune donnée pour cette SIM');

  const operateur = lines[0].operateur;

  const hourlyCounts = {};
  let dureeTotale = 0;
  let appelsEchoues = 0;
  let appelsNuit = 0;
  let appelsInter = 0;
  const dailyContacts = {};
  const timestamps = [];

  lines.forEach((l) => {
    const hourKey = l.date_heure.substring(0, 13);
    hourlyCounts[hourKey] = (hourlyCounts[hourKey] || 0) + 1;

    dureeTotale += l.duree_secondes;
    if (l.statut_appel === 'echoue') appelsEchoues++;

    const d = new Date(l.date_heure);
    const h = d.getHours();
    if (h >= 22 || h < 6) appelsNuit++;

    if (l.origine === 'international') appelsInter++;

    timestamps.push(d.getTime());

    const dayKey = l.date_heure.substring(0, 10);
    if (!dailyContacts[dayKey]) dailyContacts[dayKey] = new Set();
    dailyContacts[dayKey].add(l.numero_appele);
  });

  const maxAppelsHeure = Math.max(...Object.values(hourlyCounts));
  const dureeMoyenne = dureeTotale / totalAppels;
  const tauxEchec = (appelsEchoues / totalAppels) * 100;
  const pctNuit = (appelsNuit / totalAppels) * 100;

  // Protection division par zéro si aucun jour dans le CDR
  const nbJours = Object.keys(dailyContacts).length || 1;
  const avgContactsJour =
    Object.values(dailyContacts).reduce((acc, set) => acc + set.size, 0) / nbJours;

  const pctInternational = (appelsInter / totalAppels) * 100;
  const minDate = Math.min(...timestamps);
  const maxDate = Math.max(...timestamps);
  const anciennete = Math.max(
    1,
    Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))
  );

  let score = 0;

  if (maxAppelsHeure > 20) score += 20;
  else if (maxAppelsHeure > 10) score += 10;

  if (dureeMoyenne < 30) score += 15;
  else if (dureeMoyenne < 60) score += 8;

  if (tauxEchec > 25) score += 10;
  else if (tauxEchec > 15) score += 5;

  if (pctNuit > 70) score += 15;
  else if (pctNuit > 40) score += 8;

  if (avgContactsJour > 10) score += 15;
  else if (avgContactsJour > 5) score += 8;

  if (pctInternational > 40) score += 20;
  else if (pctInternational > 20) score += 10;

  if (anciennete < 30 && totalAppels > 500) score += 5;

  let niveau = 'normale';
  if (score >= 60) niveau = 'critique';
  else if (score >= 40) niveau = 'elevee';

  return {
    id: uuidv4(),
    cdr_id: cdrId,
    numero_sim: simNumber,
    operateur,
    score_suspicion: Math.round(score),
    niveau_alerte: niveau,
    statut: 'en_attente',
    date_analyse: new Date().toISOString().slice(0, 19).replace('T', ' '),
    criteres: {
      appels_par_heure: maxAppelsHeure,
      duree_moyenne: dureeMoyenne,
      taux_echec: tauxEchec,
      pct_nuit: pctNuit,
      correspondants_uniques: avgContactsJour,
      pct_international: pctInternational,
      anciennete_jours: anciennete,
    },
  };
};

/* ================= UPLOAD CDR ================= */

app.post('/api/cdr/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { agent_id, operateur = 'TOUS' } = req.body;

  if (!file) return res.status(400).json({ error: 'Fichier requis' });
  if (!agent_id) return res.status(400).json({ error: 'agent_id requis' });

  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    return res.status(400).json({ error: 'Format non supporté (csv, xlsx, xls)' });
  }

  let rows = [];
  try {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    return res.status(400).json({ error: 'Impossible de lire le fichier' });
  }

  const cdrId = uuidv4();
  const dateImport = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const cdrLineEntities = [];
  let lignesRejetees = 0;

  for (const row of rows) {
    const numero_sim = String(row.numero_sim || '').trim();
    if (!numero_sim) { lignesRejetees++; continue; }

    const numero_appele = String(row.numero_appele || '').trim();
    const date_heure = toDateTimeString(row.date_heure);
    const duree_secondes = Number(row.duree_secondes || 0);
    const statut = String(row.statut_appel || '').toLowerCase();
    const origine = String(row.origine || '').toLowerCase();

    if (
      !date_heure ||
      Number.isNaN(duree_secondes) ||
      !['abouti', 'echoue'].includes(statut) ||
      !['national', 'international'].includes(origine)
    ) {
      lignesRejetees++;
      continue;
    }

    cdrLineEntities.push([
      uuidv4(),
      cdrId,
      numero_sim,
      numero_appele,
      date_heure,
      Math.round(duree_secondes),
      statut,
      origine,
      operateur.toUpperCase(),
    ]);
  }

  if (cdrLineEntities.length === 0) {
    return res.status(400).json({
      error: `Aucune ligne valide trouvée. ${lignesRejetees} ligne(s) rejetée(s) — vérifiez les colonnes: numero_sim, numero_appele, date_heure, duree_secondes, statut_appel, origine`,
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cdrId, file.originalname, dateImport, cdrLineEntities.length, 'en_attente', operateur.toUpperCase(), agent_id]
    );

    await conn.query(
      'INSERT INTO cdr_lines VALUES ?',
      [cdrLineEntities]
    );

    await conn.commit();
    res.status(201).json({
      cdr_id: cdrId,
      nb_lignes: cdrLineEntities.length,
      nb_lignes_rejetees: lignesRejetees,
    });

  } catch (err) {
    await conn.rollback();
    console.error('[UPLOAD CDR ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors du traitement du fichier' });

  } finally {
    conn.release();
  }
});

/* ================= ANALYSES ================= */

app.patch('/api/cdr/analyses/:id', async (req, res) => {
  const { id } = req.params;
  const { statut, motif_refus, justificatif_confirmation } = req.body;

  if (!['confirmee', 'refusee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  if (statut === 'confirmee' && !justificatif_confirmation) {
    return res.status(400).json({ error: 'Justificatif requis' });
  }

  if (statut === 'refusee' && !motif_refus) {
    return res.status(400).json({ error: 'Motif requis' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.query(
      `UPDATE sim_analyses SET statut=?, motif_refus=?, justificatif_confirmation=?, date_decision=NOW() WHERE id=?`,
      [statut, motif_refus || null, justificatif_confirmation || null, id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error('[ANALYSES PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });

  } finally {
    conn.release();
  }
});

/* ================= RAPPORTS ================= */

app.post('/api/rapports/envoyer-arpce', async (req, res) => {
  const { operateur } = req.body;
  const conn = await pool.getConnection();

  try {
    const [sims] = await conn.query(
      `SELECT * FROM sim_analyses WHERE statut='confirmee' AND (operateur=? OR UPPER(?)='TOUS')`,
      [operateur, operateur]
    );

    if (sims.length === 0) {
      return res.status(400).json({ error: 'Aucune SIM confirmée à envoyer' });
    }

    const rapportId = uuidv4();

    await conn.query(
      `INSERT INTO rapports VALUES (?, 'simbox', 'analyste', 'arpce', ?, ?)`,
      [rapportId, operateur, JSON.stringify(sims)]
    );

    res.json({ success: true, rapport_id: rapportId });

  } catch (err) {
    console.error('[RAPPORTS ARPCE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });

  } finally {
    conn.release();
  }
});

app.post('/api/rapports/envoyer-agent', async (req, res) => {
  const { operateur } = req.body;
  if (!['MTN', 'AIRTEL'].includes(operateur)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }
  const conn = await pool.getConnection();
  try {
    const [sims] = await conn.query(
      "SELECT * FROM sim_analyses WHERE operateur = ? AND statut = 'confirmee'",
      [operateur]
    );
    const rapportId = uuidv4();
    const contenu = {
      titre: `Analyse CDR — ${operateur}`,
      date: new Date().toISOString(),
      operateur,
      analyses: sims,
      total: sims.length,
    };
    await conn.query(
      'INSERT INTO rapports (id, type, expediteur_role, destinataire_role, operateur, contenu_json) VALUES (?, ?, ?, ?, ?, ?)',
      [rapportId, 'cdr', 'analyste_fraude', `agent_${operateur.toLowerCase()}`, operateur, JSON.stringify(contenu)]
    );
    res.json({ success: true, rapport_id: rapportId, operateur });
  } catch (err) {
    console.error('[RAPPORTS AGENT ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= GET ROUTES ================= */

app.get('/api/cdr/files', async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM cdr_files ORDER BY date_import DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[CDR FILES ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/cdr/analyses', async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM sim_analyses ORDER BY date_analyse DESC'
    );
    res.json(rows.map(r => ({
      ...r,
      criteres: typeof r.criteres === 'string' ? JSON.parse(r.criteres) : r.criteres,
    })));
  } catch (err) {
    console.error('[CDR ANALYSES ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/rapports', async (req, res) => {
  const { role, operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    const VALID_ROLES = ['analyste', 'arpce', 'analyste_fraude', 'agent_mtn', 'agent_airtel'];
    const VALID_OPERATEURS = ['MTN', 'AIRTEL', 'TOUS'];

    let query = 'SELECT * FROM rapports WHERE 1=1';
    const params = [];
    if (role) {
      if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
      query += ' AND destinataire_role = ?'; params.push(role);
    }
    if (operateur) {
      if (!VALID_OPERATEURS.includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
      query += ' AND operateur = ?'; params.push(operateur);
    }
    query += ' ORDER BY date_envoi DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      contenu_json: typeof r.contenu_json === 'string' ? JSON.parse(r.contenu_json) : r.contenu_json,
    })));
  } catch (err) {
    console.error('[RAPPORTS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/ordres', async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM ordres_blocage ORDER BY date_emission DESC'
    );
    res.json(rows.map(r => ({
      ...r,
      liste_sim_json: typeof r.liste_sim_json === 'string'
        ? JSON.parse(r.liste_sim_json)
        : r.liste_sim_json,
      delai_restant_heures: Math.max(
        0,
        Math.round((new Date(r.date_limite) - new Date()) / 3600000)
      ),
    })));
  } catch (err) {
    console.error('[ORDRES GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/sanctions', async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM sanctions ORDER BY date_sanction DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[SANCTIONS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= ORDRES BLOCAGE ================= */

app.patch('/api/ordres/:id/bloquer', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      "UPDATE ordres_blocage SET statut = 'bloque' WHERE id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[ORDRES BLOQUER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.post('/api/ordres/bloquer', async (req, res) => {
  const { rapport_id, operateur, liste_sim, delai_heures = 48 } = req.body;
  const conn = await pool.getConnection();
  try {
    const ordreId = uuidv4();
    const dateLimite = new Date(Date.now() + delai_heures * 3600 * 1000);
    await conn.query(
      'INSERT INTO ordres_blocage (id, rapport_id, operateur, liste_sim_json, delai_heures, date_limite) VALUES (?, ?, ?, ?, ?, ?)',
      [ordreId, rapport_id, operateur, JSON.stringify(liste_sim), delai_heures, dateLimite]
    );
    res.json({ success: true, ordre_id: ordreId, date_limite: dateLimite });
  } catch (err) {
    console.error('[ORDRES CREER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= SANCTIONS ================= */

app.post('/api/sanctions/avertir', async (req, res) => {
  const { ordre_id, operateur } = req.body;
  const conn = await pool.getConnection();
  try {
    const [[ordre]] = await conn.query('SELECT * FROM ordres_blocage WHERE id = ?', [ordre_id]);
    if (!ordre) return res.status(404).json({ error: 'Ordre introuvable' });
    if (new Date() < new Date(ordre.date_limite)) {
      return res.status(400).json({ error: 'Délai pas encore dépassé' });
    }
    await conn.query(
      "UPDATE ordres_blocage SET statut = 'depasse' WHERE id = ?",
      [ordre_id]
    );
    const sanctionId = uuidv4();
    const emailCible = operateur === 'MTN' ? 'agent_mtn@operateur.cg' : 'agent_airtel@operateur.cg';
    await conn.query(
      "INSERT INTO sanctions (id, ordre_blocage_id, operateur, type, email_envoye, log_details) VALUES (?, ?, ?, 'avertissement', ?, ?)",
      [sanctionId, ordre_id, operateur, emailCible, `Avertissement envoyé le ${new Date().toISOString()} — SIM non bloquée dans le délai`]
    );
    console.log(`[SANCTION] Email → ${emailCible}`);
    res.json({ success: true, sanction_id: sanctionId, email_envoye: emailCible });
  } catch (err) {
    console.error('[SANCTIONS AVERTIR ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= AGREGATION ================= */

// Prévisualiser les données disponibles sur une période avant d'agréger
app.get('/api/cdr/preview-agregation', async (req, res) => {
  const { operateur, date_debut, date_fin } = req.query;

  if (!operateur || !date_debut || !date_fin) {
    return res.status(400).json({ error: 'operateur, date_debut, date_fin requis' });
  }

  const VALID_OPERATEURS = ['MTN', 'AIRTEL', 'TOUS'];
  if (!VALID_OPERATEURS.includes(operateur)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
        COUNT(DISTINCT cf.id)        AS nb_fichiers,
        COUNT(cl.id)                 AS nb_lignes,
        COUNT(DISTINCT cl.numero_sim) AS nb_sim_uniques
       FROM cdr_lines cl
       JOIN cdr_files cf ON cl.cdr_id = cf.id
       WHERE cl.operateur = ?
         AND cl.date_heure >= ?
         AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PREVIEW AGREGATION ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Lancer l'agrégation : regroupe toutes les lignes CDR sur la période et analyse par SIM
app.post('/api/cdr/agreger', async (req, res) => {
  const { operateur, date_debut, date_fin, agent_id } = req.body;

  if (!operateur || !date_debut || !date_fin || !agent_id) {
    return res.status(400).json({ error: 'operateur, date_debut, date_fin, agent_id requis' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Récupérer toutes les lignes CDR de la période pour cet opérateur
    const [lines] = await conn.query(
      `SELECT cl.*
       FROM cdr_lines cl
       JOIN cdr_files cf ON cl.cdr_id = cf.id
       WHERE cl.operateur = ?
         AND cl.date_heure >= ?
         AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );

    if (lines.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Aucune donnée CDR sur cette période' });
    }

    // Créer un fichier CDR virtuel représentant l'agrégation
    const cdrVirtuelId = uuidv4();
    const dateAgregation = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        cdrVirtuelId,
        `Agrégation ${operateur} — ${date_debut} → ${date_fin}`,
        dateAgregation,
        lines.length,
        'analyse',
        operateur,
        agent_id,
      ]
    );

    // Regrouper les lignes par numéro SIM
    const grouped = {};
    lines.forEach(l => {
      if (!grouped[l.numero_sim]) grouped[l.numero_sim] = [];
      grouped[l.numero_sim].push({
        numero_sim: l.numero_sim,
        numero_appele: l.numero_appele,
        date_heure: typeof l.date_heure === 'object'
          ? l.date_heure.toISOString().slice(0, 19).replace('T', ' ')
          : l.date_heure,
        duree_secondes: l.duree_secondes,
        statut_appel: l.statut_appel,
        origine: l.origine,
        operateur: l.operateur,
      });
    });

    const analyses = [];
    for (const sim of Object.keys(grouped)) {
      const analysis = analyzeSim(sim, grouped[sim], cdrVirtuelId);
      analyses.push(analysis);
      await conn.query(
        'INSERT INTO sim_analyses (id, cdr_id, numero_sim, operateur, score_suspicion, niveau_alerte, statut, date_analyse, criteres) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          analysis.id,
          cdrVirtuelId,
          analysis.numero_sim,
          analysis.operateur,
          analysis.score_suspicion,
          analysis.niveau_alerte,
          analysis.statut,
          analysis.date_analyse,
          JSON.stringify(analysis.criteres),
        ]
      );
    }

    // Marquer les fichiers sources comme analysés
    await conn.query(
      `UPDATE cdr_files cf
       INNER JOIN cdr_lines cl ON cl.cdr_id = cf.id
       SET cf.statut = 'analyse'
       WHERE cl.operateur = ?
         AND cl.date_heure >= ?
         AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );

    await conn.commit();

    res.status(201).json({
      nb_sim_analysees: analyses.length,
      nb_lignes_traitees: lines.length,
      nb_critiques: analyses.filter(a => a.niveau_alerte === 'critique').length,
      nb_elevees: analyses.filter(a => a.niveau_alerte === 'elevee').length,
      nb_normales: analyses.filter(a => a.niveau_alerte === 'normale').length,
    });

  } catch (err) {
    await conn.rollback();
    console.error('[AGREGATION ERROR]', err);
    res.status(500).json({ error: "Erreur serveur lors de l'agrégation" });
  } finally {
    conn.release();
  }
});

/* ================= DÉTECTION SIMBOX ================= */

/*
 * Algorithme en 3 étapes :
 * 1. Similarité de Jaccard entre toutes les paires de SIM (contacts appelés en commun)
 * 2. Clustering par composantes connexes (groupe = SIM liées par similarité >= seuil)
 * 3. Score de rotation temporelle (les SIM du groupe évitent-elles d'être actives en même temps ?)
 */

const JACCARD_THRESHOLD = 0.25;   // 25% de contacts en commun minimum pour relier 2 SIM
const MIN_CONTACTS_SIM = 2;       // une SIM doit avoir au moins 2 contacts uniques pour participer
const MIN_SCORE_GLOBAL = 25;      // score global minimum pour signaler un groupe

const getTimeSlot = (datetime) => {
  const d = new Date(typeof datetime === 'object' ? datetime.toISOString() : datetime);
  // créneaux de 2h : 0→0h-2h, 1→2h-4h … 11→22h-24h
  return `${d.toISOString().slice(0, 10)}_${Math.floor(d.getHours() / 2)}`;
};

const detecterSimbox = (lines) => {
  // --- Étape 1 : construire les structures par SIM ---
  const simContacts = {};   // SIM → Set(numéros appelés)
  const simSlotSet = {};    // SIM → Set(créneaux actifs)

  lines.forEach(l => {
    const sim = l.numero_sim;
    if (!simContacts[sim]) { simContacts[sim] = new Set(); simSlotSet[sim] = new Set(); }
    simContacts[sim].add(l.numero_appele);
    simSlotSet[sim].add(getTimeSlot(l.date_heure));
  });

  const eligibles = Object.keys(simContacts).filter(
    s => simContacts[s].size >= MIN_CONTACTS_SIM
  );

  if (eligibles.length < 2) return [];

  // --- Étape 2 : similarité de Jaccard + graphe d'adjacence ---
  const adjacency = {};
  eligibles.forEach(s => { adjacency[s] = new Set(); });

  for (let i = 0; i < eligibles.length; i++) {
    for (let j = i + 1; j < eligibles.length; j++) {
      const sA = eligibles[i], sB = eligibles[j];
      const setA = simContacts[sA], setB = simContacts[sB];
      let inter = 0;
      setA.forEach(c => { if (setB.has(c)) inter++; });
      const union = setA.size + setB.size - inter;
      if (union > 0 && inter / union >= JACCARD_THRESHOLD) {
        adjacency[sA].add(sB);
        adjacency[sB].add(sA);
      }
    }
  }

  // --- Étape 3 : composantes connexes (BFS) ---
  const visited = new Set();
  const groupes = [];

  eligibles.forEach(sim => {
    if (visited.has(sim) || adjacency[sim].size === 0) return;
    const groupe = [];
    const queue = [sim];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur); groupe.push(cur);
      adjacency[cur].forEach(nb => { if (!visited.has(nb)) queue.push(nb); });
    }
    if (groupe.length >= 2) groupes.push(groupe);
  });

  // --- Étape 4 : scoring de chaque groupe ---
  return groupes.map(groupe => {
    // Jaccard moyen + contacts communs
    let totalJaccard = 0, nbPaires = 0;
    const contactsCommuns = new Set();
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const setA = simContacts[groupe[i]], setB = simContacts[groupe[j]];
        let inter = 0;
        setA.forEach(c => { if (setB.has(c)) { inter++; contactsCommuns.add(c); } });
        const union = setA.size + setB.size - inter;
        if (union > 0) { totalJaccard += inter / union; nbPaires++; }
      }
    }
    const jaccardMoyen = nbPaires > 0 ? totalJaccard / nbPaires : 0;

    // Score de rotation : % de créneaux où les SIM évitent de se chevaucher
    const tousLesSlots = new Set(groupe.flatMap(s => [...simSlotSet[s]]));
    let chevauchements = 0;
    tousLesSlots.forEach(slot => {
      if (groupe.filter(s => simSlotSet[s].has(slot)).length > 1) chevauchements++;
    });
    const scoreRotation = tousLesSlots.size > 0
      ? ((tousLesSlots.size - chevauchements) / tousLesSlots.size) * 100
      : 0;

    // Score global sur 100
    const scoreGlobal = Math.round(jaccardMoyen * 50 + scoreRotation * 0.5);

    let niveau = 'suspect';
    if (scoreGlobal >= 70) niveau = 'confirme';
    else if (scoreGlobal >= 50) niveau = 'probable';

    return {
      id: uuidv4(),
      sims: groupe,
      nb_sims: groupe.length,
      similarite_moyenne: Math.round(jaccardMoyen * 100),
      score_rotation: Math.round(scoreRotation),
      score_global: scoreGlobal,
      niveau,
      contacts_communs: [...contactsCommuns].slice(0, 20),
    };
  }).filter(g => g.score_global >= MIN_SCORE_GLOBAL);
};

// Lancer la détection simbox sur une période
app.post('/api/cdr/detecter-simbox', async (req, res) => {
  const { operateur, date_debut, date_fin, agent_id } = req.body;
  if (!operateur || !date_debut || !date_fin || !agent_id) {
    return res.status(400).json({ error: 'operateur, date_debut, date_fin, agent_id requis' });
  }

  const conn = await pool.getConnection();
  try {
    const [lines] = await conn.query(
      `SELECT cl.numero_sim, cl.numero_appele, cl.date_heure
       FROM cdr_lines cl
       WHERE cl.operateur = ?
         AND cl.date_heure >= ?
         AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );

    if (lines.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée CDR sur cette période' });
    }

    const groupes = detecterSimbox(lines);

    // Persister les groupes détectés
    for (const g of groupes) {
      await conn.query(
        `INSERT INTO simbox_detectees
          (id, periode_debut, periode_fin, operateur, agent_id,
           sims_json, nb_sims, similarite_moyenne, score_rotation,
           score_global, niveau, contacts_communs_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          g.id, date_debut, date_fin, operateur, agent_id,
          JSON.stringify(g.sims), g.nb_sims, g.similarite_moyenne,
          g.score_rotation, g.score_global, g.niveau,
          JSON.stringify(g.contacts_communs),
        ]
      );
    }

    res.status(201).json({
      nb_groupes: groupes.length,
      nb_sims_impliquees: groupes.reduce((acc, g) => acc + g.nb_sims, 0),
      nb_confirmes: groupes.filter(g => g.niveau === 'confirme').length,
      nb_probables: groupes.filter(g => g.niveau === 'probable').length,
      nb_suspects: groupes.filter(g => g.niveau === 'suspect').length,
      groupes,
    });

  } catch (err) {
    console.error('[DETECTER SIMBOX ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la détection' });
  } finally {
    conn.release();
  }
});

// Lister les simbox détectées
app.get('/api/simbox', async (req, res) => {
  const { statut, operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM simbox_detectees WHERE 1=1';
    const params = [];
    const VALID_STATUTS = ['en_attente', 'validee', 'rejetee'];
    const VALID_OPERATEURS = ['MTN', 'AIRTEL', 'TOUS'];
    if (statut) {
      if (!VALID_STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
      query += ' AND statut = ?'; params.push(statut);
    }
    if (operateur) {
      if (!VALID_OPERATEURS.includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
      query += ' AND operateur = ?'; params.push(operateur);
    }
    query += ' ORDER BY date_detection DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      sims: typeof r.sims_json === 'string' ? JSON.parse(r.sims_json) : r.sims_json,
      contacts_communs: typeof r.contacts_communs_json === 'string'
        ? JSON.parse(r.contacts_communs_json)
        : r.contacts_communs_json,
    })));
  } catch (err) {
    console.error('[SIMBOX GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Valider ou rejeter une simbox détectée
app.patch('/api/simbox/:id', async (req, res) => {
  const { id } = req.params;
  const { statut, motif_rejet } = req.body;
  const VALID = ['validee', 'rejetee'];
  if (!VALID.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  if (statut === 'rejetee' && !motif_rejet) return res.status(400).json({ error: 'Motif requis' });

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE simbox_detectees SET statut = ?, motif_rejet = ? WHERE id = ?',
      [statut, motif_rejet || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[SIMBOX PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= SERVER ================= */

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
