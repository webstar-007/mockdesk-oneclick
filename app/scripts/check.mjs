#!/usr/bin/env node
// Readiness check. Prints ✓ / ! / ✗ for each item and exits 1 if anything blocks the app.
//   node scripts/check.mjs           quick check + live smoke test (about 5 s)
//   node scripts/check.mjs --full    also runs the unit tests and a fresh production build
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
process.removeAllListeners('warning');
const full = process.argv.includes('--full');
const win = process.platform === 'win32';
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
let fails = 0, warns = 0;
const ok = (s) => console.log(c(32, '  ✓ ') + s);
const warn = (s) => { warns++; console.log(c(33, '  ! ') + s); };
const bad = (s) => { fails++; console.log(c(31, '  ✗ ') + s); };
const head = (s) => console.log(c(1, `\n${s}`));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

console.log(c(1, 'MockDesk readiness check'));

head('Environment');
const [maj, min] = process.versions.node.split('.').map(Number);
(maj > 22 || (maj === 22 && min >= 13)) ? ok(`Node ${process.versions.node} (22.13+ needed)`) : bad(`Node ${process.versions.node}: need 22.13 or newer`);
try { await import('node:sqlite'); ok('Built-in SQLite available'); } catch { bad('node:sqlite is missing: use Node 22.13 or newer'); }
for (const d of ['express', 'react', 'react-dom', 'react-router-dom', 'vite', '@vitejs/plugin-react']) fs.existsSync(path.join(ROOT, 'node_modules', d)) ? null : bad(`Package "${d}" not installed: run "npm install" (or start.sh / start.bat)`);
if (!fails) ok('All packages installed');

head('Configuration');
let exam, mocks;
try {
  exam = (await imp('config/exam.config.js')).default; mocks = (await imp('config/mocks.config.js')).default;
  const secKeys = Object.keys(exam.sections);
  const inSeg = exam.segments.flatMap((s) => s.sections);
  secKeys.every((k) => inSeg.filter((x) => x === k).length === 1) && inSeg.every((k) => secKeys.includes(k)) ? ok(`${secKeys.length} sections, each in exactly one timed segment`) : bad('Every section must appear in exactly one segment in config/exam.config.js');
  const total = secKeys.reduce((a, k) => a + exam.sections[k].questions, 0);
  const scoredKeys = secKeys.filter((k) => !exam.sections[k].qualifying);
  const marks = scoredKeys.reduce((a, k) => a + exam.sections[k].questions * exam.sections[k].marksPerQuestion, 0);
  const qualKeys = secKeys.filter((k) => exam.sections[k].qualifying);
  const mins = exam.segments.reduce((a, s) => a + s.minutes, 0);
  ok(`Pattern: ${total} questions in ${mins} minutes; ${scoredKeys.reduce((a, k) => a + exam.sections[k].questions, 0)} scored = ${marks} marks` + (qualKeys.length ? `; qualifying: ${qualKeys.map((k) => `${exam.sections[k].short} (pass ${exam.sections[k].qualifyingMarks}/${exam.sections[k].questions * exam.sections[k].marksPerQuestion})`).join(', ')}` : ''));
  new Set(mocks.map((m) => m.id)).size === mocks.length ? ok(`${mocks.length} mocks registered`) : bad('Duplicate mock ids in config/mocks.config.js');
} catch (e) { bad(`Config failed to load: ${e.message}`); }

head('Question banks');
let live = 0;
if (exam) {
  const { validateMock } = await imp('server/lib/bank.js');
  for (const m of mocks) {
    const r = validateMock(m.id);
    if (!r.errors.length) { live++; ok(`${m.name}: ${r.total} questions valid${r.warnings.length ? c(33, ` (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})`) : ''}`); r.warnings.forEach((w) => warn(w)); }
    else { warn(`${m.name}: incomplete, hidden from students (${r.errors.slice(0, 2).join('; ')}${r.errors.length > 2 ? '; …' : ''})`); }
  }
  live ? ok(`${live} of ${mocks.length} mocks are live`) : warn('No mock is live yet: the app will only show mocks in preview mode (start.sh --preview)');
}

