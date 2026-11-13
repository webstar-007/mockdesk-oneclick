// Who is an admin. Sources: the admins.txt file in the project folder and the MOCKDESK_ADMIN_EMAILS variable.
// admins.txt: one email or mobile number per line. Anything after # is a comment. Edit it while the server runs; it is re-read at each sign-in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normEmail, normPhone } from './otp.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const adminsFile = () => process.env.MOCKDESK_ADMINS_FILE || path.join(ROOT, 'admins.txt');
export function readAdmins() {
  const emails = new Set(), phones = new Set(), ignored = [];
  const take = (raw) => { const v = raw.trim(); if (!v) return; if (v.includes('@')) { const e = normEmail(v); e ? emails.add(e) : ignored.push(v); } else { const p = normPhone(v); p ? phones.add(p) : ignored.push(v); } };
  String(process.env.MOCKDESK_ADMIN_EMAILS || '').split(',').forEach(take);
  try { for (const line of fs.readFileSync(adminsFile(), 'utf8').split(/\r?\n/)) take(line.replace(/#.*$/, '').trim()); } catch { /* file is optional */ }
  return { emails, phones, ignored };
}
/** Give admin rights to every user whose email or mobile appears in the list. Returns how many were changed. */
export function promoteAdmins(db) {
  const { emails, phones } = readAdmins(); let n = 0;
  const up = (col, v) => { n += Number(db.prepare(`UPDATE users SET role='admin' WHERE ${col}=? AND (role IS NULL OR role!='admin')`).run(v).changes); };
  for (const e of emails) up('email', e); for (const p of phones) up('phone', p);
  return n;
}
