import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import {
  upload, parseCdrFile, toDateTimeString, parseDurationSeconds,
  detecterMapping, normalizeNumeroCongo, isSimValide,
  infererStatutAppel, infererOrigine,
} from '../lib/cdrParser.js';

const router = Router();

router.post('/api/cdr/detect-columns', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Fichier requis' });

  let rows;
  try { rows = parseCdrFile(file.buffer, file.originalname); }
  catch { return res.status(400).json({ error: 'Impossible de lire le fichier' }); }

  if (rows.length === 0) return res.status(400).json({ error: 'Fichier vide' });
  const colonnes = Object.keys(rows[0]);
  res.json({ colonnes, mapping: detecterMapping(colonnes), nb_lignes: rows.length, preview: rows.slice(0, 3) });
});

router.post('/api/cdr/upload', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), upload.single('file'), async (req, res) => {
  const file = req.file;
  const { agent_id, operateur = 'TOUS', mapping: mappingStr } = req.body;
  if (!file) return res.status(400).json({ error: 'Fichier requis' });
  if (!agent_id) return res.status(400).json({ error: 'agent_id requis' });
  if (!mappingStr) return res.status(400).json({ error: "mapping requis — appelez d'abord /api/cdr/detect-columns" });

  let mapping;
  try { mapping = JSON.parse(mappingStr); }
  catch { return res.status(400).json({ error: 'mapping JSON invalide' }); }

  const CHAMPS_REQUIS = ['numero_sim', 'numero_appele', 'date_heure', 'duree_secondes'];
  const manquants = CHAMPS_REQUIS.filter(c => !mapping[c]);
  if (manquants.length > 0) return res.status(400).json({ error: `Colonnes non associées : ${manquants.join(', ')}` });

  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) return res.status(400).json({ error: 'Format non supporté (csv, xlsx, xls)' });

  let rows = [];
  try { rows = parseCdrFile(file.buffer, file.originalname); }
  catch { return res.status(400).json({ error: 'Impossible de lire le fichier' }); }

  const cdrId = uuidv4();
  const dateImport = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const cdrLineEntities = [];
  let lignesRejetees = 0, lignesMauvaisOperateur = 0;
  const echantillonRejet = [];

  for (const row of rows) {
    const rawSim = row[mapping.numero_sim];
    const numero_sim = normalizeNumeroCongo(rawSim);
    if (!numero_sim) { lignesRejetees++; continue; }
    if (!isSimValide(numero_sim, operateur.toUpperCase())) {
      lignesMauvaisOperateur++; lignesRejetees++;
      if (echantillonRejet.length < 5) echantillonRejet.push({ brut: String(rawSim ?? ''), normalise: numero_sim });
      continue;
    }
    const numero_appele = normalizeNumeroCongo(row[mapping.numero_appele]);
    if (!numero_appele) { lignesRejetees++; continue; }

    const date_heure = toDateTimeString(row[mapping.date_heure]);
    const duree_secondes = parseDurationSeconds(row[mapping.duree_secondes]);
    const statut = infererStatutAppel(mapping.statut_appel ? row[mapping.statut_appel] : null, duree_secondes);
    const origine = infererOrigine(mapping.origine ? row[mapping.origine] : null, numero_appele);

    if (!date_heure || duree_secondes === null || !statut || !origine) { lignesRejetees++; continue; }
    cdrLineEntities.push([uuidv4(), cdrId, numero_sim, numero_appele, date_heure, Math.round(duree_secondes), statut, origine, operateur.toUpperCase()]);
  }

  const totalLignes = rows.length;
  if (totalLignes > 5 && lignesMauvaisOperateur / totalLignes > 0.8) {
    const prefixes = operateur.toUpperCase() === 'MTN' ? '06XXXXXXX' : '04XXXXXXX/05XXXXXXX';
    const diagMsg = echantillonRejet.length > 0 ? ` Exemples : ${echantillonRejet.map(e => `"${e.brut}"→"${e.normalise}"`).join(', ')}.` : '';
    return res.status(400).json({ error: `Ce fichier ne correspond pas à l'opérateur ${operateur.toUpperCase()}. ${lignesMauvaisOperateur}/${totalLignes} numéros invalides (préfixes attendus : ${prefixes}).${diagMsg}` });
  }
  if (cdrLineEntities.length === 0)
    return res.status(400).json({ error: `Aucune ligne valide. ${lignesRejetees} ligne(s) rejetée(s).` });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT id FROM cdr_files WHERE nom_fichier = ? AND operateur = ? AND agent_id = ?', [file.originalname, operateur.toUpperCase(), agent_id]);
    if (existing.length > 0) { await conn.rollback(); conn.release(); return res.status(409).json({ error: `Ce fichier a déjà été importé : "${file.originalname}".` }); }

    await conn.query('INSERT INTO cdr_files VALUES (?, ?, ?, ?, ?, ?, ?)', [cdrId, file.originalname, dateImport, cdrLineEntities.length, 'en_attente', operateur.toUpperCase(), agent_id]);
    await conn.query('INSERT INTO cdr_lines VALUES ?', [cdrLineEntities]);
    await conn.commit();
    await logAudit(conn, { ...req.auditUser, action: 'IMPORT_CDR', entite_type: 'cdr_file', entite_id: cdrId, operateur: operateur.toUpperCase(), details: { fichier: file.originalname, nb_lignes: cdrLineEntities.length, nb_rejetes: lignesRejetees } });
    res.status(201).json({ cdr_id: cdrId, nb_lignes: cdrLineEntities.length, nb_lignes_rejetees: lignesRejetees });
  } catch (err) {
    await conn.rollback();
    console.error('[UPLOAD CDR ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors du traitement du fichier' });
  } finally {
    conn.release();
  }
});

