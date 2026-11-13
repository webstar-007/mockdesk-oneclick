#!/usr/bin/env node
// One command to run everything: checks Node, installs dependencies, builds the client,
// validates the question banks, starts the server and opens the browser.
//   node scripts/start.mjs [--preview] [--port 3000] [--no-open] [--rebuild] [--reset-db]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const win = process.platform === 'win32';
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const step = (s) => console.log(c(36, `\n▸ ${s}`));
const ok = (s) => console.log(c(32, `  ✓ ${s}`));
const warn = (s) => console.log(c(33, `  ! ${s}`));
const die = (s) => { console.error(c(31, `\n✗ ${s}\n`)); process.exit(1); };
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { stdio: 'inherit', shell: win, cwd: ROOT, ...o });

console.log(c(1, '\nMockDesk · online mock tests'));

// 1. Node version (node:sqlite is unflagged from 22.13)
step('Checking Node.js');
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) die(`Node.js 22.13 or newer is required (found ${process.versions.node}). Install it from https://nodejs.org and run this again.`);
ok(`Node ${process.versions.node}`);

// 2. Dependencies
step('Checking dependencies');
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'express')) || !fs.existsSync(path.join(ROOT, 'node_modules', 'vite')) || !fs.existsSync(path.join(ROOT, 'node_modules', 'pdfkit'))) {
  console.log('  Installing packages (needs internet)…');
  const r = run('npm', ['install', '--no-audit', '--no-fund']);
  if (r.status !== 0) die('npm install failed. Check your internet connection and try again.');
}
ok('Packages installed');

// 3. Client build
step('Building the web app');
const dist = path.join(ROOT, 'dist', 'index.html');
const newest = (dir) => { let t = 0; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); t = Math.max(t, f.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs); } return t; };
const srcTime = Math.max(newest(path.join(ROOT, 'src')), fs.statSync(path.join(ROOT, 'index.html')).mtimeMs, fs.statSync(path.join(ROOT, 'package.json')).mtimeMs);
if (flag('--rebuild') || !fs.existsSync(dist) || fs.statSync(dist).mtimeMs < srcTime) {
  const r = run('npx', ['vite', 'build', '--logLevel', 'warn']);
  if (r.status !== 0) die('The web app failed to build. Run "npm run check" for details.');
  ok('Built');
} else ok('Up to date');

// 4. Question banks
step('Checking question banks');
const { default: mocks } = await import(pathToFileURL(path.join(ROOT, 'config/mocks.config.js')).href);
const { validateMock } = await import(pathToFileURL(path.join(ROOT, 'server/lib/bank.js')).href);
const live = [];
for (const m of mocks) { const r = validateMock(m.id); if (r.errors.length === 0) { live.push(m.id); ok(`${m.name}: ${r.total} questions, ready`); } else warn(`${m.name}: not complete yet (${r.errors.length} issue${r.errors.length > 1 ? 's' : ''}), hidden from students`); }
let preview = flag('--preview');
if (!live.length && !preview) { warn('No mock is complete yet, so starting in preview mode (partial mocks are listed).'); preview = true; }
if (preview) warn('Preview mode: partial mocks are shown for testing.');

// 5. Port
const free = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '0.0.0.0'); });
let port = Number(opt('--port') || process.env.PORT || 3000);
for (let i = 0; i < 20 && !(await free(port)); i++) port++;

// 6. Database reset (optional)
if (flag('--reset-db')) { for (const f of ['mockdesk.db', 'mockdesk.db-wal', 'mockdesk.db-shm']) fs.rmSync(path.join(ROOT, 'data', f), { force: true }); warn('Database reset: all accounts and attempts removed.'); }

// 7. Start the server
step('Starting the server');
const env = { ...process.env, PORT: String(port), ...(preview ? { MOCKDESK_ALLOW_INCOMPLETE: '1' } : {}) };
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
let stopping = false;
const stop = () => { stopping = true; server.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
server.on('exit', (code) => { if (!stopping) die(`Server stopped unexpectedly (code ${code}).`); console.log('\nStopped. Bye!'); process.exit(0); });

const url = `http://localhost:${port}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`${url}/api/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 300)); } }
if (!up) { stop(); die('The server did not respond in time.'); }
console.log(c(32, `\n  ✓ MockDesk is running`));
console.log(c(1, `\n  Open:  ${url}\n`));
console.log('  Press Ctrl+C in this window to stop.\n');
if (!flag('--no-open')) {
  const cmd = win ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser available */ }
}
