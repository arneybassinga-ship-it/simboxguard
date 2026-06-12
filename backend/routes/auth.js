import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { generateOtp, storeOtp, validateOtp, sendOtpEmail } from '../lib/otp.js';

const router = Router();

const JWT_SECRET   = process.env.JWT_SECRET;
const JWT_EXPIRES  = '8h';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' },
});

// Sessions en attente de validation OTP : email → { user, expiresAt }
const pendingLogins = new Map();
const PENDING_TTL = 5 * 60 * 1000;

// POST /api/auth/login  →  valide le mot de passe, envoie l'OTP
router.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query(
      'SELECT id, nom, email, role, operateur, password AS hash FROM users WHERE email = ? AND actif = 1',
      [email]
    );
    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    if (!row) {
      await logAudit(conn, { user_id: 'inconnu', user_nom: 'inconnu', user_role: 'inconnu', action: 'LOGIN_ECHEC', details: { email }, ip });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const valid = await bcrypt.compare(password, row.hash);
    if (!valid) {
      await logAudit(conn, { user_id: row.id, user_nom: row.nom, user_role: row.role, action: 'LOGIN_ECHEC', details: { email }, ip });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const { hash: _h, ...user } = row;
    pendingLogins.set(email.toLowerCase(), { user, expiresAt: Date.now() + PENDING_TTL });

    const code = generateOtp();
    storeOtp(email, code);
    await sendOtpEmail(email, code, user.nom);

    // En mode développement, retourner le code dans la réponse (emails factices)
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
      message: isDev ? `Code OTP : ${code}` : 'Code OTP envoyé à votre adresse email',
      ...(isDev && { demo_otp: code }),
    });
  } catch (err) {
    console.error('[AUTH LOGIN ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// POST /api/auth/verify-otp  →  valide le code, pose le cookie httpOnly
router.post('/api/auth/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ error: 'Email et code OTP requis' });

  const pending = pendingLogins.get(email.toLowerCase());
  if (!pending || Date.now() > pending.expiresAt) {
    pendingLogins.delete(email.toLowerCase());
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
  if (!validateOtp(email, String(code))) {
    return res.status(401).json({ error: 'Code OTP invalide ou expiré' });
  }
  pendingLogins.delete(email.toLowerCase());

  const { user } = pending;
  const token = jwt.sign(
    { id: user.id, nom: user.nom, role: user.role, operateur: user.operateur },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  const conn = await pool.getConnection();
  try {
    await logAudit(conn, {
      user_id: user.id, user_nom: user.nom, user_role: user.role,
      action: 'LOGIN_SUCCES', details: { email },
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });
  } finally {
    conn.release();
  }

  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ user });
});

// POST /api/auth/logout  →  supprime le cookie
router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ success: true });
});

export default router;
