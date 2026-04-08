import { User, CDRFile, SimAnalysis, BlockingOrder, Sanction } from '../types';

export const MOCK_USERS: User[] = [
  { id: 'u1', email: 'agent.mtn@mtn.cg', role: 'AGENT_MTN', operateur: 'MTN', nom: 'Jean Dupont' },
  { id: 'u2', email: 'agent.airtel@airtel.cg', role: 'AGENT_AIRTEL', operateur: 'AIRTEL', nom: 'Marie Curie' },
  { id: 'u3', email: 'analyste@arpce.cg', role: 'ANALYSTE', nom: 'Paul Martin' },
  { id: 'u4', email: 'controleur@arpce.cg', role: 'ARPCE', nom: 'Alice Durand' }
];

export const MOCK_CDRS: CDRFile[] = [
  { id: 'cdr1', nom_fichier: 'CDR_MTN_20240301.csv', date_import: '2024-03-01T10:00:00Z', nb_lignes: 1250, statut: 'analyse', operateur: 'MTN', agent_id: 'u1' },
  { id: 'cdr2', nom_fichier: 'CDR_AIRTEL_20240302.csv', date_import: '2024-03-02T14:30:00Z', nb_lignes: 840, statut: 'analyse', operateur: 'AIRTEL', agent_id: 'u2' }
];

export const MOCK_ANALYSES: SimAnalysis[] = [
  {
    id: 'a1',
    numero_sim: '066001122',
    operateur: 'MTN',
    score_suspicion: 85,
    criteres: {
      appels_par_heure: 280,
      duree_moyenne: 8,
      taux_echec: 55,
      pct_nuit: 75,
      correspondants_uniques: 180,
      pct_international: 95,
      anciennete_jours: 5
    },
    niveau_alerte: 'critique',
    statut: 'en_attente',
    date_analyse: '2024-03-01T11:00:00Z',
    cdr_id: 'cdr1'
  },
  {
    id: 'a2',
    numero_sim: '055009988',
    operateur: 'AIRTEL',
    score_suspicion: 65,
    criteres: {
      appels_par_heure: 120,
      duree_moyenne: 15,
      taux_echec: 35,
      pct_nuit: 45,
      correspondants_uniques: 60,
      pct_international: 75,
      anciennete_jours: 12
    },
    niveau_alerte: 'elevee',
    statut: 'en_attente',
    date_analyse: '2024-03-02T15:00:00Z',
    cdr_id: 'cdr2'
  }
];

export const MOCK_BLOCKING_ORDERS: BlockingOrder[] = [
  {
    id: 'bo1',
    sims: ['066001122'],
    operateur: 'MTN',
    date_emission: '2024-03-01T12:00:00Z',
    date_limite: '2024-03-03T12:00:00Z',
    statut: 'en_attente',
    delai_heures: 48
  }
];

export const MOCK_SANCTIONS: Sanction[] = [];