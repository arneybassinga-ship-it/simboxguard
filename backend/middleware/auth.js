import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export const jwtMiddleware = (req, _res, next) => {
  const cookieToken  = req.cookies?.authToken;
  const headerToken  = req.headers['authorization']?.startsWith('Bearer ')
    ? req.headers['authorization'].slice(7) : null;
  const token = cookieToken || headerToken;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.auditUser = {
        user_id:   payload.id   || 'inconnu',
        user_nom:  payload.nom  || 'inconnu',
        user_role: payload.role || 'inconnu',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      };
    } catch {
      req.auditUser = { user_id: 'inconnu', user_nom: 'inconnu', user_role: 'inconnu', ip: null };
    }
  } else {
    req.auditUser = { user_id: 'inconnu', user_nom: 'inconnu', user_role: 'inconnu', ip: null };
  }
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  const role = req.auditUser?.user_role;
  if (!role || role === 'inconnu' || !roles.includes(role)) {
    return res.status(403).json({ error: 'Accès refusé — rôle insuffisant' });
  }
  next();
};
