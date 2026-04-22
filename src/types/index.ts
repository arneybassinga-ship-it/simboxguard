export type Role = 'AGENT_MTN' | 'AGENT_AIRTEL' | 'ANALYSTE' | 'ARPCE';
export type Operator = 'MTN' | 'AIRTEL' | 'TOUS';

export interface User {
  id: string;
  email: string;
  role: Role;
  operateur?: Operator;
  nom: string;
}

export interface CDRLine {
  id: string;
  numero_sim: string;
  numero_appele: string;
  date_heure: string;
  duree_secondes: number;
  statut_appel: 'abouti' | 'echoue';
  origine: 'national' | 'international';
  operateur: Operator;
}

export interface CDRFile {
  id: string;
  nom_fichier: string;
  date_import: string;
  nb_lignes: number;
  statut: 'en_attente' | 'analyse';
  operateur: Operator;
  agent_id: string;
}

export type AlerteNiveau = 'normale' | 'elevee' | 'critique';
export type AnalyseStatut = 'en_attente' | 'confirmee' | 'refusee';

export interface SimAnalysis {
  id: string;
  numero_sim: string;
  operateur: Operator;
  score_suspicion: number;
  criteres: {
    appels_par_heure: number;
    duree_moyenne: number;
    taux_echec: number;
    pct_nuit: number;
    correspondants_uniques: number;
    pct_international: number;
    anciennete_jours: number;
  };
  niveau_alerte: AlerteNiveau;
  statut: AnalyseStatut;
  motif_refus?: string;
  details_refus?: string;
  date_analyse: string;
  date_decision?: string;
  cdr_id: string;
}

export interface BlockingOrder {
  id: string;
  liste_sim_json: string[];
  operateur: Operator;
  date_emission: string;
  date_limite: string;
  statut: 'en_attente' | 'bloque' | 'depasse';
  delai_heures: number;
  delai_restant_heures?: number;
}

export interface SimboxDetection {
  id: string;
  periode_debut: string;
  periode_fin: string;
  operateur: Operator;
  agent_id: string;
  sims: string[];
  nb_sims: number;
  similarite_moyenne: number;
  score_rotation: number;
  score_global: number;
  niveau: 'suspect' | 'probable' | 'confirme';
  statut: 'en_attente' | 'validee' | 'rejetee';
  motif_rejet?: string;
  date_detection: string;
  contacts_communs: string[];
}

export interface Sanction {
  id: string;
  ordre_blocage_id: string;
  date_sanction: string;
  type: 'avertissement' | 'mise_en_demeure';
  operateur: Operator;
  log_details: string;
}

export type ReportStatus = 'brouillon' | 'envoye' | 'consulte' | 'traite';
export type ReportDestination = 'arpce' | 'agent_mtn' | 'agent_airtel';

export interface ReportSignature {
  analyste_nom: string | null;
  date_signature: string | null;
}

export interface AnalystReportContent {
  titre: string;
  reference: string | null;
  total: number;
  operateur: string;
  analyses?: SimAnalysis[];
  sims_confirmees?: SimAnalysis[];
  periode?: {
    date_debut: string | null;
    date_fin: string | null;
  };
  signature?: ReportSignature;
}

export interface AnalystReport {
  id: string;
  type: 'simbox' | 'cdr' | 'blocage' | 'sanction';
  expediteur_role: string;
  destinataire_role: string;
  operateur: string;
  contenu_json: AnalystReportContent;
  date_envoi: string;
  statut_lu: boolean;
  statut_rapport: ReportStatus;
  reference_unique: string | null;
  analyste_nom: string | null;
  date_signature: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
}
