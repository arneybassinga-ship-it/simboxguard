import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 10;
const VALID_ROLES = ['AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'];
const VALID_OPERATEURS = ['MTN', 'AIRTEL'];
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{};:,<.>]).{8,}$/;

const validatePassword = (pwd) => {
  if (!pwd || pwd.length < 8) return 'Mot de passe trop court (8 caractères minimum)';
  if (!PASSWORD_REGEX.test(pwd)) return 'Le mot de passe doit contenir majuscule, minuscule, chiffre et caractère spécial';
  return null;
};

router.get('/api/users', requireRole('ARPCE'), async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT id, nom, email, role, operateur, date_creation FROM users ORDER BY date_creation ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[USERS GET ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/api/users', requireRole('ARPCE'), async (req, res) => {
  const { nom, email, role, operateur = null, password } = req.body;
  if (!nom || !email || !role || !password)
    return res.status(400).json({ error: 'nom, email, role et password sont requis' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Rôle invalide' });
  if (operateur && !VALID_OPERATEURS.includes(operateur))
    return res.status(400).json({ error: 'Opérateur invalide' });
  const pwdErr = validatePassword(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  const conn = await pool.getConnection();
  try {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await conn.query(
      'INSERT INTO users (id, nom, email, role, operateur, password) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nom, email, role, operateur || null, hashedPassword]
    );
    await logAudit(conn, { ...req.auditUser, action: 'CREER_UTILISATEUR', entite_type: 'user', entite_id: id, details: { nom, email, role } });
    const [[user]] = await conn.query('SELECT id, nom, email, role, operateur, date_creation FROM users WHERE id = ?', [id]);
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    console.error('[USERS POST ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.patch('/api/users/:id', requireRole('ARPCE'), async (req, res) => {
  const { id } = req.params;
  const { nom, email, role, operateur, password } = req.body;
  if (role && !VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Rôle invalide' });
  if (operateur && !VALID_OPERATEURS.includes(operateur))
    return res.status(400).json({ error: 'Opérateur invalide' });

  const conn = await pool.getConnection();
  try {
    const fields = [], vals = [];
    if (nom)      { fields.push('nom = ?');      vals.push(nom); }
    if (email)    { fields.push('email = ?');    vals.push(email); }
    if (role)     { fields.push('role = ?');     vals.push(role); }
    if (operateur !== undefined) { fields.push('operateur = ?'); vals.push(operateur || null); }
    if (password) {
      const pwdErr = validatePassword(password);
      if (pwdErr) return res.status(400).json({ error: pwdErr });
      fields.push('password = ?'); vals.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    vals.push(id);
    await conn.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[user]] = await conn.query('SELECT id, nom, email, role, operateur, date_creation FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await logAudit(conn, { ...req.auditUser, action: 'MODIFIER_UTILISATEUR', entite_type: 'user', entite_id: id, details: { champs: fields.map(f => f.split(' ')[0]) } });
    res.json(user);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    console.error('[USERS PATCH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.delete('/api/users/:id', requireRole('ARPCE'), async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query('SELECT id, nom, email, role FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await conn.query('DELETE FROM users WHERE id = ?', [id]);
    await logAudit(conn, { ...req.auditUser, action: 'SUPPRIMER_UTILISATEUR', entite_type: 'user', entite_id: id, details: { nom: user.nom, email: user.email, role: user.role } });
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS DELETE ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

export default router;
