import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import {
  REPORT_STATUSES, REPORT_ROLES, REPORT_DESTINATIONS,
  toSqlDateTime, buildReportReference,
  normalizeAnalysesForReport, buildReportContent, normalizeReportRow,
} from '../lib/reportHelpers.js';

const router = Router();

router.get('/api/rapports', requireRole('AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'), async (req, res) => {
  const { role, operateur, expediteur_role, statut_rapport } = req.query;
  const conn = await pool.getConnection();
  try {
    const VALID_OPERATEURS = ['MTN', 'AIRTEL', 'TOUS'];
    const userRole = req.auditUser?.user_role;
    let forcedOperateur = operateur;
    if (userRole === 'AGENT_MTN')      forcedOperateur = 'MTN';
    else if (userRole === 'AGENT_AIRTEL') forcedOperateur = 'AIRTEL';

    let query = 'SELECT * FROM rapports WHERE 1=1';
    const params = [];
    if (role) {
      if (!REPORT_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
      query += ' AND destinataire_role = ?'; params.push(role);
    }
    if (expediteur_role) {
      if (!REPORT_ROLES.includes(expediteur_role)) return res.status(400).json({ error: 'Expéditeur invalide' });
      query += ' AND expediteur_role = ?'; params.push(expediteur_role);
    }
    if (forcedOperateur) {
      if (!VALID_OPERATEURS.includes(forcedOperateur)) return res.status(400).json({ error: 'Opérateur invalide' });
      query += ' AND operateur = ?'; params.push(forcedOperateur);
    }
    if (statut_rapport) {
      if (!REPORT_STATUSES.includes(statut_rapport)) return res.status(400).json({ error: 'Statut de rapport invalide' });
      query += ' AND statut_rapport = ?'; params.push(statut_rapport);
    }
    query += ' ORDER BY date_envoi DESC LIMIT 200';
    const [rows] = await conn.query(query, params);
    res.json(rows.map(normalizeReportRow));
  } catch (err) {
    console.error('[RAPPORTS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/rapports/envoyer-arpce', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur, analyste_nom = 'Analyste fraude', date_debut = null, date_fin = null } = req.body;
  const conn = await pool.getConnection();
  try {
    const [sims] = await conn.query(
      "SELECT * FROM sim_analyses WHERE statut='confirmee' AND (operateur=? OR UPPER(?)='TOUS')",
      [operateur, operateur]
    );
    if (sims.length === 0) return res.status(400).json({ error: 'Aucune SIM confirmée à envoyer' });

    await conn.beginTransaction();
    const rapportId = uuidv4();
    const reference = buildReportReference();
    const signatureDate = toSqlDateTime();
    const analyses = normalizeAnalysesForReport(sims);
    const contenu = { ...buildReportContent({ type: 'simbox', operateur, reference, analysteNom: analyste_nom, periodeDebut: date_debut, periodeFin: date_fin, analyses, dateSignature: signatureDate }), date: new Date().toISOString() };

    await conn.query(
      `INSERT INTO rapports (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, date_signature, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, 'simbox', 'analyste_fraude', 'arpce', operateur, JSON.stringify(contenu), reference, 'envoye', analyste_nom, signatureDate, date_debut, date_fin]
    );
    await conn.commit();
    await logAudit(conn, { ...req.auditUser, action: 'ENVOYER_RAPPORT_ARPCE', entite_type: 'rapport', entite_id: rapportId, operateur, details: { reference, nb_sims: sims.length } });
    res.json({ success: true, rapport_id: rapportId, reference_unique: reference });
  } catch (err) {
    await conn.rollback();
    console.error('[RAPPORTS ARPCE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/rapports/envoyer-agent', requireRole('AGENT_MTN', 'AGENT_AIRTEL'), async (req, res) => {
  const { operateur, analyste_nom = 'Analyste fraude', date_debut = null, date_fin = null } = req.body;
  if (!['MTN', 'AIRTEL'].includes(operateur))
    return res.status(400).json({ error: 'Opérateur invalide' });

  const conn = await pool.getConnection();
  try {
    const [sims] = await conn.query("SELECT * FROM sim_analyses WHERE operateur = ? AND statut = 'confirmee'", [operateur]);
    const rapportId = uuidv4();
    const reference = buildReportReference();
    const signatureDate = toSqlDateTime();
    const contenu = buildReportContent({ type: 'cdr', operateur, reference, analysteNom: analyste_nom, periodeDebut: date_debut, periodeFin: date_fin, analyses: normalizeAnalysesForReport(sims), dateSignature: signatureDate });
    await conn.query(
      `INSERT INTO rapports (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, date_signature, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, 'cdr', 'analyste_fraude', `agent_${operateur.toLowerCase()}`, operateur, JSON.stringify(contenu), reference, 'envoye', analyste_nom, signatureDate, date_debut, date_fin]
    );
    await logAudit(conn, { ...req.auditUser, action: 'ENVOYER_RAPPORT_AGENT', entite_type: 'rapport', entite_id: rapportId, operateur, details: { reference, nb_sims: sims.length } });
    res.json({ success: true, rapport_id: rapportId, operateur, reference_unique: reference });
  } catch (err) {
    console.error('[RAPPORTS AGENT ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/analyste/rapports/generer', requireRole('ANALYSTE'), async (req, res) => {
  const { operateur = 'TOUS', destinataire, date_debut, date_fin, analyste_nom = 'Analyste fraude' } = req.body;
  if (!date_debut || !date_fin) return res.status(400).json({ error: 'date_debut et date_fin requis' });
  if (!REPORT_DESTINATIONS.includes(destinataire)) return res.status(400).json({ error: 'Destinataire invalide' });
  if (!['MTN', 'AIRTEL', 'TOUS'].includes(operateur)) return res.status(400).json({ error: 'Opérateur invalide' });
  if (destinataire === 'agent_mtn' && operateur !== 'MTN') return res.status(400).json({ error: 'Un rapport destiné à MTN doit cibler MTN' });
  if (destinataire === 'agent_airtel' && operateur !== 'AIRTEL') return res.status(400).json({ error: 'Un rapport destiné à AIRTEL doit cibler AIRTEL' });

  const conn = await pool.getConnection();
  try {
    const [doublon] = await conn.query(
      `SELECT id FROM rapports WHERE expediteur_role = 'analyste_fraude' AND destinataire_role = ? AND operateur = ? AND periode_debut = ? AND periode_fin = ? AND statut_rapport != 'brouillon'`,
      [destinataire, operateur, date_debut, date_fin]
    );
    if (doublon.length > 0)
      return res.status(409).json({ error: `Un rapport a déjà été envoyé pour cette période (${date_debut} → ${date_fin}) et cet opérateur. Modifiez la période ou l'opérateur.` });

    const [rows] = await conn.query(
      `SELECT sa.*, cf.nom_fichier FROM sim_analyses sa JOIN cdr_files cf ON cf.id = sa.cdr_id
       WHERE sa.statut = 'confirmee'
         AND COALESCE(sa.date_decision, sa.date_analyse) >= ?
         AND COALESCE(sa.date_decision, sa.date_analyse) < DATE_ADD(?, INTERVAL 1 DAY)
         AND (? = 'TOUS' OR sa.operateur = ?)
       ORDER BY sa.score_suspicion DESC, sa.date_analyse DESC`,
      [date_debut, date_fin, operateur, operateur]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Aucune analyse confirmée sur cette période' });

    const rapportId = uuidv4();
    const reference = buildReportReference();
    const type = destinataire === 'arpce' ? 'simbox' : 'cdr';
    const contenu = buildReportContent({ type, operateur, reference, analysteNom: analyste_nom, periodeDebut: date_debut, periodeFin: date_fin, analyses: normalizeAnalysesForReport(rows) });
    await conn.query(
      `INSERT INTO rapports (id, type, expediteur_role, destinataire_role, operateur, contenu_json, reference_unique, statut_rapport, analyste_nom, periode_debut, periode_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rapportId, type, 'analyste_fraude', destinataire, operateur, JSON.stringify(contenu), reference, 'brouillon', analyste_nom, date_debut, date_fin]
    );
    const [[rapport]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [rapportId]);
    await logAudit(conn, { ...req.auditUser, action: 'GENERER_RAPPORT', entite_type: 'rapport', entite_id: rapportId, operateur, details: { reference, destinataire, nb_sims: rows.length, date_debut, date_fin } });
    res.status(201).json(normalizeReportRow(rapport));
  } catch (err) {
    console.error('[ANALYSTE RAPPORT GENERER ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du rapport' });
  } finally {
    conn.release();
  }
});

router.post('/api/rapports/:id/envoyer', requireRole('ANALYSTE'), async (req, res) => {
  const { id } = req.params;
  const { analyste_nom } = req.body;
  const conn = await pool.getConnection();
  try {
    const [[rapport]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    if (!rapport) return res.status(404).json({ error: 'Rapport introuvable' });

    const signatureDate = toSqlDateTime();
    const analysteNomFinal = analyste_nom || rapport.analyste_nom || 'Analyste fraude';
    const contenu = normalizeReportRow(rapport).contenu_json;
    const contenuMisAJour = { ...contenu, signature: { analyste_nom: analysteNomFinal, date_signature: signatureDate } };

    await conn.query(
      "UPDATE rapports SET statut_rapport='envoye', analyste_nom=?, date_signature=?, contenu_json=?, statut_lu=FALSE WHERE id=?",
      [analysteNomFinal, signatureDate, JSON.stringify(contenuMisAJour), id]
    );
    const [[updated]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    await logAudit(conn, { ...req.auditUser, action: 'ENVOYER_RAPPORT', entite_type: 'rapport', entite_id: id, operateur: rapport.operateur, details: { reference: rapport.reference_unique, destinataire: rapport.destinataire_role } });
    res.json(normalizeReportRow(updated));
  } catch (err) {
    console.error('[RAPPORT ENVOI ERROR]', err);
    res.status(500).json({ error: "Erreur serveur lors de l'envoi du rapport" });
  } finally {
    conn.release();
  }
});

router.patch('/api/rapports/:id/statut', requireRole('ARPCE'), async (req, res) => {
  const { id } = req.params;
  const { statut_rapport } = req.body;
  if (!REPORT_STATUSES.includes(statut_rapport))
    return res.status(400).json({ error: 'Statut de rapport invalide' });

  const conn = await pool.getConnection();
  try {
    await conn.query(
      "UPDATE rapports SET statut_rapport = ?, statut_lu = IF(? IN ('consulte', 'traite'), TRUE, statut_lu) WHERE id = ?",
      [statut_rapport, statut_rapport, id]
    );
    const [[updated]] = await conn.query('SELECT * FROM rapports WHERE id = ?', [id]);
    if (!updated) return res.status(404).json({ error: 'Rapport introuvable' });
    res.json(normalizeReportRow(updated));
  } catch (err) {
    console.error('[RAPPORT STATUS ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du rapport' });
  } finally {
    conn.release();
  }
});

export default router;
