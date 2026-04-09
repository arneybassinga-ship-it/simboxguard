import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
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

const upload = multer({ storage: multer.memoryStorage() });

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
  const avgContactsJour =
    Object.values(dailyContacts).reduce((acc, set) => acc + set.size, 0) /
    Object.keys(dailyContacts).length;

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
    return res.status(400).json({ error: 'Format non supporté' });
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

  for (const row of rows) {
    const numero_sim = String(row.numero_sim || '').trim();
    if (!numero_sim) continue;

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
    ) continue;

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
    return res.status(400).json({ error: 'Aucune ligne valide' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cdrId, file.originalname, dateImport, cdrLineEntities.length, 'analyse', operateur.toUpperCase(), agent_id]
    );

    await conn.query(
      'INSERT INTO cdr_lines VALUES ?',
      [cdrLineEntities]
    );

    const grouped = {};
    cdrLineEntities.forEach(l => {
      if (!grouped[l[2]]) grouped[l[2]] = [];
      grouped[l[2]].push({
        numero_sim: l[2],
        numero_appele: l[3],
        date_heure: l[4],
        duree_secondes: l[5],
        statut_appel: l[6],
        origine: l[7],
        operateur: l[8],
      });
    });

    const analyses = [];

    for (const sim of Object.keys(grouped)) {
      const analysis = analyzeSim(sim, grouped[sim], cdrId);
      analyses.push(analysis);

      await conn.query(
        'INSERT INTO sim_analyses (id, cdr_id, numero_sim, operateur, score_suspicion, niveau_alerte, statut, date_analyse, criteres) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          analysis.id,
          cdrId,
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

    await conn.commit();
    res.status(201).json({ cdr_id: cdrId, nb_lignes: rows.length, nb_analyses: analyses.length, analyses });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });

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
    res.status(500).json({ error: err.message });

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
      return res.status(400).json({ error: 'Aucune SIM' });
    }

    const rapportId = uuidv4();

    await conn.query(
      `INSERT INTO rapports VALUES (?, 'simbox', 'analyste', 'arpce', ?, ?)`,
      [rapportId, operateur, JSON.stringify(sims)]
    );

    res.json({ success: true });

  } finally {
    conn.release();
  }
});

