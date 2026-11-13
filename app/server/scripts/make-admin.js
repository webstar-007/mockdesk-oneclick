// Usage: npm run make-admin -- you@example.com   (add --remove to take admin rights away)
import { openDb } from '../lib/db.js';
const [id, flag] = process.argv.slice(2);
if (!id) { console.log('Usage: npm run make-admin -- <email or mobile> [--remove]'); process.exit(1); }
const db = openDb(); const key = id.trim().toLowerCase();
const u = db.prepare('SELECT id, name FROM users WHERE lower(email)=? OR phone=?').get(key, id.replace(/[^\d+]/g, ''));
if (!u) { console.log(`No user found for "${id}". Sign up on the site first, then run this again.`); process.exit(1); }
db.prepare('UPDATE users SET role=? WHERE id=?').run(flag === '--remove' ? 'student' : 'admin', u.id);
console.log(`${u.name} is now ${flag === '--remove' ? 'a student' : 'an admin'}.`);
