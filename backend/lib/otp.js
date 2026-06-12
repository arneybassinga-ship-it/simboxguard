import nodemailer from 'nodemailer';

const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

export const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const storeOtp = (email, code) => {
  otpStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + OTP_TTL_MS });
};

export const validateOtp = (email, code) => {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(email.toLowerCase()); return false; }
  if (entry.code !== String(code)) return false;
  otpStore.delete(email.toLowerCase());
  return true;
};

const createTransporter = () => {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
};

export const sendOtpEmail = async (email, code, nom) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`\n[OTP] Code pour ${email} (${nom}): ${code}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@arpce.cg',
    to: email,
    subject: '[SIMVigil] Code de vérification',
    text: `Bonjour ${nom},\n\nVotre code de vérification SIMVigil est : ${code}\n\nCe code expire dans 5 minutes.\n\n— ARPCE`,
    html: `<p>Bonjour <strong>${nom}</strong>,</p>
           <p>Votre code de vérification SIMVigil est :</p>
           <h2 style="letter-spacing:0.4em;font-family:monospace">${code}</h2>
           <p>Ce code expire dans <strong>5 minutes</strong>.</p>
           <p style="color:#666">— Autorité de Régulation des Postes et Communications Électroniques (ARPCE)</p>`,
  });
};
