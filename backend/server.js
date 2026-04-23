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

const ensureDatabaseSchema = async () => {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS simbox_detectees (
        id VARCHAR(36) PRIMARY KEY,
        periode_debut DATE NOT NULL,
        periode_fin DATE NOT NULL,
        operateur VARCHAR(20) NOT NULL,
        agent_id VARCHAR(50) NOT NULL,
        sims_json TEXT NOT NULL,
        nb_sims INT NOT NULL,
        similarite_moyenne FLOAT NOT NULL,
        score_rotation FLOAT NOT NULL,
        score_global INT NOT NULL,
        niveau ENUM('suspect','probable','confirme') NOT NULL,
        statut ENUM('en_attente','validee','rejetee') DEFAULT 'en_attente',
        motif_rejet TEXT NULL,
        contacts_communs_json TEXT NOT NULL,
        date_detection DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_simbox_statut
      ON simbox_detectees(statut)
    `);
  } finally {
    conn.release();
  }
};

/* ================= UPLOAD ================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

const normalizeColumnName = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^\w]+/g, '_')
  .replace(/^_+|_+$/g, '');

const toDateTimeString = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = new Date(Date.UTC(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      parsed.S || 0,
    ));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d, hh, mm, ss] = compactMatch;
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    let [, d, m, y, hh = '00', mm = '00', ss = '00'] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
    );
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  const isoLike = raw.replace(/\//g, '-');
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const parseDurationSeconds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw)));

  const parts = raw.split(':').map(part => part.trim());
  if (parts.length >= 2 && parts.every(part => /^\d+$/.test(part))) {
    const nums = parts.map(Number);
    if (nums.length === 2) return (nums[0] * 60) + nums[1];
    if (nums.length === 3) return (nums[0] * 3600) + (nums[1] * 60) + nums[2];
  }

  const hourMatch = raw.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?/i);
  if (hourMatch && hourMatch[0].trim()) {
    const [, h = '0', m = '0', s = '0'] = hourMatch;
    const total = (Number(h) * 3600) + (Number(m) * 60) + Number(s);
    if (Number.isFinite(total)) return total;
  }

  return null;
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/* ================= MAPPING FLEXIBLE DES COLONNES CDR ================= */

// Synonymes acceptés pour chaque champ interne
const CHAMPS_SYNONYMES = {
  numero_sim: [
    'msisdn', 'msisdn_a', 'a_msisdn', 'numero_sim', 'sim', 'a_number',
    'calling_number', 'calling_party', 'caller', 'calling', 'numero_appelant',
    'a_party', 'ani', 'cli', 'source', 'subscriber', 'numero', 'phone',
    'from', 'src', 'originating', 'origine_number', 'calling_msisdn',
    'imsi_msisdn', 'abonnee', 'abonnee_a', 'caller_id',
  ],
  numero_appele: [
    'numero_appele', 'numero_appelé', 'b_number', 'called_number', 'called_party',
    'destination', 'dialed', 'called', 'b_party', 'dnis', 'numero_destination',
    'called_msisdn', 'b_msisdn', 'msisdn_b', 'to', 'dst', 'terminating',
    'dest', 'b_calling', 'dialed_number', 'callee', 'abonnee_b', 'destination_number',
  ],
  date_heure: [
    'date_heure', 'call_time', 'datetime', 'timestamp', 'start_time', 'date_time',
    'call_date', 'start', 'heure', 'date', 'call_start', 'start_datetime',
    'call_timestamp', 'event_time', 'time', 'date_appel', 'heure_appel',
    'call_begin', 'begin_time', 'record_date', 'answer_time', 'setup_time',
  ],
  duree_secondes: [
    'duree_secondes', 'duration', 'duree', 'call_duration', 'duration_sec',
    'duree_sec', 'length', 'talk_time', 'billsec', 'duration_seconds',
    'call_length', 'elapsed', 'seconds', 'duree_appel', 'total_duration',
    'charged_duration', 'conversation_time', 'holding_time',
  ],
  statut_appel: [
    'statut_appel', 'status', 'result', 'call_status', 'call_result', 'etat',
    'disposition', 'outcome', 'answer_status', 'call_state', 'statut',
    'release_cause', 'termination_cause',
  ],
  origine: [
    'origine', 'type', 'call_type', 'direction', 'traffic_type', 'traffic',
    'call_direction', 'service_type', 'nature', 'call_nature', 'service',
    'roaming_flag', 'in_out', 'traffic_case',
  ],
};

// Normalise la valeur brute du statut vers 'abouti' ou 'echoue'
const normaliserStatut = (val) => {
  const v = String(val ?? '').toLowerCase().trim();
  const ABOUTI = ['abouti', 'answered', 'connected', 'success', 'yes', '1', 'ok',
    'completed', 'normal', 'normal clearing', 'established', 'accept'];
  const ECHOUE = ['echoue', 'échoué', 'failed', 'unanswered', 'busy', 'no answer',
    'noanswer', '0', 'nok', 'no', 'rejected', 'error', 'timeout', 'cancel',
    'congestion', 'not answered'];
  if (ABOUTI.some(a => v.includes(a))) return 'abouti';
  if (ECHOUE.some(e => v.includes(e))) return 'echoue';
  return null;
};

// Normalise la valeur brute de l'origine vers 'national' ou 'international'
const normaliserOrigine = (val) => {
  const v = String(val ?? '').toLowerCase().trim();
  const INTER = ['international', 'inter', 'int', 'roaming', 'idd', 'foreign',
    'abroad', 'overseas', 'transit'];
  const NAT = ['national', 'local', 'domestic', 'nat', 'loc', 'home',
    'onnet', 'offnet', 'inland'];
  if (INTER.some(i => v.includes(i))) return 'international';
  if (NAT.some(n => v.includes(n))) return 'national';
  // Si la valeur est numérique : 1 = international, 0 = national (convention courante)
  if (v === '1') return 'international';
  if (v === '0') return 'national';
  return null;
};

// Tente de faire correspondre automatiquement les colonnes du fichier aux champs internes
const detecterMapping = (colonnes) => {
  const mapping = {};
  const normalizedColumns = colonnes.map(col => ({
    original: col,
    normalized: normalizeColumnName(col),
  }));
  for (const [champ, synonymes] of Object.entries(CHAMPS_SYNONYMES)) {
    const synonymesNormalises = synonymes.map(normalizeColumnName);
    const col = normalizedColumns.find(c =>
      synonymesNormalises.includes(c.normalized)
    );
    mapping[champ] = col?.original || null;
  }
  return mapping;
};

const detecterOrigineDepuisNumero = (numero) => {
  const v = String(numero ?? '').replace(/\s+/g, '');
  if (!v) return null;
  if (v.startsWith('+242') || v.startsWith('242')) return 'national';
  if (v.startsWith('+') || v.startsWith('00')) return 'international';
  return 'national';
};

const infererStatutAppel = (rawStatut, dureeSecondes) => {
  const statut = normaliserStatut(rawStatut);
  if (statut) return statut;
  if (dureeSecondes === null) return 'abouti';
  return dureeSecondes > 0 ? 'abouti' : 'echoue';
};

const infererOrigine = (rawOrigine, numeroAppele) => {
  const origine = normaliserOrigine(rawOrigine);
  if (origine) return origine;
  return detecterOrigineDepuisNumero(numeroAppele) || 'national';
};

const REPORT_STATUSES = ['brouillon', 'envoye', 'consulte', 'traite'];
const REPORT_ROLES = ['analyste', 'arpce', 'analyste_fraude', 'agent_mtn', 'agent_airtel'];
const REPORT_DESTINATIONS = ['arpce', 'agent_mtn', 'agent_airtel'];

const toSqlDateTime = (date = new Date()) => date.toISOString().slice(0, 19).replace('T', ' ');

const buildReportReference = () =>
  `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;

const parseJsonField = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeAnalysesForReport = (rows) => rows.map((row) => ({
  ...row,
  criteres: parseJsonField(row.criteres, row.criteres),
}));

const buildReportContent = ({
  type,
  operateur,
  reference,
  analysteNom,
  periodeDebut,
  periodeFin,
  analyses,
  dateSignature = null,
}) => {
  const base = {
    reference,
    operateur,
    total: analyses.length,
    analyste_nom: analysteNom,
    periode: {
      date_debut: periodeDebut,
      date_fin: periodeFin,
    },
    signature: {
      analyste_nom: analysteNom,
      date_signature: dateSignature,
    },
    date_generation: new Date().toISOString(),
  };

  if (type === 'simbox') {
    return {
      ...base,
      titre: `Rapport SimBox — ${operateur}`,
      sims_confirmees: analyses,
    };
  }

  return {
    ...base,
    titre: `Analyse CDR — ${operateur}`,
    analyses,
  };
};

const normalizeReportRow = (row) => {
  const contenu = parseJsonField(row.contenu_json, {});
  const signatureDate = row.date_signature
    ? new Date(row.date_signature).toISOString()
    : contenu.signature?.date_signature || null;

  return {
    ...row,
    contenu_json: {
      ...contenu,
      reference: row.reference_unique || contenu.reference || null,
      signature: {
        analyste_nom: row.analyste_nom || contenu.signature?.analyste_nom || contenu.analyste_nom || null,
        date_signature: signatureDate,
      },
      periode: {
        date_debut: row.periode_debut || contenu.periode?.date_debut || null,
        date_fin: row.periode_fin || contenu.periode?.date_fin || null,
      },
    },
  };
};

/* ================= DÉTECTION DE COLONNES ================= */

// Analyse un fichier CDR et retourne le mapping proposé + un aperçu
app.post('/api/cdr/detect-columns', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Fichier requis' });

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

  if (rows.length === 0) return res.status(400).json({ error: 'Fichier vide' });

  const colonnes = Object.keys(rows[0]);
  const mapping = detecterMapping(colonnes);
  const preview = rows.slice(0, 3);

  res.json({ colonnes, mapping, nb_lignes: rows.length, preview });
});

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
  const { agent_id, operateur = 'TOUS', mapping: mappingStr } = req.body;

  if (!file) return res.status(400).json({ error: 'Fichier requis' });
  if (!agent_id) return res.status(400).json({ error: 'agent_id requis' });
  if (!mappingStr) return res.status(400).json({ error: 'mapping requis — appelez d\'abord /api/cdr/detect-columns' });

  let mapping;
  try { mapping = JSON.parse(mappingStr); }
  catch { return res.status(400).json({ error: 'mapping JSON invalide' }); }

  const CHAMPS_REQUIS = ['numero_sim', 'numero_appele', 'date_heure', 'duree_secondes'];
  const manquants = CHAMPS_REQUIS.filter(c => !mapping[c]);
  if (manquants.length > 0) {
    return res.status(400).json({ error: `Colonnes non associées : ${manquants.join(', ')}` });
  }

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
    // Extraction via mapping dynamique (la colonne MSISDN du fichier → numero_sim interne)
    const numero_sim = String(row[mapping.numero_sim] ?? '').trim();
    if (!numero_sim) { lignesRejetees++; continue; }

    const numero_appele = String(row[mapping.numero_appele] ?? '').trim();
    if (!numero_appele) { lignesRejetees++; continue; }

    const date_heure = toDateTimeString(row[mapping.date_heure]);
    const duree_secondes = parseDurationSeconds(row[mapping.duree_secondes]);
    const statut = infererStatutAppel(
      mapping.statut_appel ? row[mapping.statut_appel] : null,
      duree_secondes,
    );
    const origine = infererOrigine(
      mapping.origine ? row[mapping.origine] : null,
      numero_appele,
    );

    if (!date_heure || duree_secondes === null || !statut || !origine) {
      lignesRejetees++;
      continue;
    }

    cdrLineEntities.push([
      uuidv4(), cdrId, numero_sim, numero_appele,
      date_heure, Math.round(duree_secondes), statut, origine,
      operateur.toUpperCase(),
    ]);
  }

  if (cdrLineEntities.length === 0) {
    return res.status(400).json({
      error: `Aucune ligne valide. ${lignesRejetees} ligne(s) rejetée(s). Vérifiez au minimum les colonnes SIM, numéro appelé, date/heure et durée.`,
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
  const { statut, motif_refus, details_refus, justificatif_confirmation } = req.body;

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
      `UPDATE sim_analyses
       SET statut=?, motif_refus=?, details_refus=?, justificatif_confirmation=?, date_decision=NOW()
       WHERE id=?`,
      [
        statut,
        motif_refus || null,
        details_refus || null,
        justificatif_confirmation || null,
        id,
      ]
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
  const { operateur, analyste_nom = 'Analyste fraude', date_debut = null, date_fin = null } = req.body;
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
    const reference = buildReportReference();
    const signatureDate = toSqlDateTime();
    const analyses = normalizeAnalysesForReport(sims);
    const contenu = {
      ...buildReportContent({
        type: 'simbox',
        operateur,
        reference,
        analysteNom: analyste_nom,
        periodeDebut: date_debut,
        periodeFin: date_fin,
        analyses,
        dateSignature: signatureDate,
      }),
      date: new Date().toISOString(),
    };

    await conn.query(
      `INSERT INTO rapports
        (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, date_signature, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, 'simbox', 'analyste_fraude', 'arpce', operateur, JSON.stringify(contenu), reference, 'envoye', analyste_nom, signatureDate, date_debut, date_fin]
    );

    res.json({ success: true, rapport_id: rapportId, reference_unique: reference });

  } catch (err) {
    console.error('[RAPPORTS ARPCE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });

  } finally {
    conn.release();
  }
});

app.post('/api/rapports/envoyer-agent', async (req, res) => {
  const { operateur, analyste_nom = 'Analyste fraude', date_debut = null, date_fin = null } = req.body;
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
    const reference = buildReportReference();
    const signatureDate = toSqlDateTime();
    const analyses = normalizeAnalysesForReport(sims);
    const contenu = buildReportContent({
      type: 'cdr',
      operateur,
      reference,
      analysteNom: analyste_nom,
      periodeDebut: date_debut,
      periodeFin: date_fin,
      analyses,
      dateSignature: signatureDate,
    });
    await conn.query(
      `INSERT INTO rapports
        (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, date_signature, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, 'cdr', 'analyste_fraude', `agent_${operateur.toLowerCase()}`, operateur, JSON.stringify(contenu), reference, 'envoye', analyste_nom, signatureDate, date_debut, date_fin]
    );
    res.json({ success: true, rapport_id: rapportId, operateur, reference_unique: reference });
  } catch (err) {
    console.error('[RAPPORTS AGENT ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.post('/api/analyste/rapports/generer', async (req, res) => {
  const {
    operateur = 'TOUS',
    destinataire,
    date_debut,
    date_fin,
    analyste_nom = 'Analyste fraude',
  } = req.body;

  if (!date_debut || !date_fin) {
    return res.status(400).json({ error: 'date_debut et date_fin requis' });
  }
  if (!REPORT_DESTINATIONS.includes(destinataire)) {
    return res.status(400).json({ error: 'Destinataire invalide' });
  }
  if (!['MTN', 'AIRTEL', 'TOUS'].includes(operateur)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }
  if (destinataire === 'agent_mtn' && operateur !== 'MTN') {
    return res.status(400).json({ error: 'Un rapport destiné à MTN doit cibler MTN' });
  }
  if (destinataire === 'agent_airtel' && operateur !== 'AIRTEL') {
    return res.status(400).json({ error: 'Un rapport destiné à AIRTEL doit cibler AIRTEL' });
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT sa.*, cf.nom_fichier
       FROM sim_analyses sa
       JOIN cdr_files cf ON cf.id = sa.cdr_id
       WHERE sa.statut = 'confirmee'
         AND COALESCE(sa.date_decision, sa.date_analyse) >= ?
         AND COALESCE(sa.date_decision, sa.date_analyse) < DATE_ADD(?, INTERVAL 1 DAY)
         AND (? = 'TOUS' OR sa.operateur = ?)
       ORDER BY sa.score_suspicion DESC, sa.date_analyse DESC`,
      [date_debut, date_fin, operateur, operateur]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Aucune analyse confirmée sur cette période' });
    }

    const analyses = normalizeAnalysesForReport(rows);
    const rapportId = uuidv4();
    const reference = buildReportReference();
    const type = destinataire === 'arpce' ? 'simbox' : 'cdr';
    const contenu = buildReportContent({
      type,
      operateur,
      reference,
      analysteNom: analyste_nom,
      periodeDebut: date_debut,
      periodeFin: date_fin,
      analyses,
    });

    await conn.query(
      `INSERT INTO rapports
        (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, type, 'analyste_fraude', destinataire, operateur, JSON.stringify(contenu), reference, 'brouillon', analyste_nom, date_debut, date_fin]
    );

    const [[rapport]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [rapportId]);
    res.status(201).json(normalizeReportRow(rapport));
  } catch (err) {
    console.error('[ANALYSTE RAPPORT GENERER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du rapport' });
  } finally {
    conn.release();
  }
});

