import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../lib/db.js';

process.env.MOCKDESK_ADMIN_EMAILS = 'boss@example.com';
let clock = Date.parse('2026-11-04T00:00:00Z');
const app = createApp(openDb(':memory:'), { allowIncomplete: false, now: () => clock, serveClient: false });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const jar = { admin: '', stu: '' };
async function call(who, method, url, body, raw) {
  const r = await fetch(base + '/api' + url, { method, headers: { 'content-type': raw?.type || 'application/json', cookie: jar[who] }, body: raw ? raw.data : body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}
test.after(() => server.close());

const Q = (o = {}) => ({ section: 'maths', text: 'What is 12 × 12?', options: ['124', '144', '154', '164'], answer: 1, difficulty: 'easy', topic: 'Arithmetic', explanation: '12 × 12 = 144.', steps: ['12 × 12 = 144'], ...o });

test('roles: admin API is closed to students and open to the configured admin', async () => {
  await call('stu', 'POST', '/auth/register', { name: 'Stu', email: 'stu@example.com', password: 'password123' });
  assert.equal((await call('stu', 'GET', '/admin/overview')).status, 403);
  assert.equal((await call('stu', 'GET', '/me')).body.user.role, 'student');
  await call('admin', 'POST', '/auth/register', { name: 'Boss', email: 'boss@example.com', password: 'password123' });
  assert.equal((await call('admin', 'GET', '/me')).body.user.role, 'admin');
  const o = await call('admin', 'GET', '/admin/overview');
  assert.equal(o.status, 200); assert.equal(o.body.totals.users, 1); // admins are not counted as students
  assert.equal((await call('admin', 'GET', '/mocks')).status, 403); // admin accounts have no student side
  assert.equal((await call('admin', 'POST', '/mocks/mock1/start')).status, 403);
  assert.equal((await call('stu', 'GET', '/mocks')).status, 200);
});

test('built-in mocks were imported into the database', async () => {
  const m = (await call('admin', 'GET', '/admin/mocks')).body.mocks;
  assert.equal(m.length, 5); assert.ok(m.every((x) => x.source === 'file' && x.status === 'published' && x.questions === 150 && x.errors === 0));
  const stu = (await call('stu', 'GET', '/mocks')).body.mocks; assert.equal(stu.length, 5);
});

test('mock builder: create, add question with image, validate, publish, student sees it', async () => {
  const c = await call('admin', 'POST', '/admin/mocks', { name: 'Sectional Test A', difficulty: 'moderate', tags: ['Maths', 'moderate'] });
  assert.equal(c.status, 201); const id = c.body.mock.id; assert.equal(c.body.mock.status, 'draft');
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${id}`, { status: 'published' })).status, 422); // empty mock cannot publish
  assert.equal((await call('stu', 'GET', '/mocks')).body.mocks.length, 5); // drafts are invisible
  // image upload
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  assert.equal((await call('admin', 'POST', '/admin/upload', null, { type: 'text/plain', data: 'hi' })).status, 400);
  const up = await call('admin', 'POST', '/admin/upload', null, { type: 'image/png', data: png }); assert.equal(up.status, 201);
  assert.equal((await fetch(base + up.body.url)).status, 200);
  assert.equal((await call('admin', 'POST', `/admin/mocks/${id}/questions`, Q({ image: 'http://evil/x.png' }))).status, 400);
  assert.equal((await call('admin', 'POST', `/admin/mocks/${id}/questions`, Q({ answer: 9 }))).status, 400);
  const q1 = await call('admin', 'POST', `/admin/mocks/${id}/questions`, Q({ image: up.body.url, tags: ['Percent', 'percent'], check: 'process.exit(1)' }));
  assert.equal(q1.status, 201); assert.equal(q1.body.question.image, up.body.url); assert.deepEqual(q1.body.question.tags, ['percent']); assert.equal(q1.body.question.check, undefined);
  const q2 = await call('admin', 'POST', `/admin/mocks/${id}/questions`, Q({ text: 'What is 13 × 13?', options: ['', '', '', ''], optionImages: [up.body.url, null, null, null], answer: 0 }));
  assert.equal(q2.status, 400 === q2.status ? 201 : 201); // images count as option content (validated at publish)
  const g = await call('admin', 'GET', `/admin/mocks/${id}`); assert.equal(g.body.questions.length, 2);
  assert.ok(g.body.validation.errors.length > 0, 'option 2-4 empty must be reported');
  await call('admin', 'DELETE', `/admin/questions/${q2.body.question.id}`);
  assert.equal((await call('admin', 'GET', `/admin/mocks/${id}`)).body.validation.errors.length, 0);
  const pub = await call('admin', 'PATCH', `/admin/mocks/${id}`, { status: 'published' }); assert.equal(pub.status, 200);
  const list = (await call('stu', 'GET', '/mocks')).body.mocks; const mine = list.find((x) => x.id === id);
  assert.ok(mine); assert.equal(mine.totalQuestions, 1); assert.ok(mine.totalMinutes >= 1 && mine.totalMinutes <= 3, 'timer scales for a partial mock');
  // student takes it; edits afterwards do not change the running attempt
  const st = await call('stu', 'POST', `/mocks/${id}/start`); assert.equal(st.status, 200);
  await call('admin', 'PUT', `/admin/questions/${q1.body.question.id}`, Q({ text: 'EDITED after start', image: up.body.url }));
  const state = (await call('stu', 'GET', `/attempts/${st.body.attemptId}`)).body.attempt;
  assert.equal(state.questions[0].text, 'What is 12 × 12?'); assert.equal(state.questions[0].image, up.body.url);
  assert.equal((await call('stu', 'POST', `/attempts/${st.body.attemptId}/submit`, { responses: { [q1.body.question.id]: { selected: 1, timeMs: 5000 } } })).status, 200);
  const res = (await call('stu', 'GET', `/attempts/${st.body.attemptId}/result`)).body; assert.equal(res.summary.score, 3);
  // admin sees the attempt and the student's profile
  const at = (await call('admin', 'GET', '/admin/attempts?mock=' + id)).body; assert.equal(at.total, 1); assert.equal(at.attempts[0].score, 3);
  assert.equal((await call('admin', 'GET', `/admin/attempts/${st.body.attemptId}`)).body.result.summary.score, 3);
  const users = (await call('admin', 'GET', '/admin/users?q=stu@')).body; assert.equal(users.total, 1); assert.equal(users.users[0].completed, 1);
  const detail = (await call('admin', 'GET', `/admin/users/${users.users[0].id}`)).body; assert.equal(detail.summary.completed, 1);
  // a mock with attempts is archived, not deleted
  assert.equal((await call('admin', 'DELETE', `/admin/mocks/${id}`)).body.archived, true);
});

test('bulk import validates rows and clone copies questions', async () => {
  const id = (await call('admin', 'POST', '/admin/mocks', { name: 'Import me', difficulty: 'hard' })).body.mock.id;
  const rows = [Q(), Q({ text: 'Second one', options: ['1', '2', '3', '4'], answer: 2 }), Q({ text: 'Broken', answer: 7 })];
  const dry = await call('admin', 'POST', `/admin/mocks/${id}/import`, { rows }); assert.equal(dry.body.added, 0); assert.equal(dry.body.problems.length, 1);
  const ok = await call('admin', 'POST', `/admin/mocks/${id}/import`, { rows, skipBad: true }); assert.equal(ok.body.added, 2);
  const cl = await call('admin', 'POST', `/admin/mocks/${id}/clone`); assert.equal(cl.status, 201); assert.equal(cl.body.mock.questions, 2);
  const bank = (await call('admin', 'GET', '/admin/questions?q=second')).body; assert.ok(bank.total >= 2);
});

test('user management: suspend blocks access, role needs confirmation, audit log records it', async () => {
  const u = (await call('admin', 'GET', '/admin/users?q=stu@')).body.users[0];
  assert.equal((await call('admin', 'PATCH', `/admin/users/${u.id}`, { role: 'admin' })).status, 400);
  assert.equal((await call('admin', 'PATCH', `/admin/users/${u.id}`, { status: 'suspended' })).status, 200);
  assert.equal((await call('stu', 'GET', '/mocks')).status, 401); // sessions revoked
  assert.equal((await call('stu', 'POST', '/auth/login', { email: 'stu@example.com', password: 'password123' })).status, 403);
  await call('admin', 'PATCH', `/admin/users/${u.id}`, { status: 'active' });
  assert.equal((await call('stu', 'POST', '/auth/login', { email: 'stu@example.com', password: 'password123' })).status, 200);
  const me = (await call('admin', 'GET', '/admin/users?q=boss')).body.users[0];
  assert.equal((await call('admin', 'PATCH', `/admin/users/${me.id}`, { status: 'suspended' })).status, 400); // cannot lock yourself out
  const csv = await call('admin', 'GET', '/admin/users.csv'); assert.match(csv.body, /Email/); assert.match(csv.body, /stu@example.com/);
  const log = (await call('admin', 'GET', '/admin/audit')).body; assert.ok(log.entries.some((e) => e.action === 'user_suspend'));
});

test('student can report a question; admin resolves it; announcement shows', async () => {
  const mock = (await call('stu', 'GET', '/mocks')).body.mocks.find((m) => m.id.startsWith('m_') === false);
  const st = await call('stu', 'POST', `/mocks/${mock.id}/start`); await call('stu', 'POST', `/attempts/${st.body.attemptId}/submit`, {});
  const res = (await call('stu', 'GET', `/attempts/${st.body.attemptId}/result`)).body; const qid = res.questions[0].id;
  assert.equal((await call('stu', 'POST', `/questions/${qid}/report`, { reason: 'wrong_answer', note: 'Key looks wrong' })).status, 201);
  const reps = (await call('admin', 'GET', '/admin/reports')).body; assert.equal(reps.reports.length, 1);
  await call('admin', 'PATCH', `/admin/reports/${reps.reports[0].id}`, { status: 'resolved', adminNote: 'Checked, key is right' });
  assert.equal((await call('admin', 'GET', '/admin/reports')).body.reports.length, 0);
  await call('admin', 'POST', '/admin/announcements', { text: 'Mock 6 arrives Sunday', level: 'info' });
  assert.equal((await call('stu', 'GET', '/announcements')).body.announcements[0].text, 'Mock 6 arrives Sunday');
  const an = (await call('admin', 'GET', '/admin/analytics')).body; assert.ok(an.sample >= 1); assert.ok(an.histogram.length === 10);
});

test('question bank: add without a mock, pull into a mock, bulk edit, search, segments, admins.txt', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  clock += 5000;
  const a = await call('admin', 'POST', '/admin/mocks/pool/questions', Q({ text: 'Pool question one?', difficulty: 'hard' })); assert.equal(a.status, 201); assert.equal(a.body.question.addedAt, clock);
  const b = await call('admin', 'POST', '/admin/mocks/pool/questions', Q({ text: 'Pool question two?' })); assert.equal(b.status, 201);
  const list = (await call('admin', 'GET', '/admin/questions?mock=pool&sort=added')).body; assert.equal(list.total, 2); assert.ok(list.questions[0].addedAt);
  const mk = (await call('admin', 'POST', '/admin/mocks', { name: 'Pull target', difficulty: 'moderate' })).body.mock.id;
  const pull = await call('admin', 'POST', `/admin/mocks/${mk}/pull`, { ids: [a.body.question.id] }); assert.equal(pull.body.added, 1);
  assert.equal((await call('admin', 'GET', '/admin/questions?mock=pool')).body.total, 1); // moved out of the pool
  assert.equal((await call('admin', 'GET', `/admin/mocks/${mk}`)).body.questions.length, 1);
  const bulk = await call('admin', 'POST', '/admin/questions/bulk', { action: 'tag', ids: [b.body.question.id], value: 'Revision' }); assert.equal(bulk.body.changed, 1);
  assert.deepEqual((await call('admin', 'GET', `/admin/questions/${b.body.question.id}`)).body.question.tags, ['revision']);
  assert.equal((await call('admin', 'POST', '/admin/questions/bulk', { action: 'difficulty', ids: [b.body.question.id], value: 'hard' })).body.changed, 1);
  assert.equal((await call('stu', 'GET', '/admin/overview')).status, 403);
  assert.ok((await call('admin', 'GET', '/admin/search?q=pool question')).body.questions.length >= 1);
  assert.ok(Array.isArray((await call('admin', 'GET', '/admin/live')).body.live));
  assert.ok(Array.isArray((await call('admin', 'GET', '/admin/users?segment=never')).body.users));
  assert.equal((await call('admin', 'POST', '/admin/questions/bulk', { action: 'delete', ids: [b.body.question.id] })).body.changed, 1);
  // admins.txt: emails and mobile numbers
  const { promoteAdmins } = await import('../lib/admins.js'); const db = openDb(':memory:'); const f = path.join(os.tmpdir(), `admins-${Date.now()}.txt`);
  fs.writeFileSync(f, '# comment\nboss2@example.com   # trailing\n98765 43210\n+14155550123\nnot-a-number\n'); process.env.MOCKDESK_ADMINS_FILE = f;
  db.prepare("INSERT INTO users(name,email,phone,created_at,role) VALUES ('E','boss2@example.com',NULL,'x','student'),('P','x@y.z','+919876543210','x','student'),('Q','q@y.z','+14155550123','x','student'),('N','n@y.z',NULL,'x','student')").run();
  assert.equal(promoteAdmins(db), 3); assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c, 3); delete process.env.MOCKDESK_ADMINS_FILE; fs.rmSync(f);
});