router.patch('/api/cdr/analyses/:id', requireRole('ANALYSTE'), async (req, res) => {
  const { id } = req.params;
  const { statut, motif_refus, details_refus, justificatif_confirmation } = req.body;
  if (!['confirmee', 'refusee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  if (statut === 'confirmee' && !justificatif_confirmation) return res.status(400).json({ error: 'Justificatif requis' });
  if (statut === 'refusee' && !motif_refus) return res.status(400).json({ error: 'Motif requis' });

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE sim_analyses SET statut=?, motif_refus=?, details_refus=?, justificatif_confirmation=?, date_decision=NOW() WHERE id=?',
      [statut, motif_refus || null, details_refus || null, justificatif_confirmation || null, id]
    );
    const [[sim]] = await conn.query('SELECT numero_sim, operateur FROM sim_analyses WHERE id=?', [id]);
    await logAudit(conn, { ...req.auditUser, action: statut === 'confirmee' ? 'CONFIRMER_SIM' : 'REFUSER_SIM', entite_type: 'sim_analyse', entite_id: id, operateur: sim?.operateur || null, details: { numero_sim: sim?.numero_sim, motif_refus: motif_refus || null } });
    res.json({ success: true });
  } catch (err) {
    console.error('[ANALYSES PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.get('/api/cdr/files', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const role = req.auditUser?.user_role;
    let query = 'SELECT * FROM cdr_files';
    const params = [];
    if (role === 'AGENT_MTN')      { query += ' WHERE operateur = ?'; params.push('MTN'); }
    else if (role === 'AGENT_AIRTEL') { query += ' WHERE operateur = ?'; params.push('AIRTEL'); }
    query += ' ORDER BY date_import DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[CDR FILES ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.get('/api/cdr/sim/:msisdn/historique', requireRole('ANALYSTE', 'ARPCE'), async (req, res) => {
  const { msisdn } = req.params;
  const conn = await pool.getConnection();
  try {
    const [lignes] = await conn.query(
      `SELECT cl.*, cf.nom_fichier, cf.date_import FROM cdr_lines cl JOIN cdr_files cf ON cl.cdr_id = cf.id WHERE cl.numero_sim = ? ORDER BY cl.date_heure DESC`,
      [msisdn]
    );
    const total = lignes.length;
    const totalDuree = lignes.reduce((s, l) => s + (l.duree_secondes || 0), 0);
    const aboutis = lignes.filter(l => l.statut_appel === 'abouti').length;
    const internationaux = lignes.filter(l => l.origine === 'international').length;
    const numerosAppeles = new Set(lignes.map(l => l.numero_appele)).size;
    const dureeMax = Math.max(...lignes.map(l => l.duree_secondes || 0), 0);
    let appelsParHeure = 0;
    if (total > 1) {
      const dates = lignes.map(l => new Date(l.date_heure).getTime());
      const dureesPeriode = (Math.max(...dates) - Math.min(...dates)) / 3600000;
      appelsParHeure = dureesPeriode > 0 ? Math.round(total / dureesPeriode) : total;
    }
    res.json({ stats: { total, totalDuree, dureeMoy: total > 0 ? Math.round(totalDuree / total) : 0, dureeMax, aboutis, echoues: total - aboutis, tauxAboutissement: total > 0 ? Math.round((aboutis / total) * 100) : 0, internationaux, nationaux: total - internationaux, tauxInternational: total > 0 ? Math.round((internationaux / total) * 100) : 0, numerosAppeles, appelsParHeure }, lignes });
  } catch (err) {
    console.error('[SIM HISTORIQUE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.get('/api/cdr/analyses', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const role = req.auditUser?.user_role;
    let query = 'SELECT * FROM sim_analyses';
    const params = [];
    if (role === 'AGENT_MTN')      { query += ' WHERE operateur = ?'; params.push('MTN'); }
    else if (role === 'AGENT_AIRTEL') { query += ' WHERE operateur = ?'; params.push('AIRTEL'); }
    query += ' ORDER BY date_analyse DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({ ...r, criteres: typeof r.criteres === 'string' ? JSON.parse(r.criteres) : r.criteres })));
  } catch (err) {
    console.error('[CDR ANALYSES ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.get('/api/cdr/fichiers-en-attente', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur } = req.query;
  if (!operateur) return res.status(400).json({ error: 'operateur requis' });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT cf.id, cf.nom_fichier, cf.date_import, cf.nb_lignes, cf.statut, cf.operateur,
              MIN(cl.date_heure) AS date_debut_donnees, MAX(cl.date_heure) AS date_fin_donnees
       FROM cdr_files cf LEFT JOIN cdr_lines cl ON cl.cdr_id = cf.id
       WHERE cf.operateur = ? AND cf.statut = 'en_attente' GROUP BY cf.id ORDER BY cf.date_import DESC`,
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

export default router;
