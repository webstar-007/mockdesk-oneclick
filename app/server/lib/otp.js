// One-time-password helpers: input normalisation, code hashing and delivery (email via SMTP, SMS via Twilio or MSG91).
// Without delivery settings the code is printed in the server console (development only).
import crypto from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_WRONG = 5;

export const normEmail = (v) => { const e = String(v || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : null; };
/** Returns an E.164 number (+919876543210) or null. Bare 10-digit Indian mobiles (6-9 first digit) get +91. */
export function normPhone(v) {
  const s = String(v || '').replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  if (/^(?:0|91)?[6-9]\d{9}$/.test(s)) return '+91' + s.slice(-10);
  return null;
}
export const maskId = (channel, id) => channel === 'email' ? id.replace(/^(.).*(@.*)$/, '$1•••$2') : id.slice(0, 3) + '•••••' + id.slice(-2);
export const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export const hashCode = (code, salt) => crypto.scryptSync(code, salt, 32).toString('hex');
export const codeMatches = (code, salt, hash) => { const a = Buffer.from(hashCode(String(code), salt), 'hex'), b = Buffer.from(hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };

/** Build the sender from environment variables. Returns async ({channel, to, code}) => void. */
export function makeSender(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const text = (code) => `${code} is your MockDesk verification code. It is valid for 10 minutes. Do not share it with anyone.`;
  return async function send({ channel, to, code }) {
    if (channel === 'email' && env.SMTP_HOST) {
      const { default: nodemailer } = await import('nodemailer');
      const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === '1' || Number(env.SMTP_PORT) === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
      await t.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject: `${code} is your MockDesk code`, text: text(code), html: `<p>Your MockDesk verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It is valid for 10 minutes. If you did not ask for it, ignore this email.</p>` });
      return;
    }
    if (channel === 'sms' && env.SMS_PROVIDER === 'twilio') {
      const sid = env.TWILIO_ACCOUNT_SID, body = new URLSearchParams({ To: to, Body: text(code) });
      if (env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID); else body.set('From', env.TWILIO_FROM || '');
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64') }, body });
      if (!r.ok) throw new Error(`Twilio responded ${r.status}`);
      return;
    }
    if (channel === 'sms' && env.SMS_PROVIDER === 'msg91') {
      const u = new URL('https://control.msg91.com/api/v5/otp');
      u.search = new URLSearchParams({ template_id: env.MSG91_TEMPLATE_ID, mobile: to.replace('+', ''), otp: code }).toString();
      const r = await fetch(u, { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.type === 'error') throw new Error(`MSG91 responded ${r.status} ${j.message || ''}`);
      return;
    }
    if (prod) { const e = new Error('OTP delivery is not configured'); e.code = 'OTP_NOT_CONFIGURED'; throw e; }
    console.log(`\n[OTP · development] ${channel} ${to}  →  ${code}\n`);
  };
}
