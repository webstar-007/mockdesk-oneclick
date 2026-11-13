import { createApp } from './app.js';
import { openDb } from './lib/db.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Optional settings file (see .env.example): SMTP / SMS delivery for OTP sign-in, PORT, NODE_ENV.
try { process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')); } catch { /* no .env file */ }
if (process.env.MOCKDESK_TIME_SCALE) console.log(`! Timers scaled by ${process.env.MOCKDESK_TIME_SCALE} (testing mode)`);
if (process.env.MOCKDESK_ALLOW_INCOMPLETE === '1') console.log('! Preview mode: incomplete mocks are listed');
const port = Number(process.env.PORT || 3000);
createApp(openDb()).listen(port, () => console.log(`MockDesk server on http://localhost:${port}`));
