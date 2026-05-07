import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'simvigil_fallback_secret';
const JWT_EXPIRES = '8h';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Nom', 'X-User-Role'],
}));
app.use(express.json());

// Middleware : décode le JWT et remplit req.auditUser
app.use((req, _res, next) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      req.auditUser = {
        user_id:   payload.id   || 'inconnu',
        user_nom:  payload.nom  || 'inconnu',
        user_role: payload.role || 'inconnu',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      };
    } catch {
      req.auditUser = { user_id: 'inconnu', user_nom: 'inconnu', user_role: 'inconnu', ip: null };
    }
  } else {
    req.auditUser = { user_id: 'inconnu', user_nom: 'inconnu', user_role: 'inconnu', ip: null };
  }
  next();
});

// Middleware d'autorisation : vérifie que le rôle du token est autorisé
const requireRole = (...roles) => (req, res, next) => {
  const role = req.auditUser?.user_role;
  if (!role || role === 'inconnu' || !roles.includes(role)) {
    return res.status(403).json({ error: 'Accès refusé — rôle insuffisant' });
  }
  next();
};

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

/* ================= AUDIT ================= */

const logAudit = async (conn, { user_id, user_nom, user_role, action, entite_type = null, entite_id = null, operateur = null, details = null, ip = null }) => {
  try {
    await conn.query(
      `INSERT INTO audit_logs (id, user_id, user_nom, user_role, action, entite_type, entite_id, operateur, details_json, ip_address, date_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [uuidv4(), user_id || 'inconnu', user_nom || 'inconnu', user_role || 'inconnu', action, entite_type, entite_id, operateur, details ? JSON.stringify(details) : null, ip]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};

const ensureDatabaseSchema = async () => {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id   VARCHAR(50)  NOT NULL DEFAULT 'inconnu',
        user_nom  VARCHAR(120) NOT NULL DEFAULT 'inconnu',
        user_role VARCHAR(50)  NOT NULL DEFAULT 'inconnu',
        action    VARCHAR(100) NOT NULL,
        entite_type VARCHAR(50)  NULL,
        entite_id   VARCHAR(36)  NULL,
        operateur   VARCHAR(20)  NULL,
        details_json TEXT        NULL,
        ip_address  VARCHAR(45)  NULL,
        date_action DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
    const [indexes] = await conn.query(`
  SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'simbox_detectees'
    AND INDEX_NAME = 'idx_simbox_statut'
`);
if (indexes.length === 0) {
  await conn.query(`CREATE INDEX idx_simbox_statut ON simbox_detectees(statut)`);
}

    // Helper: add column only if it doesn't exist (MySQL-compatible)
    const addColumnIfMissing = async (table, column, definition) => {
      const [[row]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (row.cnt === 0) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    };

    // Migrations sim_analyses
    await addColumnIfMissing('sim_analyses', 'motif_refus',               'VARCHAR(255) NULL');
    await addColumnIfMissing('sim_analyses', 'details_refus',              'TEXT NULL');
    await addColumnIfMissing('sim_analyses', 'date_decision',              'DATETIME NULL');
    await addColumnIfMissing('sim_analyses', 'justificatif_confirmation',  'TEXT NULL');
    await addColumnIfMissing('sim_analyses', 'criteres_declencheurs',      'JSON NULL');

    // Migrations rapports
    await addColumnIfMissing('rapports', 'reference_unique', 'VARCHAR(40) NULL');
    await addColumnIfMissing('rapports', 'statut_rapport',   "ENUM('brouillon','envoye','consulte','traite') DEFAULT 'envoye'");
    await addColumnIfMissing('rapports', 'analyste_nom',     'VARCHAR(120) NULL');
    await addColumnIfMissing('rapports', 'date_signature',   'DATETIME NULL');
    await addColumnIfMissing('rapports', 'periode_debut',    'DATE NULL');
    await addColumnIfMissing('rapports', 'periode_fin',      'DATE NULL');
    await addColumnIfMissing('rapports', 'statut_lu',        'TINYINT(1) NOT NULL DEFAULT 0');

    // Table emails_simules
    await conn.query(`
      CREATE TABLE IF NOT EXISTS emails_simules (
        id VARCHAR(36) PRIMARY KEY,
        sanction_id VARCHAR(36) NOT NULL,
        destinataire VARCHAR(120) NOT NULL,
        sujet VARCHAR(255) NOT NULL,
        corps TEXT NOT NULL,
        operateur VARCHAR(20) NOT NULL,
        type_sanction ENUM('avertissement','mise_en_demeure') NOT NULL,
        date_envoi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table users
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        nom VARCHAR(120) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('AGENT_MTN','AGENT_AIRTEL','ANALYSTE','ARPCE') NOT NULL,
        operateur VARCHAR(20) NULL,
        actif TINYINT(1) NOT NULL DEFAULT 1,
        date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Insérer les utilisateurs initiaux avec mots de passe hachés (si absents)
    const seedUsers = [
      { id: 'u1', nom: 'BASSINGA BENIJAH',  email: 'agent.mtn@mtn.cg',      password: 'Mtn@2024!',    role: 'AGENT_MTN',    operateur: 'MTN' },
      { id: 'u2', nom: 'BOUINIE BENI',      email: 'agent.airtel@airtel.cg', password: 'Airtel@2024!', role: 'AGENT_AIRTEL', operateur: 'AIRTEL' },
      { id: 'u3', nom: 'BATOUMENI RICH',    email: 'analyste@arpce.cg',      password: 'Analyste@1!',  role: 'ANALYSTE',     operateur: null },
      { id: 'u4', nom: 'NGOUBOU ROCH',      email: 'controleur@arpce.cg',    password: 'Arpce@2024!',  role: 'ARPCE',        operateur: null },
    ];
    for (const u of seedUsers) {
      const [[exists]] = await conn.query('SELECT id FROM users WHERE id = ?', [u.id]);
      if (!exists) {
        const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
        await conn.query(
          'INSERT INTO users (id, nom, email, password, role, operateur) VALUES (?, ?, ?, ?, ?, ?)',
          [u.id, u.nom, u.email, hash, u.role, u.operateur]
        );
      }
    }

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

// D\u00e9tecte le s\u00e9parateur dominant dans un buffer CSV (virgule, point-virgule, tab, pipe)
const detectCsvDelimiter = (buffer) => {
  const sample = buffer.toString('utf8', 0, Math.min(3000, buffer.length));
  const firstLine = sample.split(/\r?\n/)[0] || '';
  const counts = {
    ',':  (firstLine.match(/,/g)  || []).length,
    ';':  (firstLine.match(/;/g)  || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|':  (firstLine.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

// Lit un fichier CDR (CSV ou Excel) et retourne les lignes JSON
const parseCdrFile = (buffer, originalname) => {
  const ext = originalname.split('.').pop().toLowerCase();
  let workbook;
  if (ext === 'csv') {
    const delimiter = detectCsvDelimiter(buffer);
    workbook = xlsx.read(buffer, { type: 'buffer', FS: delimiter });
  } else {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  }
  // Premi\u00e8re feuille non vide (\u00e9vite les feuilles de titre ou de garde)
  const sheetName = workbook.SheetNames.find(name => {
    const s = workbook.Sheets[name];
    return s && Object.keys(s).filter(k => !k.startsWith('!')).length > 2;
  }) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
};

const toDateTimeString = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    // Unix timestamp en secondes (> 1 milliard) ou en millisecondes (> 1 billion)
    if (value > 1_000_000_000) {
      const ts = value > 1_000_000_000_000 ? value : value * 1000;
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
        return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    // Code de date Excel (valeurs < 100 000)
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = new Date(Date.UTC(
      parsed.y, parsed.m - 1, parsed.d,
      parsed.H || 0, parsed.M || 0, parsed.S || 0,
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

  // Unix timestamp en chaîne (10 chiffres = secondes, 13 = millisecondes)
  if (/^\d{10}$/.test(raw)) {
    const d = new Date(Number(raw) * 1000);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
      return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (/^\d{13}$/.test(raw)) {
    const d = new Date(Number(raw));
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
      return d.toISOString().slice(0, 19).replace('T', ' ');
  }

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
      Number(y), Number(m) - 1, Number(d),
      Number(hh), Number(mm), Number(ss),
    );
    if (!Number.isNaN(date.getTime()))
      return date.toISOString().slice(0, 19).replace('T', ' ');
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
    // Standards internationaux
    'msisdn', 'msisdn_a', 'a_msisdn', 'a_number', 'a_party', 'a_party_number',
    'calling_number', 'calling_party', 'calling_msisdn', 'caller', 'caller_id',
    'ani', 'cli', 'originating_number', 'originating_msisdn', 'originating',
    'origin_number', 'origine_number', 'imsi_msisdn',
    // Noms français courants (opérateurs africains)
    'numero_sim', 'numero_appelant', 'numero_a', 'msisdn_appelant',
    'abonnee', 'abonnee_a', 'abonne_a', 'abonne', 'subscriber',
    // Noms génériques
    'sim', 'source', 'from', 'src', 'phone', 'numero', 'msisdn_source',
  ],
  numero_appele: [
    // Standards internationaux
    'b_number', 'b_msisdn', 'msisdn_b', 'b_party', 'b_party_number',
    'called_number', 'called_party', 'called_msisdn', 'called', 'callee',
    'dialed', 'dialed_number', 'dnis', 'destination', 'destination_number',
    'terminating', 'terminating_number', 'terminating_msisdn',
    // Noms français courants
    'numero_appele', 'numero_appelé', 'numero_destination', 'numero_b',
    'msisdn_appele', 'abonnee_b', 'abonne_b',
    // Noms génériques
    'to', 'dst', 'dest', 'b_calling',
  ],
  date_heure: [
    // Standards internationaux
    'datetime', 'timestamp', 'start_time', 'start_datetime', 'call_start',
    'call_time', 'call_date', 'call_timestamp', 'call_begin', 'call_date_time',
    'event_time', 'begin_time', 'answer_time', 'setup_time', 'record_date',
    'start', 'time',
    // Noms français courants (opérateurs africains)
    'date_heure', 'date_appel', 'heure_appel', 'date_debut', 'heure_debut',
    'date_debut_appel', 'debut_appel', 'date_et_heure', 'date_time',
    'date', 'heure',
    // Autres
    'call_start_time', 'start_date_time', 'origination_time',
  ],
  duree_secondes: [
    // Standards internationaux
    'duration', 'duration_sec', 'duration_seconds', 'call_duration',
    'billsec', 'billed_duration', 'charged_duration', 'talk_time',
    'conversation_time', 'holding_time', 'call_length', 'elapsed', 'seconds',
    // Noms français courants
    'duree_secondes', 'duree_sec', 'duree', 'duree_appel', 'duree_communication',
    'duree_facturee', 'duree_en_secondes',
    // Noms génériques
    'length', 'total_duration',
  ],
  statut_appel: [
    // Standards internationaux
    'status', 'call_status', 'call_result', 'call_state', 'disposition',
    'outcome', 'answer_status', 'release_cause', 'termination_cause',
    'release_cause_code', 'cause_code',
    // Noms français courants
    'statut_appel', 'statut', 'etat', 'etat_appel', 'cause_fin',
    'cause_liberation', 'resultat', 'resultat_appel',
    // Noms génériques
    'result',
  ],
  origine: [
    // Standards internationaux
    'call_type', 'traffic_type', 'traffic', 'call_direction', 'direction',
    'service_type', 'call_nature', 'roaming_flag', 'in_out', 'traffic_case',
    // Noms français courants (opérateurs africains)
    'origine', 'nature', 'service', 'type_appel', 'type_trafic',
    'sens_appel', 'type_communication', 'sens', 'type_traffic',
    // Noms génériques
    'type',
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

// Retire le préfixe international (+242 / 00242 / 242) pour normaliser le numéro
const stripPrefixCongo = (numero) =>
  String(numero || '').replace(/\s+/g, '').replace(/^(\+242|00242|242)/, '');

// Vérifie que le numero_sim appartient bien à l'opérateur qui importe
const isSimValide = (numero, operateur) => {
  const n = stripPrefixCongo(numero);
  if (operateur === 'MTN')    return /^06\d{7}$/.test(n);
  if (operateur === 'AIRTEL') return /^0[45]\d{7}$/.test(n);
  return true; // opérateur inconnu ou TOUS : pas de filtre
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
app.post('/api/cdr/detect-columns', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Fichier requis' });

  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    return res.status(400).json({ error: 'Format non supporté (csv, xlsx, xls)' });
  }

  let rows = [];
  try {
    rows = parseCdrFile(file.buffer, file.originalname);
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

app.post('/api/cdr/upload', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), upload.single('file'), async (req, res) => {
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
    rows = parseCdrFile(file.buffer, file.originalname);
  } catch {
    return res.status(400).json({ error: 'Impossible de lire le fichier' });
  }

  const cdrId = uuidv4();
  const dateImport = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const cdrLineEntities = [];
  let lignesRejetees = 0;
  let lignesMauvaisOperateur = 0;

  for (const row of rows) {
    const numero_sim = String(row[mapping.numero_sim] ?? '').trim();
    if (!numero_sim) { lignesRejetees++; continue; }

    // Validation préfixe opérateur — seul numero_sim est contrôlé
    if (!isSimValide(numero_sim, operateur.toUpperCase())) {
      lignesMauvaisOperateur++;
      lignesRejetees++;
      continue;
    }

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

  // Si plus de 80% des lignes ont un mauvais préfixe opérateur → c'est le mauvais fichier
  const totalLignes = rows.length;
  if (totalLignes > 5 && lignesMauvaisOperateur / totalLignes > 0.8) {
    const prefixes = operateur.toUpperCase() === 'MTN'
      ? '06XXXXXXX ou 0024206XXXXXXX'
      : '04XXXXXXX, 05XXXXXXX, 0024204XXXXXXX ou 0024205XXXXXXX';
    return res.status(400).json({
      error: `Ce fichier ne correspond pas à l'opérateur ${operateur.toUpperCase()}. `
        + `${lignesMauvaisOperateur} numéros sur ${totalLignes} ne respectent pas les préfixes attendus (${prefixes}). `
        + `Vérifiez que vous importez le bon fichier CDR.`,
    });
  }

  if (cdrLineEntities.length === 0) {
    return res.status(400).json({
      error: `Aucune ligne valide. ${lignesRejetees} ligne(s) rejetée(s). Vérifiez au minimum les colonnes SIM, numéro appelé, date/heure et durée.`,
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Bloquer le double import du même fichier
    const [existing] = await conn.query(
      'SELECT id FROM cdr_files WHERE nom_fichier = ? AND operateur = ? AND agent_id = ?',
      [file.originalname, operateur.toUpperCase(), agent_id]
    );
    if (existing.length > 0) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({ error: `Ce fichier a déjà été importé : "${file.originalname}". Supprimez l'existant avant de le réimporter.` });
    }

    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cdrId, file.originalname, dateImport, cdrLineEntities.length, 'en_attente', operateur.toUpperCase(), agent_id]
    );

    await conn.query(
      'INSERT INTO cdr_lines VALUES ?',
      [cdrLineEntities]
    );

    await conn.commit();
    await logAudit(conn, {
      ...req.auditUser,
      action: 'IMPORT_CDR',
      entite_type: 'cdr_file', entite_id: cdrId, operateur: operateur.toUpperCase(),
      details: { fichier: file.originalname, nb_lignes: cdrLineEntities.length, nb_rejetes: lignesRejetees },
    });
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

app.patch('/api/cdr/analyses/:id', requireRole('ANALYSTE'), async (req, res) => {
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
      [statut, motif_refus || null, details_refus || null, justificatif_confirmation || null, id]
    );
    const [[sim]] = await conn.query('SELECT numero_sim, operateur FROM sim_analyses WHERE id=?', [id]);
    await logAudit(conn, {
      ...req.auditUser,
      action: statut === 'confirmee' ? 'CONFIRMER_SIM' : 'REFUSER_SIM',
      entite_type: 'sim_analyse', entite_id: id,
      operateur: sim?.operateur || null,
      details: { numero_sim: sim?.numero_sim, motif_refus: motif_refus || null },
    });
    res.json({ success: true });

  } catch (err) {
    console.error('[ANALYSES PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });

  } finally {
    conn.release();
  }
});

/* ================= RAPPORTS ================= */

app.post('/api/rapports/envoyer-arpce', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
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

    await conn.beginTransaction();

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

    await conn.commit();
    await logAudit(conn, {
      ...req.auditUser,
      action: 'ENVOYER_RAPPORT_ARPCE',
      entite_type: 'rapport', entite_id: rapportId, operateur,
      details: { reference, nb_sims: sims.length },
    });
    res.json({ success: true, rapport_id: rapportId, reference_unique: reference });

  } catch (err) {
    await conn.rollback();
    console.error('[RAPPORTS ARPCE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });

  } finally {
    conn.release();
  }
});

app.post('/api/rapports/envoyer-agent', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
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
    await logAudit(conn, {
      ...req.auditUser,
      action: 'ENVOYER_RAPPORT_AGENT',
      entite_type: 'rapport', entite_id: rapportId, operateur,
      details: { reference, nb_sims: sims.length },
    });
    res.json({ success: true, rapport_id: rapportId, operateur, reference_unique: reference });
  } catch (err) {
    console.error('[RAPPORTS AGENT ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.post('/api/analyste/rapports/generer', requireRole('ANALYSTE'), async (req, res) => {
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
    // Bloquer la génération d'un rapport en double sur la même période
    const [doublon] = await conn.query(
      `SELECT id FROM rapports
       WHERE expediteur_role = 'analyste_fraude'
         AND destinataire_role = ?
         AND operateur = ?
         AND periode_debut = ?
         AND periode_fin = ?
         AND statut_rapport != 'brouillon'`,
      [destinataire, operateur, date_debut, date_fin]
    );
    if (doublon.length > 0) {
      conn.release();
      return res.status(409).json({
        error: `Un rapport a déjà été envoyé pour cette période (${date_debut} → ${date_fin}) et cet opérateur. Modifiez la période ou l'opérateur.`,
      });
    }

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
    await logAudit(conn, {
      ...req.auditUser,
      action: 'GENERER_RAPPORT',
      entite_type: 'rapport', entite_id: rapportId, operateur,
      details: { reference, destinataire, nb_sims: rows.length, date_debut, date_fin },
    });
    res.status(201).json(normalizeReportRow(rapport));
  } catch (err) {
    console.error('[ANALYSTE RAPPORT GENERER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du rapport' });
  } finally {
    conn.release();
  }
});

app.post('/api/rapports/:id/envoyer', requireRole('ANALYSTE'), async (req, res) => {
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
    await logAudit(conn, {
      ...req.auditUser,
      action: 'ENVOYER_RAPPORT',
      entite_type: 'rapport', entite_id: id,
      operateur: rapport.operateur,
      details: { reference: rapport.reference_unique, destinataire: rapport.destinataire_role },
    });
    res.json(normalizeReportRow(updated));
  } catch (err) {
    console.error('[RAPPORT ENVOI ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'envoi du rapport' });
  } finally {
    conn.release();
  }
});

app.patch('/api/rapports/:id/statut', requireRole('ARPCE'), async (req, res) => {
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

app.get('/api/cdr/files', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (_req, res) => {
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

app.get('/api/cdr/sim/:msisdn/historique', requireRole('ANALYSTE', 'ARPCE'), async (req, res) => {
  const { msisdn } = req.params;
  const conn = await pool.getConnection();
  try {
    const [lignes] = await conn.query(
      `SELECT cl.*, cf.nom_fichier, cf.date_import
       FROM cdr_lines cl
       JOIN cdr_files cf ON cl.cdr_id = cf.id
       WHERE cl.numero_sim = ?
       ORDER BY cl.date_heure DESC`,
      [msisdn]
    );

    const total = lignes.length;
    const totalDuree = lignes.reduce((s, l) => s + (l.duree_secondes || 0), 0);
    const aboutis = lignes.filter(l => l.statut_appel === 'abouti').length;
    const internationaux = lignes.filter(l => l.origine === 'international').length;
    const numerosAppeles = new Set(lignes.map(l => l.numero_appele)).size;
    const dureeMax = Math.max(...lignes.map(l => l.duree_secondes || 0), 0);
    const dureeMoy = total > 0 ? Math.round(totalDuree / total) : 0;

    // appels par heure (sur toute la période)
    let appelsParHeure = 0;
    if (total > 1) {
      const dates = lignes.map(l => new Date(l.date_heure).getTime());
      const dureesPeriode = (Math.max(...dates) - Math.min(...dates)) / 3600000;
      appelsParHeure = dureesPeriode > 0 ? Math.round(total / dureesPeriode) : total;
    }

    res.json({
      stats: {
        total,
        totalDuree,
        dureeMoy,
        dureeMax,
        aboutis,
        echoues: total - aboutis,
        tauxAboutissement: total > 0 ? Math.round((aboutis / total) * 100) : 0,
        internationaux,
        nationaux: total - internationaux,
        tauxInternational: total > 0 ? Math.round((internationaux / total) * 100) : 0,
        numerosAppeles,
        appelsParHeure,
      },
      lignes,
    });
  } catch (err) {
    console.error('[SIM HISTORIQUE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/cdr/analyses', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const role = req.auditUser?.user_role;
    let query = 'SELECT * FROM sim_analyses';
    const params = [];
    // Les agents ne voient que les données de leur opérateur
    if (role === 'AGENT_MTN') {
      query += ' WHERE operateur = ?'; params.push('MTN');
    } else if (role === 'AGENT_AIRTEL') {
      query += ' WHERE operateur = ?'; params.push('AIRTEL');
    }
    query += ' ORDER BY date_analyse DESC';
    const [rows] = await conn.query(query, params);
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

app.get('/api/rapports', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
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
    query += ' ORDER BY date_envoi DESC LIMIT 200';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(normalizeReportRow));
  } catch (err) {
    console.error('[RAPPORTS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.get('/api/ordres', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ARPCE'), async (_req, res) => {
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

app.get('/api/sanctions', requireRole('ARPCE'), async (_req, res) => {
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

app.patch('/api/ordres/:id/bloquer', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("UPDATE ordres_blocage SET statut = 'bloque' WHERE id = ?", [req.params.id]);
    const [[ordre]] = await conn.query('SELECT operateur FROM ordres_blocage WHERE id=?', [req.params.id]);
    await logAudit(conn, {
      ...req.auditUser,
      action: 'CONFIRMER_BLOCAGE',
      entite_type: 'ordre_blocage', entite_id: req.params.id,
      operateur: ordre?.operateur || null,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[ORDRES BLOQUER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.post('/api/ordres/bloquer', requireRole('ARPCE'), async (req, res) => {
  const { rapport_id, operateur, liste_sim, delai_heures = 48 } = req.body;
  const conn = await pool.getConnection();
  try {
    const ordreId = uuidv4();
    const dateLimite = new Date(Date.now() + delai_heures * 3600 * 1000);
    await conn.query(
      'INSERT INTO ordres_blocage (id, rapport_id, operateur, liste_sim_json, delai_heures, date_limite) VALUES (?, ?, ?, ?, ?, ?)',
      [ordreId, rapport_id, operateur, JSON.stringify(liste_sim), delai_heures, dateLimite]
    );
    if (rapport_id) {
      await conn.query(
        "UPDATE rapports SET statut_rapport='traite', statut_lu=TRUE WHERE id = ?",
        [rapport_id]
      );
    }
    await logAudit(conn, {
      ...req.auditUser,
      action: 'EMETTRE_BLOCAGE',
      entite_type: 'ordre_blocage', entite_id: ordreId, operateur,
      details: { nb_sims: Array.isArray(liste_sim) ? liste_sim.length : 0, delai_heures, date_limite: dateLimite },
    });
    res.json({ success: true, ordre_id: ordreId, date_limite: dateLimite });
  } catch (err) {
    console.error('[ORDRES CREER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= SANCTIONS ================= */

app.post('/api/sanctions/avertir', requireRole('ARPCE'), async (req, res) => {
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
    const [[existingAvertissement]] = await conn.query(
      "SELECT id FROM sanctions WHERE ordre_blocage_id = ? AND type = 'avertissement'",
      [ordre_id]
    );
    const [[existingMiseEnDemeure]] = await conn.query(
      "SELECT id FROM sanctions WHERE ordre_blocage_id = ? AND type = 'mise_en_demeure'",
      [ordre_id]
    );
    if (existingMiseEnDemeure) {
      conn.release();
      return res.status(409).json({ error: 'Sanction maximale (mise en demeure) déjà appliquée sur cet ordre.' });
    }
    const sanctionType = existingAvertissement ? 'mise_en_demeure' : 'avertissement';
    const sanctionId = uuidv4();
    const emailCible = operateur === 'MTN' ? 'agent.mtn@mtn.cg' : 'agent.airtel@airtel.cg';
    const logMessage = sanctionType === 'mise_en_demeure'
      ? `Mise en demeure émise le ${new Date().toISOString()} — Récidive : avertissement précédent ignoré`
      : `Avertissement envoyé le ${new Date().toISOString()} — SIM non bloquée dans le délai imparti`;
    await conn.query(
      'INSERT INTO sanctions (id, ordre_blocage_id, operateur, type, email_envoye, log_details) VALUES (?, ?, ?, ?, ?, ?)',
      [sanctionId, ordre_id, operateur, sanctionType, emailCible, logMessage]
    );
    // Enregistrer l'email simulé pour affichage dans l'UI
    const sujet = sanctionType === 'mise_en_demeure'
      ? `[ARPCE] MISE EN DEMEURE — Non-conformité persistante opérateur ${operateur}`
      : `[ARPCE] AVERTISSEMENT — SIM Box détectée non bloquée — ${operateur}`;
    const corps = sanctionType === 'mise_en_demeure'
      ? `Madame, Monsieur,\n\nMalgré l'avertissement précédemment adressé, les SIM Box identifiées n'ont pas été bloquées dans le délai réglementaire imparti.\n\nEn application des dispositions de la loi n°009-2009 sur les télécommunications au Congo, l'ARPCE vous adresse la présente mise en demeure.\n\nVous disposez de 72 heures pour vous conformer, sous peine de sanctions financières et/ou administratives.\n\nL'Autorité de Régulation des Postes et Communications Électroniques (ARPCE)\nDirection du Contrôle et de la Conformité`
      : `Madame, Monsieur,\n\nNous avons détecté des SIM Box actives sur votre réseau ${operateur} lors de nos contrôles automatiques. Ces SIM Box n'ont pas été bloquées dans le délai réglementaire prescrit.\n\nConformément aux textes en vigueur, vous êtes formellement averti(e) de procéder au blocage immédiat de ces équipements frauduleux.\n\nToute récidive fera l'objet d'une mise en demeure.\n\nL'Autorité de Régulation des Postes et Communications Électroniques (ARPCE)`;
    await conn.query(
      'INSERT INTO emails_simules (id, sanction_id, destinataire, sujet, corps, operateur, type_sanction) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), sanctionId, emailCible, sujet, corps, operateur, sanctionType]
    );
    await logAudit(conn, {
      ...req.auditUser,
      action: 'EMETTRE_SANCTION',
      entite_type: 'sanction', entite_id: sanctionId, operateur,
      details: { ordre_id, email_envoye: emailCible, type: sanctionType },
    });
    res.json({ success: true, sanction_id: sanctionId, email_envoye: emailCible, type: sanctionType });
  } catch (err) {
    console.error('[SANCTIONS AVERTIR ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= AGREGATION ================= */

// Retourner les fichiers CDR en attente d'agrégation pour un opérateur
app.get('/api/cdr/fichiers-en-attente', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur } = req.query;
  if (!operateur) return res.status(400).json({ error: 'operateur requis' });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT cf.id, cf.nom_fichier, cf.date_import, cf.nb_lignes, cf.statut, cf.operateur,
              MIN(cl.date_heure) AS date_debut_donnees,
              MAX(cl.date_heure) AS date_fin_donnees
       FROM cdr_files cf
       LEFT JOIN cdr_lines cl ON cl.cdr_id = cf.id
       WHERE cf.operateur = ? AND cf.statut = 'en_attente'
       GROUP BY cf.id
       ORDER BY cf.date_import DESC`,
      [operateur]
    );
    res.json(rows);
  } catch (err) {
    console.error('[FICHIERS EN ATTENTE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Lancer l'agrégation : regroupe toutes les lignes des fichiers sélectionnés et analyse par SIM
app.post('/api/cdr/agreger', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur, cdr_file_ids, agent_id } = req.body;

  if (!operateur || !agent_id || !Array.isArray(cdr_file_ids) || cdr_file_ids.length === 0) {
    return res.status(400).json({ error: 'operateur, agent_id et cdr_file_ids (tableau) requis' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Vérifier que tous les fichiers appartiennent à cet opérateur et sont en_attente
    const placeholders = cdr_file_ids.map(() => '?').join(',');
    const [fichiers] = await conn.query(
      `SELECT id, nom_fichier FROM cdr_files WHERE id IN (${placeholders}) AND operateur = ? AND statut = 'en_attente'`,
      [...cdr_file_ids, operateur]
    );

    if (fichiers.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Aucun fichier valide sélectionné' });
    }

    const validIds = fichiers.map(f => f.id);
    const validPlaceholders = validIds.map(() => '?').join(',');

    // Récupérer les lignes CDR des fichiers sélectionnés (DISTINCT pour éviter doublons)
    const [lines] = await conn.query(
      `SELECT DISTINCT cl.numero_sim, cl.numero_appele, cl.date_heure,
              cl.duree_secondes, cl.statut_appel, cl.origine, cl.operateur
       FROM cdr_lines cl
       WHERE cl.cdr_id IN (${validPlaceholders})`,
      validIds
    );

    if (lines.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Aucune ligne CDR dans les fichiers sélectionnés' });
    }

    const nomFichiers = fichiers.map(f => f.nom_fichier).join(', ');
    const nomAgregation = `Agrégation ${operateur} — ${fichiers.length} fichier(s) — ${new Date().toISOString().slice(0, 10)}`;

    // Créer un fichier CDR virtuel représentant l'agrégation
    const cdrVirtuelId = uuidv4();
    const dateAgregation = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query(
      'INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cdrVirtuelId, nomAgregation, dateAgregation, lines.length, 'analyse', operateur, agent_id]
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
          analysis.id, cdrVirtuelId, analysis.numero_sim, analysis.operateur,
          analysis.score_suspicion, analysis.niveau_alerte, analysis.statut,
          analysis.date_analyse, JSON.stringify(analysis.criteres),
        ]
      );
    }

    // Marquer les fichiers sources comme analysés
    await conn.query(
      `UPDATE cdr_files SET statut = 'analyse' WHERE id IN (${validPlaceholders})`,
      validIds
    );

    await conn.commit();
    await logAudit(conn, {
      ...req.auditUser,
      action: 'AGREGER_CDR',
      entite_type: 'cdr_file', entite_id: cdrVirtuelId, operateur,
      details: { fichiers: nomFichiers, nb_fichiers: fichiers.length, nb_lignes: lines.length,
        nb_sims: analyses.length, nb_critiques: analyses.filter(a => a.niveau_alerte === 'critique').length },
    });
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
app.post('/api/cdr/detecter-simbox', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
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
    await logAudit(conn, {
      ...req.auditUser,
      action: 'DETECTER_SIMBOX',
      entite_type: 'simbox', entite_id: null, operateur,
      details: { date_debut, date_fin, nb_groupes: groupes.length,
        nb_sims: groupes.reduce((a, g) => a + g.nb_sims, 0),
        nb_confirmes: groupes.filter(g => g.niveau === 'confirme').length },
    });
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
app.get('/api/simbox', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
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
app.patch('/api/simbox/:id', requireRole('ANALYSTE'), async (req, res) => {
  const { id } = req.params;
  const { statut, motif_rejet } = req.body;
  const VALID = ['validee', 'rejetee'];
  if (!VALID.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  if (statut === 'rejetee' && !motif_rejet) return res.status(400).json({ error: 'Motif requis' });

  const conn = await pool.getConnection();
  try {
    await conn.query('UPDATE simbox_detectees SET statut = ?, motif_rejet = ? WHERE id = ?', [statut, motif_rejet || null, id]);
    const [[sb]] = await conn.query('SELECT operateur, nb_sims FROM simbox_detectees WHERE id=?', [id]);
    await logAudit(conn, {
      ...req.auditUser,
      action: statut === 'validee' ? 'VALIDER_SIMBOX' : 'REJETER_SIMBOX',
      entite_type: 'simbox', entite_id: id,
      operateur: sb?.operateur || null,
      details: { nb_sims: sb?.nb_sims, motif_rejet: motif_rejet || null },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[SIMBOX PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= JOURNAL D'AUDIT ================= */

app.get('/api/audit', requireRole('ARPCE'), async (req, res) => {
  const { action, user_role, operateur, date_debut, date_fin, limit = 100, offset = 0 } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action)     { query += ' AND action = ?';     params.push(action); }
    if (user_role)  { query += ' AND user_role = ?';  params.push(user_role); }
    if (operateur)  { query += ' AND operateur = ?';  params.push(operateur); }
    if (date_debut) { query += ' AND date_action >= ?'; params.push(date_debut); }
    if (date_fin)   { query += ' AND date_action <= DATE_ADD(?, INTERVAL 1 DAY)'; params.push(date_fin); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await conn.query(countQuery, params);

    query += ' ORDER BY date_action DESC LIMIT ? OFFSET ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 500), Math.max(parseInt(offset, 10) || 0, 0));

    const [rows] = await conn.query(query, params);
    res.json({
      total,
      logs: rows.map(r => ({
        ...r,
        details_json: r.details_json
          ? (typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json)
          : null,
      })),
    });
  } catch (err) {
    console.error('[AUDIT GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= AUTHENTIFICATION ================= */

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query(
      'SELECT id, nom, email, role, operateur, password AS hash FROM users WHERE email = ? AND actif = 1',
      [email]
    );
    if (!row) return res.status(401).json({ error: 'Identifiants incorrects' });
    const valid = await bcrypt.compare(password, row.hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const { hash: _h, ...user } = row;
    const token = jwt.sign(
      { id: user.id, nom: user.nom, role: user.role, operateur: user.operateur },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ user, token });
  } catch (err) {
    console.error('[AUTH LOGIN ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= EMAILS SIMULES ================= */

app.get('/api/emails', requireRole('ARPCE'), async (req, res) => {
  const { operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM emails_simules';
    const params = [];
    if (operateur && operateur !== 'TOUS') {
      query += ' WHERE operateur = ?';
      params.push(operateur);
    }
    query += ' ORDER BY date_envoi DESC LIMIT 50';
    const [rows] = await conn.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[EMAILS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= GESTION UTILISATEURS ================= */

const VALID_ROLES = ['AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'];
const VALID_OPERATEURS_USER = ['MTN', 'AIRTEL'];

app.get('/api/users', requireRole('ARPCE'), async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id, nom, email, role, operateur, date_creation FROM users ORDER BY date_creation ASC');
    res.json(rows);
  } catch (err) {
    console.error('[USERS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.post('/api/users', requireRole('ARPCE'), async (req, res) => {
  const { nom, email, role, operateur = null, password } = req.body;
  if (!nom || !email || !role || !password) {
    return res.status(400).json({ error: 'nom, email, role et password sont requis' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  if (operateur && !VALID_OPERATEURS_USER.includes(operateur)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }
  const conn = await pool.getConnection();
  try {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await conn.query(
      'INSERT INTO users (id, nom, email, role, operateur, password) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nom, email, role, operateur || null, hashedPassword]
    );
    await logAudit(conn, {
      ...req.auditUser,
      action: 'CREER_UTILISATEUR',
      entite_type: 'user', entite_id: id,
      details: { nom, email, role },
    });
    const [[user]] = await conn.query('SELECT id, nom, email, role, operateur, date_creation FROM users WHERE id = ?', [id]);
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    console.error('[USERS POST ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.patch('/api/users/:id', requireRole('ARPCE'), async (req, res) => {
  const { id } = req.params;
  const { nom, email, role, operateur, password } = req.body;
  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  if (operateur && !VALID_OPERATEURS_USER.includes(operateur)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = [];
    const vals = [];
    if (nom)      { fields.push('nom = ?');      vals.push(nom); }
    if (email)    { fields.push('email = ?');    vals.push(email); }
    if (role)     { fields.push('role = ?');     vals.push(role); }
    if (operateur !== undefined) { fields.push('operateur = ?'); vals.push(operateur || null); }
    if (password) { fields.push('password = ?'); vals.push(await bcrypt.hash(password, BCRYPT_ROUNDS)); }
    if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    vals.push(id);
    await conn.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[user]] = await conn.query('SELECT id, nom, email, role, operateur, date_creation FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await logAudit(conn, {
      ...req.auditUser,
      action: 'MODIFIER_UTILISATEUR',
      entite_type: 'user', entite_id: id,
      details: { champs: fields.map(f => f.split(' ')[0]) },
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    console.error('[USERS PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

app.delete('/api/users/:id', requireRole('ARPCE'), async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query('SELECT id, nom, email, role FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await conn.query('DELETE FROM users WHERE id = ?', [id]);
    await logAudit(conn, {
      ...req.auditUser,
      action: 'SUPPRIMER_UTILISATEUR',
      entite_type: 'user', entite_id: id,
      details: { nom: user.nom, email: user.email, role: user.role },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS DELETE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

/* ================= SERVER ================= */

const port = process.env.PORT || 4000;

const waitForDb = async (retries = 10, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      return; // connexion OK
    } catch (err) {
      console.log(`[DB] MySQL pas encore prêt, tentative ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Impossible de se connecter à MySQL après plusieurs tentatives');
};

waitForDb()
  .then(() => ensureDatabaseSchema())
  .then(() => {
    app.listen(port, () => {
      console.log(`Serveur démarré sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('[SCHEMA INIT ERROR]', err);
    process.exit(1);
  });
