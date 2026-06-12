import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/api/sanctions', requireRole('ARPCE'), async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM sanctions ORDER BY date_sanction DESC');
    res.json(rows);
  } catch (err) {
    console.error('[SANCTIONS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/sanctions/avertir', requireRole('ARPCE'), async (req, res) => {
  const { ordre_id, operateur } = req.body;
  const conn = await pool.getConnection();
  try {
    const [[ordre]] = await conn.query('SELECT * FROM ordres_blocage WHERE id = ?', [ordre_id]);
    if (!ordre) return res.status(404).json({ error: 'Ordre introuvable' });
    if (new Date() < new Date(ordre.date_limite))
      return res.status(400).json({ error: 'Délai pas encore dépassé' });

    await conn.query("UPDATE ordres_blocage SET statut = 'depasse' WHERE id = ?", [ordre_id]);

    const [[existingAvert]] = await conn.query(
      "SELECT id FROM sanctions WHERE ordre_blocage_id = ? AND type = 'avertissement'", [ordre_id]
    );
    const [[existingMED]] = await conn.query(
      "SELECT id FROM sanctions WHERE ordre_blocage_id = ? AND type = 'mise_en_demeure'", [ordre_id]
    );
    if (existingMED)
      return res.status(409).json({ error: 'Sanction maximale (mise en demeure) déjà appliquée sur cet ordre.' });

    const sanctionType = existingAvert ? 'mise_en_demeure' : 'avertissement';
    const sanctionId   = uuidv4();
    const emailCible   = operateur === 'MTN' ? 'agent.mtn@mtn.cg' : 'agent.airtel@airtel.cg';
    const logMessage   = sanctionType === 'mise_en_demeure'
      ? `Mise en demeure émise le ${new Date().toISOString()} — Récidive`
      : `Avertissement envoyé le ${new Date().toISOString()} — SIM non bloquée`;

    await conn.query(
      'INSERT INTO sanctions (id, ordre_blocage_id, operateur, type, email_envoye, log_details) VALUES (?, ?, ?, ?, ?, ?)',
      [sanctionId, ordre_id, operateur, sanctionType, emailCible, logMessage]
    );

    const sujet = sanctionType === 'mise_en_demeure'
      ? `[ARPCE] MISE EN DEMEURE — Non-conformité persistante opérateur ${operateur}`
      : `[ARPCE] AVERTISSEMENT — SIM Box détectée non bloquée — ${operateur}`;
    const corps = sanctionType === 'mise_en_demeure'
      ? `Madame, Monsieur,\n\nMalgré l'avertissement précédemment adressé, les SIM Box identifiées n'ont pas été bloquées dans le délai réglementaire imparti.\n\nEn application des dispositions de la loi n°009-2009 sur les télécommunications au Congo, l'ARPCE vous adresse la présente mise en demeure.\n\nVous disposez de 72 heures pour vous conformer, sous peine de sanctions financières et/ou administratives.\n\nL'Autorité de Régulation des Postes et Communications Électroniques (ARPCE)\nDirection du Contrôle et de la Conformité`
      : `Madame, Monsieur,\n\nNous avons détecté des SIM Box actives sur votre réseau ${operateur} lors de nos contrôles automatiques. Ces SIM Box n'ont pas été bloquées dans le délai réglementaire prescrit.\n\nConformément aux textes en vigueur, vous êtes formellement averti(e) de procéder au blocage immédiat de ces équipements frauduleux.\n\nToute récidive fera l'objet d'une mise en demeure.\n\nL'Autorité de Régulation des Postes et Communications Électroniques (ARPCE)`;

    await conn.query(
      'INSERT INTO emails_simules (id, sanction_id, destinataire, sujet, corps, operateur, type_sanction) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), sanctionId, emailCible, sujet, corps, operateur, sanctionType]
    );
    await logAudit(conn, { ...req.auditUser, action: 'EMETTRE_SANCTION', entite_type: 'sanction', entite_id: sanctionId, operateur, details: { ordre_id, email_envoye: emailCible, type: sanctionType } });
    res.json({ success: true, sanction_id: sanctionId, email_envoye: emailCible, type: sanctionType });
  } catch (err) {
    console.error('[SANCTIONS AVERTIR ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.get('/api/emails', requireRole('ARPCE'), async (req, res) => {
  const { operateur } = req.query;
  const conn = await pool.getConnection();
  try {
    let query = 'SELECT * FROM emails_simules';
    const params = [];
    if (operateur && operateur !== 'TOUS') { query += ' WHERE operateur = ?'; params.push(operateur); }
    query += ' ORDER BY date_envoi DESC LIMIT 50';
    const [rows] = await conn.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[EMAILS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

export default router;
