import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const f = path.join(os.tmpdir(), `admins2-${Date.now()}.txt`);
fs.writeFileSync(f, 'boss2@example.com\ned@example.com editor   # content only\n');
process.env.MOCKDESK_ADMINS_FILE = f; process.env.MOCKDESK_ADMIN_EMAILS = '';
const { createApp } = await import('../app.js');
const { openDb } = await import('../lib/db.js');
let clock = Date.parse('2026-11-04T00:00:00Z');
const app = createApp(openDb(':memory:'), { allowIncomplete: false, now: () => clock, serveClient: false });
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const jar = { admin: '', ed: '', stu: '', stu2: '', stu3: '' };
async function call(who, method, url, body) {
  const r = await fetch(base + '/api' + url, { method, headers: { 'content-type': 'application/json', cookie: jar[who] }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || ''; return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}
test.after(() => { server.close(); fs.rmSync(f, { force: true }); });
const Q = (o = {}) => ({ section: 'maths', text: 'What is 12 × 12?', options: ['124', '144', '154', '164'], answer: 1, difficulty: 'easy', topic: 'Arithmetic', explanation: '12 × 12 = 144.', ...o });
const reg = (who, email) => call(who, 'POST', '/auth/register', { name: who, email, password: 'password123' });

test('editor role: content only, no student data', async () => {
  await reg('admin', 'boss2@example.com'); await reg('ed', 'ed@example.com'); await reg('stu', 'stu@example.com');
  assert.equal((await call('ed', 'GET', '/me')).body.user.role, 'editor');
  assert.equal((await call('ed', 'GET', '/admin/mocks')).status, 200);
  assert.equal((await call('ed', 'GET', '/admin/coverage')).status, 200);
  assert.equal((await call('ed', 'GET', '/admin/reports')).status, 200);
  for (const u of ['/admin/users', '/admin/attempts', '/admin/analytics', '/admin/overview', '/admin/live', '/admin/integrity', '/admin/system', '/admin/audit', '/admin/backup', '/admin/mocks/mock1/leaderboard', '/admin/announcements']) assert.equal((await call('ed', 'GET', u)).status, 403, u);
  assert.equal((await call('ed', 'GET', '/mocks')).status, 403); // no student side either
  assert.deepEqual((await call('ed', 'GET', '/admin/search?q=stu')).body.users, []);
  assert.equal((await call('admin', 'GET', '/admin/overview')).body.totals.users, 1); // editors and admins are not students
  const up = await call('ed', 'POST', '/admin/mocks/pool/questions', Q({ text: 'Editor wrote this?' })); assert.equal(up.status, 201);
  assert.equal((await call('admin', 'PATCH', `/admin/users/${(await call('ed', 'GET', '/me')).body.user.id}`, { role: 'student', confirm: 'ed@example.com' })).body.user.role, 'student');
});

test('integrity: leaves are recorded, flagged, and can be reviewed', async () => {
  const start = await call('stu', 'POST', '/mocks/mock1/start'); const id = start.body.attemptId; assert.ok(id);
  assert.equal((await call('stu', 'POST', `/attempts/${id}/integrity`, { leaves: 12, fsExits: 4 })).status, 200);
  await call('stu', 'POST', `/attempts/${id}/integrity`, { leaves: 3 }); // counts never go down
  const r = (await call('admin', 'GET', '/admin/integrity?level=low')).body;
  const row = r.attempts.find((x) => x.id === id); assert.ok(row); assert.equal(row.leaves, 12); assert.equal(row.level, 'high');
  assert.ok(row.flags.some((x) => x.code === 'leaves') && row.flags.some((x) => x.code === 'fullscreen'));
  assert.equal((await call('stu', 'GET', '/admin/integrity')).status, 403);
  await call('admin', 'PATCH', `/admin/integrity/${id}`, { reviewed: true });
  assert.ok(!(await call('admin', 'GET', '/admin/integrity?level=low')).body.attempts.find((x) => x.id === id));
  assert.ok((await call('admin', 'GET', '/admin/integrity?level=low&reviewed=1')).body.attempts.find((x) => x.id === id));
});

test('integrity: three accounts on one network address are flagged', async () => {
  await reg('stu2', 's2@example.com'); await reg('stu3', 's3@example.com');
  for (const w of ['stu2', 'stu3']) assert.ok((await call(w, 'POST', '/mocks/mock2/start')).body.attemptId);
  const r = (await call('admin', 'GET', '/admin/integrity?level=low')).body;
  assert.ok(r.sharedIps.length >= 1 && r.sharedIps[0].users.length >= 3);
});

test('mock builder: balances topics, reports shortages, creates a draft from the bank', async () => {
  const add = (o) => call('admin', 'POST', '/admin/mocks/pool/questions', Q(o));
  for (let i = 0; i < 3; i++) await add({ text: `Easy A${i}?`, difficulty: 'easy', topic: 'Percentage' });
  for (let i = 0; i < 3; i++) await add({ text: `Easy B${i}?`, difficulty: 'easy', topic: 'Algebra' });
  await add({ text: 'Hard one?', difficulty: 'hard', topic: 'Algebra' });
  const plan = [{ section: 'maths', easy: 4, moderate: 0, hard: 1 }];
  const dry = (await call('admin', 'POST', '/admin/mocks/build', { dryRun: true, plan })).body;
  assert.equal(dry.summary.picked, 5); assert.equal(dry.shortages.length, 0);
  const topics = dry.preview.filter((x) => x.difficulty === 'easy').map((x) => x.topic).sort(); assert.ok(new Set(topics).size >= 3 && topics.every((t) => topics.filter((x) => x === t).length <= 2)); // spread over topics
  const short = await call('admin', 'POST', '/admin/mocks/build', { name: 'Too big', difficulty: 'easy', plan: [{ section: 'maths', easy: 50 }] });
  assert.equal(short.status, 409); assert.equal(short.body.shortages[0].wanted, 50);
  const ok = await call('admin', 'POST', '/admin/mocks/build', { name: 'Built mock', difficulty: 'easy', plan }); assert.equal(ok.status, 201);
  const mk = (await call('admin', 'GET', `/admin/mocks/${ok.body.mock.id}`)).body; assert.equal(mk.questions.length, 5); assert.equal(mk.mock.status, 'draft');
  assert.equal((await call('admin', 'GET', '/admin/questions?mock=pool')).body.total, 3); // 8 in the bank, 5 moved into the mock
  const part = await call('admin', 'POST', '/admin/mocks/build', { name: 'Partial', difficulty: 'easy', plan: [{ section: 'maths', easy: 9 }], allowPartial: true, include: 'all' }); assert.equal(part.status, 201);
});

test('coverage map and system health', async () => {
  const c = (await call('admin', 'GET', '/admin/coverage')).body; assert.equal(c.sections.length, 5);
  const maths = c.sections.find((s) => s.key === 'maths'); assert.ok(maths.inMocks > 0 && maths.topics.length > 3);
  const sys = (await call('admin', 'GET', '/admin/system')).body; assert.ok(sys.checks.length >= 5 && sys.node && sys.counts.students >= 3);
  assert.equal((await call('admin', 'POST', '/admin/system/check-db')).body.ok, true);
  assert.equal((await call('admin', 'POST', '/admin/system/clear-errors')).body.ok, true);
});
