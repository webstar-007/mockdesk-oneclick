import { createApp } from './app.js';
import { openDb } from './lib/db.js';
import { broadcastDue } from './adminExtras.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Optional settings file (see .env.example): SMTP / SMS delivery for OTP sign-in, PORT, NODE_ENV.
try { process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')); } catch { /* no .env file */ }
if (process.env.MOCKDESK_TIME_SCALE) console.log(`! Timers scaled by ${process.env.MOCKDESK_TIME_SCALE} (testing mode)`);
if (process.env.MOCKDESK_ALLOW_INCOMPLETE === '1') console.log('! Preview mode: incomplete mocks are listed');
const port = Number(process.env.PORT || 3000);
const app = createApp(openDb());
app.listen(port, () => console.log(`MockDesk server on http://localhost:${port}`));
// Every 10 minutes: send scheduled announcements and reminders (they skip quiet hours and never repeat).
const tick = async () => { try { await broadcastDue({ db: app.db, notifier: app.notifier, now: Date.now }); await app.runReminders(); } catch (e) { console.error('Reminder run failed:', e.message); } };
if (process.env.MOCKDESK_SCHEDULER !== 'off') { setTimeout(tick, 60000).unref(); setInterval(tick, 10 * 60000).unref(); }