app.post('/api/rapports/:id/envoyer', async (req, res) => {
  const { id } = req.params;
  const { analyste_nom } = req.body;
  const conn = await pool.getConnection();
  try {
    const [[rapport]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    if (!rapport) return res.status(404).json({ error: 'Rapport introuvable' });

    const signatureDate = toSqlDateTime();
    const analysteNomFinal = analyste_nom || rapport.analyste_nom || 'Analyste fraude';
    const contenu = normalizeReportRow(rapport).contenu_json;
    const contenuMisAJour = {
      ...contenu,
      signature: {
        analyste_nom: analysteNomFinal,
        date_signature: signatureDate,
      },
    };

    await conn.query(
      `UPDATE rapports
       SET statut_rapport='envoye',
           analyste_nom=?,
           date_signature=?,
           contenu_json=?,
           statut_lu=FALSE
       WHERE id=?`,
      [analysteNomFinal, signatureDate, JSON.stringify(contenuMisAJour), id]
    );

    const [[updated]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    res.json(normalizeReportRow(updated));
  } catch (err) {
    console.error('[RAPPORT ENVOI ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'envoi du rapport' });
  } finally {
    conn.release();
  }
});

app.patch('/api/rapports/:id/statut', async (req, res) => {
  const { id } = req.params;
  const { statut_rapport } = req.body;
  if (!REPORT_STATUSES.includes(statut_rapport)) {
    return res.status(400).json({ error: 'Statut de rapport invalide' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE rapports SET statut_rapport = ?, statut_lu = IF(? IN (\'consulte\', \'traite\'), TRUE, statut_lu) WHERE id = ?',
      [statut_rapport, statut_rapport, id]
    );
    const [[updated]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    if (!updated) return res.status(404).json({ error: 'Rapport introuvable' });
    res.json(normalizeReportRow(updated));
  } catch (err) {
    console.error('[RAPPORT STATUS ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du rapport' });
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
  const { role, operateur, expediteur_role, statut_rapport } = req.query;
  const conn = await pool.getConnection();
  try {
    const VALID_OPERATEURS = ['MTN', 'AIRTEL', 'TOUS'];

    let query = 'SELECT * FROM rapports WHERE 1=1';
    const params = [];
    if (role) {
      if (!REPORT_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
      query += ' AND destinataire_role = ?'; params.push(role);
    }
    if (expediteur_role) {
      if (!REPORT_ROLES.includes(expediteur_role)) return res.status(400).json({ error: 'Expéditeur invalide' });
      query += ' AND expediteur_role = ?'; params.push(expediteur_role);
    }
    if (operateur) {
      if (!VALID_OPERATEURS.includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
      query += ' AND operateur = ?'; params.push(operateur);
    }
    if (statut_rapport) {
      if (!REPORT_STATUSES.includes(statut_rapport)) return res.status(400).json({ error: 'Statut de rapport invalide' });
      query += ' AND statut_rapport = ?'; params.push(statut_rapport);
    }
    query += ' ORDER BY date_envoi DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(normalizeReportRow));
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
    // Marquer automatiquement en "depasse" les ordres en_attente dont le délai est écoulé
    await conn.query(
      `UPDATE ordres_blocage SET statut = 'depasse'
       WHERE statut = 'en_attente' AND date_limite < NOW()`
    );
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
    if (rapport_id && rapport_id !== 'manual') {
      await conn.query(
        "UPDATE rapports SET statut_rapport='traite', statut_lu=TRUE WHERE id = ?",
        [rapport_id]
      );
    }
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

    const nomAgregation = `Agrégation ${operateur} — ${date_debut} → ${date_fin}`;

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

    // Remplace toute agrégation précédente sur la même période pour garder une démo rejouable.
    const [existingAggregations] = await conn.query(
      `SELECT id
       FROM cdr_files
       WHERE nom_fichier = ?
         AND operateur = ?
         AND agent_id = ?`,
      [nomAgregation, operateur, agent_id]
    );

    for (const aggregation of existingAggregations) {
      await conn.query('DELETE FROM cdr_files WHERE id = ?', [aggregation.id]);
    }

    // Créer un fichier CDR virtuel représentant l'agrégation
    const cdrVirtuelId = uuidv4();
    const dateAgregation = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        cdrVirtuelId,
        nomAgregation,
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
    await conn.beginTransaction();

    const [lines] = await conn.query(
      `SELECT cl.numero_sim, cl.numero_appele, cl.date_heure
       FROM cdr_lines cl
       WHERE cl.operateur = ?
         AND cl.date_heure >= ?
         AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );

    if (lines.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Aucune donnée CDR sur cette période' });
    }

    const groupes = detecterSimbox(lines);

    // Remplace toute détection précédente sur la même période pour éviter les doublons.
    await conn.query(
      `DELETE FROM simbox_detectees
       WHERE operateur = ?
         AND agent_id = ?
         AND periode_debut = ?
         AND periode_fin = ?`,
      [operateur, agent_id, date_debut, date_fin]
    );

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

    await conn.commit();

    res.status(201).json({
      nb_groupes: groupes.length,
      nb_sims_impliquees: groupes.reduce((acc, g) => acc + g.nb_sims, 0),
      nb_confirmes: groupes.filter(g => g.niveau === 'confirme').length,
      nb_probables: groupes.filter(g => g.niveau === 'probable').length,
      nb_suspects: groupes.filter(g => g.niveau === 'suspect').length,
      groupes,
    });

  } catch (err) {
    await conn.rollback();
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
      sims: parseJsonArray(r.sims_json),
      contacts_communs: parseJsonArray(r.contacts_communs_json),
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

ensureDatabaseSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Serveur démarré sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('[SCHEMA INIT ERROR]', err);
    process.exit(1);
  });
