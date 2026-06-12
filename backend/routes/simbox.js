import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { analyzeSim } from '../lib/scoring.js';
import { parseJsonArray } from '../lib/cdrParser.js';

const router = Router();

/* ========= ALGORITHME JACCARD ========= */

const JACCARD_THRESHOLD = 0.25;
const MIN_CONTACTS_SIM  = 2;
const MIN_SCORE_GLOBAL  = 25;

const getTimeSlot = (datetime) => {
  const d = new Date(typeof datetime === 'object' ? datetime.toISOString() : datetime);
  return `${d.toISOString().slice(0, 10)}_${Math.floor(d.getHours() / 2)}`;
};

const detecterSimbox = (lines) => {
  const simContacts = {}, simSlotSet = {};
  lines.forEach(l => {
    if (!simContacts[l.numero_sim]) { simContacts[l.numero_sim] = new Set(); simSlotSet[l.numero_sim] = new Set(); }
    simContacts[l.numero_sim].add(l.numero_appele);
    simSlotSet[l.numero_sim].add(getTimeSlot(l.date_heure));
  });

  const eligibles = Object.keys(simContacts).filter(s => simContacts[s].size >= MIN_CONTACTS_SIM);
  if (eligibles.length < 2) return [];

  const adjacency = {};
  eligibles.forEach(s => { adjacency[s] = new Set(); });
  for (let i = 0; i < eligibles.length; i++) {
    for (let j = i + 1; j < eligibles.length; j++) {
      const sA = eligibles[i], sB = eligibles[j];
      const setA = simContacts[sA], setB = simContacts[sB];
      let inter = 0;
      setA.forEach(c => { if (setB.has(c)) inter++; });
      const union = setA.size + setB.size - inter;
      if (union > 0 && inter / union >= JACCARD_THRESHOLD) { adjacency[sA].add(sB); adjacency[sB].add(sA); }
    }
  }

  const visited = new Set(), groupes = [];
  eligibles.forEach(sim => {
    if (visited.has(sim) || adjacency[sim].size === 0) return;
    const groupe = [], queue = [sim];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur); groupe.push(cur);
      adjacency[cur].forEach(nb => { if (!visited.has(nb)) queue.push(nb); });
    }
    if (groupe.length >= 2) groupes.push(groupe);
  });

  return groupes.map(groupe => {
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

    const tousLesSlots = new Set(groupe.flatMap(s => [...simSlotSet[s]]));
    let chevauchements = 0;
    tousLesSlots.forEach(slot => {
      if (groupe.filter(s => simSlotSet[s].has(slot)).length > 1) chevauchements++;
    });
    const scoreRotation = tousLesSlots.size > 0
      ? ((tousLesSlots.size - chevauchements) / tousLesSlots.size) * 100 : 0;
    const scoreGlobal = Math.round(jaccardMoyen * 50 + scoreRotation * 0.5);

    let niveau = 'suspect';
    if (scoreGlobal >= 70) niveau = 'confirme';
    else if (scoreGlobal >= 50) niveau = 'probable';

    return { id: uuidv4(), sims: groupe, nb_sims: groupe.length, similarite_moyenne: Math.round(jaccardMoyen * 100), score_rotation: Math.round(scoreRotation), score_global: scoreGlobal, niveau, contacts_communs: [...contactsCommuns].slice(0, 20) };
  }).filter(g => g.score_global >= MIN_SCORE_GLOBAL);
};

/* ========= ROUTES ========= */

router.post('/api/cdr/agreger', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur, cdr_file_ids, agent_id } = req.body;
  if (!operateur || !agent_id || !Array.isArray(cdr_file_ids) || cdr_file_ids.length === 0)
    return res.status(400).json({ error: 'operateur, agent_id et cdr_file_ids (tableau) requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const placeholders = cdr_file_ids.map(() => '?').join(',');
    const [fichiers] = await conn.query(
      `SELECT id, nom_fichier FROM cdr_files WHERE id IN (${placeholders}) AND operateur = ? AND statut = 'en_attente'`,
      [...cdr_file_ids, operateur]
    );
    if (fichiers.length === 0) { await conn.rollback(); return res.status(400).json({ error: 'Aucun fichier valide sélectionné' }); }

    const validIds = fichiers.map(f => f.id);
    const validPlaceholders = validIds.map(() => '?').join(',');
    const [lines] = await conn.query(
      `SELECT DISTINCT cl.numero_sim, cl.numero_appele, cl.date_heure, cl.duree_secondes, cl.statut_appel, cl.origine, cl.operateur
       FROM cdr_lines cl WHERE cl.cdr_id IN (${validPlaceholders})`, validIds
    );
    if (lines.length === 0) { await conn.rollback(); return res.status(400).json({ error: 'Aucune ligne CDR dans les fichiers sélectionnés' }); }

    const cdrVirtuelId = uuidv4();
    const dateAgregation = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const nomAgregation = `Agrégation ${operateur} — ${fichiers.length} fichier(s) — ${new Date().toISOString().slice(0, 10)}`;
    await conn.query('INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)', [cdrVirtuelId, nomAgregation, dateAgregation, lines.length, 'analyse', operateur, agent_id]);

    const grouped = {};
    lines.forEach(l => {
      if (!grouped[l.numero_sim]) grouped[l.numero_sim] = [];
      grouped[l.numero_sim].push({ ...l, date_heure: typeof l.date_heure === 'object' ? l.date_heure.toISOString().slice(0, 19).replace('T', ' ') : l.date_heure });
    });

    const analyses = [];
    for (const sim of Object.keys(grouped)) {
      const analysis = analyzeSim(sim, grouped[sim], cdrVirtuelId);
      analyses.push(analysis);
      await conn.query(
        'INSERT INTO sim_analyses (id, cdr_id, numero_sim, operateur, score_suspicion, niveau_alerte, statut, date_analyse, criteres) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [analysis.id, cdrVirtuelId, analysis.numero_sim, analysis.operateur, analysis.score_suspicion, analysis.niveau_alerte, analysis.statut, analysis.date_analyse, JSON.stringify(analysis.criteres)]
      );
    }
    await conn.query(`UPDATE cdr_files SET statut = 'analyse' WHERE id IN (${validPlaceholders})`, validIds);
    await conn.commit();
    await logAudit(conn, { ...req.auditUser, action: 'AGREGER_CDR', entite_type: 'cdr_file', entite_id: cdrVirtuelId, operateur, details: { nb_fichiers: fichiers.length, nb_lignes: lines.length, nb_sims: analyses.length, nb_critiques: analyses.filter(a => a.niveau_alerte === 'critique').length } });
    res.status(201).json({ nb_sim_analysees: analyses.length, nb_lignes_traitees: lines.length, nb_critiques: analyses.filter(a => a.niveau_alerte === 'critique').length, nb_elevees: analyses.filter(a => a.niveau_alerte === 'elevee').length, nb_normales: analyses.filter(a => a.niveau_alerte === 'normale').length });
  } catch (err) {
    await conn.rollback();
    console.error('[AGREGATION ERROR]', err);
    res.status(500).json({ error: "Erreur serveur lors de l'agrégation" });
  } finally {
    conn.release();
  }
});

