import { CDRLine, SimAnalysis, AlerteNiveau, Operator } from '../types';
import { differenceInDays, parseISO, getHours } from 'date-fns';

/**
 * Calcule le score de suspicion pour une SIM donnée basée sur ses lignes de CDR
 */
export const analyzeSimActivity = (simNumber: string, lines: CDRLine[], cdrId: string): SimAnalysis => {
  const totalAppels = lines.length;
  if (totalAppels === 0) throw new Error("Aucune donnée pour cette SIM");

  const operateur = lines[0].operateur;
  
  // 1. Appels par heure (Max sur la période)
  const hourlyCounts: Record<string, number> = {};
  lines.forEach(l => {
    const hourKey = l.date_heure.substring(0, 13); // YYYY-MM-DD HH
    hourlyCounts[hourKey] = (hourlyCounts[hourKey] || 0) + 1;
  });
  const maxAppelsHeure = Math.max(...Object.values(hourlyCounts));

  // 2. Durée moyenne
  const dureeTotale = lines.reduce((acc, l) => acc + l.duree_secondes, 0);
  const dureeMoyenne = dureeTotale / totalAppels;

  // 3. Taux d'échec
  const appelsEchoues = lines.filter(l => l.statut_appel === 'echoue').length;
  const tauxEchec = (appelsEchoues / totalAppels) * 100;

  // 4. Appels de nuit (22h-6h)
  const appelsNuit = lines.filter(l => {
    const hour = getHours(parseISO(l.date_heure));
    return hour >= 22 || hour < 6;
  }).length;
  const pctNuit = (appelsNuit / totalAppels) * 100;

  // 5. Correspondants uniques par jour
  const dailyContacts: Record<string, Set<string>> = {};
  lines.forEach(l => {
    const dayKey = l.date_heure.substring(0, 10);
    if (!dailyContacts[dayKey]) dailyContacts[dayKey] = new Set();
    dailyContacts[dayKey].add(l.numero_appelé);
  });
  const avgContactsJour = Object.values(dailyContacts).reduce((acc, set) => acc + set.size, 0) / Object.keys(dailyContacts).length;

  // 6. Origine internationale
  const appelsInter = lines.filter(l => l.origine === 'international').length;
  const pctInternational = (appelsInter / totalAppels) * 100;

  // 7. Ancienneté (simulée ici par la plage du CDR)
  const dates = lines.map(l => parseISO(l.date_heure).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const anciennete = Math.max(1, differenceInDays(maxDate, minDate));

  // CALCUL DU SCORE (Pondération simplifiée)
  let score = 0;
  
  // Critère 1: Appels/h (Poids 20)
  if (maxAppelsHeure > 250) score += 20;
  else if (maxAppelsHeure > 100) score += 10;

  // Critère 2: Durée moyenne (Poids 15)
  if (dureeMoyenne < 10) score += 15;
  else if (dureeMoyenne < 20) score += 8;

  // Critère 3: Taux échec (Poids 10)
  if (tauxEchec > 50) score += 10;
  else if (tauxEchec > 30) score += 5;

  // Critère 4: Appels nuit (Poids 15)
  if (pctNuit > 70) score += 15;
  else if (pctNuit > 40) score += 8;

  // Critère 5: Contacts uniques (Poids 15)
  if (avgContactsJour > 150) score += 15;
  else if (avgContactsJour > 50) score += 8;

  // Critère 6: International (Poids 20)
  if (pctInternational > 90) score += 20;
  else if (pctInternational > 70) score += 10;

  // Critère 7: Ancienneté (Poids 5)
  if (anciennete < 30 && totalAppels > 500) score += 5;

  let niveau: AlerteNiveau = 'normale';
  if (score > 80) niveau = 'critique';
  else if (score > 60) niveau = 'elevee';

  return {
    id: `sim-${simNumber}-${Date.now()}`,
    numero_sim: simNumber,
    operateur,
    score_suspicion: score,
    criteres: {
      appels_par_heure: maxAppelsHeure,
      duree_moyenne: dureeMoyenne,
      taux_echec: tauxEchec,
      pct_nuit: pctNuit,
      correspondants_uniques: avgContactsJour,
      pct_international: pctInternational,
      anciennete_jours: anciennete
    },
    niveau_alerte: niveau,
    statut: 'en_attente',
    date_analyse: new Date().toISOString(),
    cdr_id: cdrId
  };
};