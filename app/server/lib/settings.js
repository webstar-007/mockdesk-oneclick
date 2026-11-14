// Small key/value settings kept in the database (admin-editable, survive updates).
import crypto from 'node:crypto';
export function makeSettings(db) {
  const get = (key, def) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); if (!r) return def; try { return JSON.parse(r.value); } catch { return def; } };
  const set = (key, value) => { db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); return value; };
  const secret = () => { let s = get('secret'); if (!s) s = set('secret', crypto.randomBytes(24).toString('hex')); return s; };
  return { get, set, secret };
}
export const DEFAULTS = {
  referral: { enabled: true, friendsNeeded: 1 },
  reminders: {
    inactive: { enabled: true, days: 4, repeatDays: 7 },
    welcome: { enabled: true, days: 2 },
    mockSoon: { enabled: true, hours: [24, 1] },
    weeklyCap: 4, quietFrom: 22, quietTo: 7, channels: { push: true, email: true },
  },
};
