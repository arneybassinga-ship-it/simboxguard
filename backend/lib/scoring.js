import { v4 as uuidv4 } from 'uuid';

export const SCORING_THRESHOLDS = {
  appels_par_heure: { haut: 20, moyen: 10, points_haut: 20, points_moyen: 10 },
  duree_moyenne:    { bas: 30,  moyen: 60, points_bas: 15,  points_moyen: 8 },
  taux_echec:       { haut: 25, moyen: 15, points_haut: 10, points_moyen: 5 },
  pct_nuit:         { haut: 70, moyen: 40, points_haut: 15, points_moyen: 8 },
  contacts_uniques: { haut: 10, moyen: 5,  points_haut: 15, points_moyen: 8 },
  pct_international:{ haut: 40, moyen: 20, points_haut: 20, points_moyen: 10 },
  anciennete:       { seuil_jours: 30, seuil_appels: 500, points: 5 },
  niveau_eleve:     60,
  niveau_moyen:     40,
};

export const analyzeSim = (simNumber, lines, cdrId) => {
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

  const T = SCORING_THRESHOLDS;
  const maxAppelsHeure   = Math.max(...Object.values(hourlyCounts));
  const dureeMoyenne     = dureeTotale / totalAppels;
  const tauxEchec        = (appelsEchoues / totalAppels) * 100;
  const pctNuit          = (appelsNuit / totalAppels) * 100;
  const nbJours          = Object.keys(dailyContacts).length || 1;
  const avgContactsJour  = Object.values(dailyContacts).reduce((acc, set) => acc + set.size, 0) / nbJours;
  const pctInternational = (appelsInter / totalAppels) * 100;
  const minDate          = Math.min(...timestamps);
  const maxDate          = Math.max(...timestamps);
  const anciennete       = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

  let score = 0;

  if (maxAppelsHeure   > T.appels_par_heure.haut)  score += T.appels_par_heure.points_haut;
  else if (maxAppelsHeure > T.appels_par_heure.moyen) score += T.appels_par_heure.points_moyen;

  if (dureeMoyenne     < T.duree_moyenne.bas)       score += T.duree_moyenne.points_bas;
  else if (dureeMoyenne < T.duree_moyenne.moyen)    score += T.duree_moyenne.points_moyen;

  if (tauxEchec        > T.taux_echec.haut)         score += T.taux_echec.points_haut;
  else if (tauxEchec   > T.taux_echec.moyen)        score += T.taux_echec.points_moyen;

  if (pctNuit          > T.pct_nuit.haut)           score += T.pct_nuit.points_haut;
  else if (pctNuit     > T.pct_nuit.moyen)          score += T.pct_nuit.points_moyen;

  if (avgContactsJour  > T.contacts_uniques.haut)   score += T.contacts_uniques.points_haut;
  else if (avgContactsJour > T.contacts_uniques.moyen) score += T.contacts_uniques.points_moyen;

  if (pctInternational > T.pct_international.haut)  score += T.pct_international.points_haut;
  else if (pctInternational > T.pct_international.moyen) score += T.pct_international.points_moyen;

  if (anciennete < T.anciennete.seuil_jours && totalAppels > T.anciennete.seuil_appels) {
    score += T.anciennete.points;
  }

  let niveau = 'normale';
  if (score >= T.niveau_eleve) niveau = 'critique';
  else if (score >= T.niveau_moyen) niveau = 'elevee';

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
      appels_par_heure:      maxAppelsHeure,
      duree_moyenne:         dureeMoyenne,
      taux_echec:            tauxEchec,
      pct_nuit:              pctNuit,
      correspondants_uniques: avgContactsJour,
      pct_international:     pctInternational,
      anciennete_jours:      anciennete,
    },
  };
};
