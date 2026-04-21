CREATE DATABASE IF NOT EXISTS soutenance; 
USE soutenance;

CREATE TABLE IF NOT EXISTS cdr_files (
  id VARCHAR(36) PRIMARY KEY,
  nom_fichier VARCHAR(255) NOT NULL,
  date_import DATETIME NOT NULL,
  nb_lignes INT NOT NULL,
  statut ENUM('en_attente','analyse') NOT NULL DEFAULT 'analyse',
  operateur ENUM('MTN','AIRTEL','TOUS') NOT NULL,
  agent_id VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS cdr_lines (
  id VARCHAR(36) PRIMARY KEY,
  cdr_id VARCHAR(36) NOT NULL,
  numero_sim VARCHAR(50) NOT NULL,
  numero_appele VARCHAR(50) NOT NULL,
  date_heure DATETIME NOT NULL,
  duree_secondes INT NOT NULL,
  statut_appel ENUM('abouti','echoue') NOT NULL,
  origine ENUM('national','international') NOT NULL,
  operateur ENUM('MTN','AIRTEL','TOUS') NOT NULL,
  FOREIGN KEY (cdr_id) REFERENCES cdr_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sim_analyses (
  id VARCHAR(36) PRIMARY KEY,
  cdr_id VARCHAR(36) NOT NULL,
  numero_sim VARCHAR(50) NOT NULL,
  operateur ENUM('MTN','AIRTEL','TOUS') NOT NULL,
  score_suspicion INT NOT NULL,
  niveau_alerte ENUM('normale','elevee','critique') NOT NULL,
  statut ENUM('en_attente','confirmee','refusee') NOT NULL DEFAULT 'en_attente',
  date_analyse DATETIME NOT NULL,
  criteres JSON NOT NULL,
  FOREIGN KEY (cdr_id) REFERENCES cdr_files(id) ON DELETE CASCADE
);

ALTER TABLE sim_analyses 
ADD COLUMN motif_refus VARCHAR(255) NULL,
ADD COLUMN details_refus TEXT NULL,
ADD COLUMN date_decision DATETIME NULL;


ALTER TABLE sim_analyses
ADD COLUMN justificatif_confirmation TEXT NULL,
ADD COLUMN criteres_declencheurs JSON NULL;

CREATE TABLE IF NOT EXISTS rapports (
  id VARCHAR(36) PRIMARY KEY,
  type ENUM('simbox','cdr','blocage','sanction') NOT NULL,
  expediteur_role VARCHAR(50) NOT NULL,
  destinataire_role VARCHAR(50) NOT NULL,
  operateur VARCHAR(20) NULL,
  contenu_json TEXT NOT NULL,
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
  statut_lu BOOLEAN DEFAULT FALSE
);

ALTER TABLE rapports ADD COLUMN IF NOT EXISTS reference_unique VARCHAR(40) NULL;
ALTER TABLE rapports ADD COLUMN IF NOT EXISTS statut_rapport ENUM('brouillon','envoye','consulte','traite') DEFAULT 'envoye';
ALTER TABLE rapports ADD COLUMN IF NOT EXISTS analyste_nom VARCHAR(120) NULL;
ALTER TABLE rapports ADD COLUMN IF NOT EXISTS date_signature DATETIME NULL;
ALTER TABLE rapports ADD COLUMN IF NOT EXISTS periode_debut DATE NULL;
ALTER TABLE rapports ADD COLUMN IF NOT EXISTS periode_fin DATE NULL;

CREATE TABLE IF NOT EXISTS ordres_blocage (
  id VARCHAR(36) PRIMARY KEY,
  rapport_id VARCHAR(36) NOT NULL,
  operateur VARCHAR(20) NOT NULL,
  liste_sim_json TEXT NOT NULL,
  delai_heures INT DEFAULT 48,
  date_emission DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_limite DATETIME NOT NULL,
  statut ENUM('en_attente','bloque','depasse') DEFAULT 'en_attente',
  FOREIGN KEY (rapport_id) REFERENCES rapports(id)
);

CREATE TABLE IF NOT EXISTS sanctions (
  id VARCHAR(36) PRIMARY KEY,
  ordre_blocage_id VARCHAR(36) NOT NULL,
  operateur VARCHAR(20) NOT NULL,
  date_sanction DATETIME DEFAULT CURRENT_TIMESTAMP,
  type ENUM('avertissement','mise_en_demeure') DEFAULT 'avertissement',
  email_envoye VARCHAR(255),
  log_details TEXT,
  FOREIGN KEY (ordre_blocage_id) REFERENCES ordres_blocage(id)
);

-- Correction : ajout nb_lignes si absent
ALTER TABLE cdr_files ADD COLUMN IF NOT EXISTS nb_lignes INT DEFAULT 0;

-- Table des simbox détectées (groupes de SIM suspects)
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
);

-- Index pour accélérer l'agrégation et la détection
CREATE INDEX IF NOT EXISTS idx_cdr_lines_op_date
  ON cdr_lines(operateur, date_heure);
CREATE INDEX IF NOT EXISTS idx_sim_analyses_statut
  ON sim_analyses(statut);
CREATE INDEX IF NOT EXISTS idx_simbox_statut
  ON simbox_detectees(statut);
CREATE INDEX IF NOT EXISTS idx_rapports_reference
  ON rapports(reference_unique);