/* ================= SERVER ================= */

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
// GET /api/cdr/files — liste des fichiers CDR importés
app.get('/api/cdr/files', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM cdr_files ORDER BY date_import DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/cdr/analyses — liste des analyses SIM
app.get('/api/cdr/analyses', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM sim_analyses ORDER BY date_analyse DESC'
    );
    res.json(rows.map(r => ({
      ...r,
      criteres: typeof r.criteres === 'string' ? JSON.parse(r.criteres) : r.criteres
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/rapports — liste des rapports
app.get('/api/rapports', async (req, res) => {
  const { role, operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM rapports WHERE 1=1';
    const params = [];
    if (role) { query += ' AND destinataire_role = ?'; params.push(role); }
    if (operateur) { query += ' AND operateur = ?'; params.push(operateur); }
    query += ' ORDER BY date_envoi DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      contenu_json: typeof r.contenu_json === 'string'
        ? JSON.parse(r.contenu_json)
        : r.contenu_json
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/ordres — liste des ordres de blocage
app.get('/api/ordres', async (req, res) => {
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
      )
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/sanctions — liste des sanctions
app.get('/api/sanctions', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM sanctions ORDER BY date_sanction DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/cdr/files
app.get('/api/cdr/files', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM cdr_files ORDER BY date_import DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// GET /api/cdr/analyses
app.get('/api/cdr/analyses', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM sim_analyses ORDER BY date_analyse DESC');
    res.json(rows.map(r => ({
      ...r,
      criteres: typeof r.criteres === 'string' ? JSON.parse(r.criteres) : r.criteres
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// GET /api/rapports
app.get('/api/rapports', async (req, res) => {
  const { role, operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM rapports WHERE 1=1';
    const params = [];
    if (role) { query += ' AND destinataire_role = ?'; params.push(role); }
    if (operateur) { query += ' AND operateur = ?'; params.push(operateur); }
    query += ' ORDER BY date_envoi DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      contenu_json: typeof r.contenu_json === 'string' ? JSON.parse(r.contenu_json) : r.contenu_json
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// GET /api/ordres
app.get('/api/ordres', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM ordres_blocage ORDER BY date_emission DESC');
    res.json(rows.map(r => ({
      ...r,
      liste_sim_json: typeof r.liste_sim_json === 'string' ? JSON.parse(r.liste_sim_json) : r.liste_sim_json,
      delai_restant_heures: Math.max(0, Math.round((new Date(r.date_limite) - new Date()) / 3600000))
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// PATCH /api/ordres/:id/bloquer
app.patch('/api/ordres/:id/bloquer', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("UPDATE ordres_blocage SET statut = 'bloque' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// POST /api/ordres/bloquer
app.post('/api/ordres/bloquer', async (req, res) => {
  const { rapport_id, operateur, liste_sim, delai_heures = 48 } = req.body;
  const conn = await pool.getConnection();
  try {
    const { v4: uuidv4 } = require('uuid');
    const ordreId = uuidv4();
    const dateLimite = new Date(Date.now() + delai_heures * 3600 * 1000);
    await conn.query(
      'INSERT INTO ordres_blocage (id, rapport_id, operateur, liste_sim_json, delai_heures, date_limite) VALUES (?, ?, ?, ?, ?, ?)',
      [ordreId, rapport_id, operateur, JSON.stringify(liste_sim), delai_heures, dateLimite]
    );
    res.json({ success: true, ordre_id: ordreId, date_limite: dateLimite });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// POST /api/rapports/envoyer-agent
app.post('/api/rapports/envoyer-agent', async (req, res) => {
  const { operateur } = req.body;
  if (!['MTN', 'AIRTEL'].includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
  const conn = await pool.getConnection();
  try {
    const { v4: uuidv4 } = require('uuid');
    const [sims] = await conn.query(
      "SELECT * FROM sim_analyses WHERE operateur = ? AND statut = 'confirmee'", [operateur]
    );
    const rapportId = uuidv4();
    const contenu = { titre: `Analyse CDR — ${operateur}`, date: new Date().toISOString(), operateur, analyses: sims, total: sims.length };
    await conn.query(
      'INSERT INTO rapports (id, type, expediteur_role, destinataire_role, operateur, contenu_json) VALUES (?, ?, ?, ?, ?, ?)',
      [rapportId, 'cdr', 'analyste_fraude', `agent_${operateur.toLowerCase()}`, operateur, JSON.stringify(contenu)]
    );
    res.json({ success: true, rapport_id: rapportId, operateur });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// GET /api/sanctions
app.get('/api/sanctions', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM sanctions ORDER BY date_sanction DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// POST /api/sanctions/avertir
app.post('/api/sanctions/avertir', async (req, res) => {
  const { ordre_id, operateur } = req.body;
  const conn = await pool.getConnection();
  try {
    const { v4: uuidv4 } = require('uuid');
    const [[ordre]] = await conn.query('SELECT * FROM ordres_blocage WHERE id = ?', [ordre_id]);
    if (!ordre) throw new Error('Ordre introuvable');
    if (new Date() < new Date(ordre.date_limite)) return res.status(400).json({ error: 'Délai pas encore dépassé' });
    await conn.query("UPDATE ordres_blocage SET statut = 'depasse' WHERE id = ?", [ordre_id]);
    const sanctionId = uuidv4();
    const emailCible = operateur === 'MTN' ? 'agent_mtn@operateur.cg' : 'agent_airtel@operateur.cg';
    await conn.query(
      "INSERT INTO sanctions (id, ordre_blocage_id, operateur, type, email_envoye, log_details) VALUES (?, ?, ?, 'avertissement', ?, ?)",
      [sanctionId, ordre_id, operateur, emailCible, `Avertissement envoyé le ${new Date().toISOString()} — SIM non bloquée dans le délai`]
    );
    console.log(`[SANCTION] Email → ${emailCible}`);
    res.json({ success: true, sanction_id: sanctionId, email_envoye: emailCible });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});