head('Web app build');
const dist = path.join(ROOT, 'dist', 'index.html');
if (full) {
  console.log('  building…');
  const r = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: ROOT, shell: win, encoding: 'utf8' });
  r.status === 0 ? ok('Production build succeeded') : bad('Build failed:\n' + (r.stdout + r.stderr).split('\n').slice(0, 12).join('\n'));
} else if (fs.existsSync(dist)) {
  const newest = (dir) => { let t = 0; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); t = Math.max(t, f.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs); } return t; };
  fs.statSync(dist).mtimeMs >= newest(path.join(ROOT, 'src')) ? ok('dist/ is up to date') : warn('dist/ is older than src/: start.sh will rebuild it');
} else warn('Not built yet: start.sh builds it on first run');

if (full) {
  head('Unit tests');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', 'server/test/api.test.js', 'server/test/scoring.test.js'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MOCKDESK_ALLOW_INCOMPLETE: '1' } });
  const m = /# pass (\d+)/.exec(r.stdout), f = /# fail (\d+)/.exec(r.stdout);
  r.status === 0 ? ok(`${m?.[1]} tests passed`) : bad(`${f?.[1] ?? '?'} test(s) failed. Run "npm test" for details.`);
}

head('Live smoke test (in-process server, temporary database)');
try {
  const { createApp } = await imp('server/app.js'); const { openDb } = await imp('server/lib/db.js');
  const app = createApp(openDb(':memory:'), { allowIncomplete: live === 0, serveClient: false });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api`; let cookie = '';
  const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, body: await r.json() }; };
  try {
    (await call('GET', '/health')).body.ok ? ok('Health endpoint responds') : bad('Health endpoint failed');
    (await call('GET', '/mocks')).status === 401 ? ok('Catalogue requires sign-in') : bad('Catalogue is not protected');
    (await call('POST', '/auth/register', { name: 'Check', email: 'check@example.com', password: 'password123' })).status === 201 ? ok('Registration works') : bad('Registration failed');
    const mk = (await call('GET', '/mocks')).body.mocks[0];
    if (!mk) bad('No mock available to test');
    else {
      const { attemptId } = (await call('POST', `/mocks/${mk.id}/start`)).body;
      let st = (await call('GET', `/attempts/${attemptId}`)).body.attempt;
      const leaked = st.questions.some((q) => 'answer' in q || 'explanation' in q);
      leaked ? bad('Answers leak to the browser during a test!') : ok('Answers stay on the server during a test');
      await call('PUT', `/attempts/${attemptId}/responses`, { responses: { [st.questions[0].id]: { selected: 1, visited: true, marked: false, timeMs: 1000 } }, lastQid: st.questions[0].id });
      ok(`Started ${mk.name}, saved an answer`);
      let out; do { out = (await call('POST', `/attempts/${attemptId}/segment/submit`, {})).body; } while (out.status === 'in_progress');
      const res = (await call('GET', `/attempts/${attemptId}/result`)).body;
      const s = res.summary;
      (s.totalQuestions === s.correct + s.incorrect + s.unattempted && s.score === s.correct * 3 - s.incorrect) ? ok(`Submitted and graded (${s.totalQuestions} scored questions, score ${s.score}/${s.maxMarks})`) : bad('Scoring arithmetic is inconsistent');
      const qs = res.qualifying || [];
      (qs.length === 0 || (s.maxMarks === s.totalQuestions * 3 && qs.every((x) => x.qualifyingMarks === 27 && typeof x.qualified === 'boolean'))) ? ok(qs.length ? `Computer is qualifying only (${qs[0].score}/${qs[0].maxMarks}, cut-off ${qs[0].qualifyingMarks}) and not in the total` : 'No qualifying section in this mock') : bad('Qualifying section is leaking into the total score');
    }
  } finally { srv.close(); }
} catch (e) { bad(`Smoke test crashed: ${e.message}`); }

head('Port');
const free = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p); });
const port = Number(process.env.PORT || 3000);
(await free(port)) ? ok(`Port ${port} is free`) : warn(`Port ${port} is in use: start.sh will pick the next free port`);

console.log('\n' + (fails ? c(31, `✗ ${fails} problem${fails > 1 ? 's' : ''} to fix`) : c(32, '✓ Ready to run')) + (warns ? c(33, `  (${warns} note${warns > 1 ? 's' : ''})`) : ''));
if (!fails) console.log('  Start it with:  ./start.sh   (Windows: start.bat)\n');
process.exit(fails ? 1 : 0);
