import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/api/audit', requireRole('ARPCE'), async (req, res) => {
  const { action, user_role, operateur, date_debut, date_fin, limit = 100, offset = 0 } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action)     { query += ' AND action = ?';     params.push(action); }
    if (user_role)  { query += ' AND user_role = ?';  params.push(user_role); }
    if (operateur)  { query += ' AND operateur = ?';  params.push(operateur); }
    if (date_debut) { query += ' AND date_action >= ?'; params.push(date_debut); }
    if (date_fin)   { query += ' AND date_action <= DATE_ADD(?, INTERVAL 1 DAY)'; params.push(date_fin); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await conn.query(countQuery, params);

    query += ' ORDER BY date_action DESC LIMIT ? OFFSET ?';
    params.push(
      Math.min(parseInt(limit, 10) || 100, 500),
      Math.max(parseInt(offset, 10) || 0, 0)
    );

    const [rows] = await conn.query(query, params);
    res.json({
      total,
      logs: rows.map(r => ({
        ...r,
        details_json: r.details_json
          ? (typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json)
          : null,
      })),
    });
  } catch (err) {
    console.error('[AUDIT GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

export default router;