router.post('/api/cdr/detecter-simbox', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur, date_debut, date_fin, agent_id } = req.body;
  if (!operateur || !date_debut || !date_fin || !agent_id)
    return res.status(400).json({ error: 'operateur, date_debut, date_fin, agent_id requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [lines] = await conn.query(
      `SELECT cl.numero_sim, cl.numero_appele, cl.date_heure FROM cdr_lines cl
       WHERE cl.operateur = ? AND cl.date_heure >= ? AND cl.date_heure < DATE_ADD(?, INTERVAL 1 DAY)`,
      [operateur, date_debut, date_fin]
    );
    if (lines.length === 0) { await conn.rollback(); return res.status(400).json({ error: 'Aucune donnée CDR sur cette période' }); }

    const groupes = detecterSimbox(lines);
    await conn.query(
      'DELETE FROM simbox_detectees WHERE operateur = ? AND agent_id = ? AND periode_debut = ? AND periode_fin = ?',
      [operateur, agent_id, date_debut, date_fin]
    );
    for (const g of groupes) {
      await conn.query(
        `INSERT INTO simbox_detectees (id, periode_debut, periode_fin, operateur, agent_id, sims_json, nb_sims, similarite_moyenne, score_rotation, score_global, niveau, contacts_communs_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [g.id, date_debut, date_fin, operateur, agent_id, JSON.stringify(g.sims), g.nb_sims, g.similarite_moyenne, g.score_rotation, g.score_global, g.niveau, JSON.stringify(g.contacts_communs)]
      );
    }
    await conn.commit();
    await logAudit(conn, { ...req.auditUser, action: 'DETECTER_SIMBOX', entite_type: 'simbox', operateur, details: { date_debut, date_fin, nb_groupes: groupes.length, nb_sims: groupes.reduce((a, g) => a + g.nb_sims, 0), nb_confirmes: groupes.filter(g => g.niveau === 'confirme').length } });
    res.status(201).json({ nb_groupes: groupes.length, nb_sims_impliquees: groupes.reduce((acc, g) => acc + g.nb_sims, 0), nb_confirmes: groupes.filter(g => g.niveau === 'confirme').length, nb_probables: groupes.filter(g => g.niveau === 'probable').length, nb_suspects: groupes.filter(g => g.niveau === 'suspect').length, groupes });
  } catch (err) {
    await conn.rollback();
    console.error('[DETECTER SIMBOX ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la détection' });
  } finally {
    conn.release();
  }
});

router.get('/api/simbox', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
  const { statut, operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM simbox_detectees WHERE 1=1';
    const params = [];
    const VALID_STATUTS = ['en_attente', 'validee', 'rejetee'];
    const VALID_OPS = ['MTN', 'AIRTEL', 'TOUS'];
    if (statut) {
      if (!VALID_STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
      query += ' AND statut = ?'; params.push(statut);
    }
    if (operateur) {
      if (!VALID_OPS.includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
      query += ' AND operateur = ?'; params.push(operateur);
    }
    query += ' ORDER BY date_detection DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({ ...r, sims: parseJsonArray(r.sims_json), contacts_communs: parseJsonArray(r.contacts_communs_json) })));
  } catch (err) {
    console.error('[SIMBOX GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.patch('/api/simbox/:id', requireRole('ANALYSTE'), async (req, res) => {
  const { id } = req.params;
  const { statut, motif_rejet } = req.body;
  if (!['validee', 'rejetee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  if (statut === 'rejetee' && !motif_rejet) return res.status(400).json({ error: 'Motif requis' });

  const conn = await pool.getConnection();
  try {
    await conn.query('UPDATE simbox_detectees SET statut = ?, motif_rejet = ? WHERE id = ?', [statut, motif_rejet || null, id]);
    const [[sb]] = await conn.query('SELECT operateur, nb_sims FROM simbox_detectees WHERE id=?', [id]);
    await logAudit(conn, { ...req.auditUser, action: statut === 'validee' ? 'VALIDER_SIMBOX' : 'REJETER_SIMBOX', entite_type: 'simbox', entite_id: id, operateur: sb?.operateur || null, details: { nb_sims: sb?.nb_sims, motif_rejet: motif_rejet || null } });
    res.json({ success: true });
  } catch (err) {
    console.error('[SIMBOX PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

export default router;
