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
    res.status(201).json({ cdr_id: cdrId, analyses });

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