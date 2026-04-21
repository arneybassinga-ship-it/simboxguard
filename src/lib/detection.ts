import { CDRLine, SimAnalysis, AlerteNiveau } from '../types';
import { differenceInDays, parseISO, getHours } from 'date-fns';

export const analyzeSimActivity = (simNumber: string, lines: CDRLine[], cdrId: string): SimAnalysis => {
  const totalAppels = lines.length;
  if (totalAppels === 0) throw new Error('Aucune donnée pour cette SIM');

  const operateur = lines[0].operateur;

  // 1. Appels par heure (max sur la période)
  const hourlyCounts: Record<string, number> = {};
  lines.forEach(l => {
    const hourKey = l.date_heure.substring(0, 13);
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
    dailyContacts[dayKey].add(l.numero_appele);
  });
  // Protection division par zéro
  const nbJours = Object.keys(dailyContacts).length || 1;
  const avgContactsJour = Object.values(dailyContacts).reduce((acc, set) => acc + set.size, 0) / nbJours;

  // 6. Origine internationale
  const appelsInter = lines.filter(l => l.origine === 'international').length;
  const pctInternational = (appelsInter / totalAppels) * 100;

  // 7. Ancienneté (plage du CDR)
  const dates = lines.map(l => parseISO(l.date_heure).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const anciennete = Math.max(1, differenceInDays(maxDate, minDate));

  // Seuils identiques au backend (server.js — analyzeSim)
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

  let niveau: AlerteNiveau = 'normale';
  if (score >= 60) niveau = 'critique';
  else if (score >= 40) niveau = 'elevee';

  return {
    id: `sim-${simNumber}-${Date.now()}`,
    numero_sim: simNumber,
    operateur,
    score_suspicion: Math.round(score),
    criteres: {
      appels_par_heure: maxAppelsHeure,
      duree_moyenne: dureeMoyenne,
      taux_echec: tauxEchec,
      pct_nuit: pctNuit,
      correspondants_uniques: avgContactsJour,
      pct_international: pctInternational,
      anciennete_jours: anciennete,
    },
    niveau_alerte: niveau,
    statut: 'en_attente',
    date_analyse: new Date().toISOString(),
    cdr_id: cdrId,
  };
};
