import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const BCRYPT_ROUNDS = 10;

export const logAudit = async (conn, {
  user_id, user_nom, user_role, action,
  entite_type = null, entite_id = null,
  operateur = null, details = null, ip = null,
}) => {
  try {
    await conn.query(
      `INSERT INTO audit_logs
        (id, user_id, user_nom, user_role, action, entite_type, entite_id, operateur, details_json, ip_address, date_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [uuidv4(), user_id || 'inconnu', user_nom || 'inconnu', user_role || 'inconnu',
       action, entite_type, entite_id, operateur, details ? JSON.stringify(details) : null, ip]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};

export const ensureDatabaseSchema = async () => {
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

    await addColumnIfMissing('sim_analyses', 'motif_refus',              'VARCHAR(255) NULL');
    await addColumnIfMissing('sim_analyses', 'details_refus',             'TEXT NULL');
    await addColumnIfMissing('sim_analyses', 'date_decision',             'DATETIME NULL');
    await addColumnIfMissing('sim_analyses', 'justificatif_confirmation', 'TEXT NULL');
    await addColumnIfMissing('sim_analyses', 'criteres_declencheurs',     'JSON NULL');

    await addColumnIfMissing('rapports', 'reference_unique', 'VARCHAR(40) NULL');
    await addColumnIfMissing('rapports', 'statut_rapport',   "ENUM('brouillon','envoye','consulte','traite') DEFAULT 'envoye'");
    await addColumnIfMissing('rapports', 'analyste_nom',     'VARCHAR(120) NULL');
    await addColumnIfMissing('rapports', 'date_signature',   'DATETIME NULL');
    await addColumnIfMissing('rapports', 'periode_debut',    'DATE NULL');
    await addColumnIfMissing('rapports', 'periode_fin',      'DATE NULL');
    await addColumnIfMissing('rapports', 'statut_lu',        'TINYINT(1) NOT NULL DEFAULT 0');

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

    const seedUsers = [
      { id: 'u1', nom: 'BASSINGA BENIJAH', email: 'agent.mtn@mtn.cg',      password: 'Mtn@2024!',    role: 'AGENT_MTN',    operateur: 'MTN'   },
      { id: 'u2', nom: 'BOUINIE BENI',     email: 'agent.airtel@airtel.cg', password: 'Airtel@2024!', role: 'AGENT_AIRTEL', operateur: 'AIRTEL'},
      { id: 'u3', nom: 'BATOUMENI RICH',   email: 'analyste@arpce.cg',      password: 'Analyste@1!',  role: 'ANALYSTE',     operateur: null    },
      { id: 'u4', nom: 'NGOUBOU ROCH',     email: 'controleur@arpce.cg',    password: 'Arpce@2024!',  role: 'ARPCE',        operateur: null    },
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
