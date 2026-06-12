import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/api/ordres', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ARPCE'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const role = req.auditUser?.user_role;
    await conn.query(
      "UPDATE ordres_blocage SET statut = 'depasse' WHERE statut = 'en_attente' AND date_limite < NOW()"
    );
    let query = 'SELECT * FROM ordres_blocage';
    const params = [];
    if (role === 'AGENT_MTN')      { query += ' WHERE operateur = ?'; params.push('MTN'); }
    else if (role === 'AGENT_AIRTEL') { query += ' WHERE operateur = ?'; params.push('AIRTEL'); }
    query += ' ORDER BY date_emission DESC';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      liste_sim_json: typeof r.liste_sim_json === 'string' ? JSON.parse(r.liste_sim_json) : r.liste_sim_json,
      delai_restant_heures: Math.max(0, Math.round((new Date(r.date_limite) - new Date()) / 3600000)),
    })));
  } catch (err) {
    console.error('[ORDRES GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/ordres/bloquer', requireRole('ARPCE'), async (req, res) => {
  const { rapport_id, operateur, liste_sim, delai_heures = 48 } = req.body;
  if (!Array.isArray(liste_sim) || liste_sim.length === 0)
    return res.status(400).json({ error: 'liste_sim vide ou invalide' });

  const conn = await pool.getConnection();
  try {
    const [ordresActifs] = await conn.query(
      "SELECT liste_sim_json FROM ordres_blocage WHERE operateur = ? AND statut IN ('en_attente', 'bloque')",
      [operateur]
    );
    const dejaBloquees = new Set(ordresActifs.flatMap(o => { try { return JSON.parse(o.liste_sim_json); } catch { return []; } }));
    const doublons = liste_sim.filter(s => dejaBloquees.has(s));
    if (doublons.length > 0)
      return res.status(409).json({ error: `SIM(s) déjà dans un ordre actif : ${doublons.join(', ')}` });

    const ordreId = uuidv4();
    const dateLimite = new Date(Date.now() + delai_heures * 3600 * 1000);
    await conn.query(
      'INSERT INTO ordres_blocage (id, rapport_id, operateur, liste_sim_json, delai_heures, date_limite) VALUES (?, ?, ?, ?, ?, ?)',
      [ordreId, rapport_id, operateur, JSON.stringify(liste_sim), delai_heures, dateLimite]
    );
    if (rapport_id) {
      await conn.query("UPDATE rapports SET statut_rapport='traite', statut_lu=TRUE WHERE id = ?", [rapport_id]);
    }
    await logAudit(conn, { ...req.auditUser, action: 'EMETTRE_BLOCAGE', entite_type: 'ordre_blocage', entite_id: ordreId, operateur, details: { nb_sims: liste_sim.length, delai_heures, date_limite: dateLimite } });
    res.json({ success: true, ordre_id: ordreId, date_limite: dateLimite });
  } catch (err) {
    console.error('[ORDRES CREER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.patch('/api/ordres/:id/bloquer', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("UPDATE ordres_blocage SET statut = 'bloque' WHERE id = ?", [req.params.id]);
    const [[ordre]] = await conn.query('SELECT operateur FROM ordres_blocage WHERE id=?', [req.params.id]);
    await logAudit(conn, { ...req.auditUser, action: 'CONFIRMER_BLOCAGE', entite_type: 'ordre_blocage', entite_id: req.params.id, operateur: ordre?.operateur || null });
    res.json({ success: true });
  } catch (err) {
    console.error('[ORDRES BLOQUER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

export default router;
