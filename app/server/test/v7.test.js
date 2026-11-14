import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const f = path.join(os.tmpdir(), `admins7-${Date.now()}.txt`);
fs.writeFileSync(f, 'boss7@example.com\n');
process.env.MOCKDESK_ADMINS_FILE = f; process.env.MOCKDESK_ADMIN_EMAILS = '';
const { createApp } = await import('../app.js');
const { openDb } = await import('../lib/db.js');
let clock = Date.parse('2026-11-04T10:00:00Z');
const app = createApp(openDb(':memory:'), { allowIncomplete: true, now: () => clock, serveClient: false });
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const jar = {};
async function call(who, method, url, body) {
  const r = await fetch(base + '/api' + url, { method, headers: { 'content-type': 'application/json', cookie: jar[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}
test.after(() => { server.close(); fs.rmSync(f, { force: true }); });
const reg = (who, email, extra = {}) => call(who, 'POST', '/auth/register', { name: who, email, password: 'password123', ...extra });
/** Take a mock, answering the first n questions of the open segment, then submit. */
async function takeMock(who, mockId, n = 8) {
  const s = await call(who, 'POST', `/mocks/${mockId}/start`); assert.equal(s.status, 200, JSON.stringify(s.body));
  const a = await call(who, 'GET', `/attempts/${s.body.attemptId}`);
  const responses = {}; a.body.attempt.questions.slice(0, n).forEach((q) => { responses[q.id] = { selected: 0, marked: false, visited: true, timeMs: 5000 }; });
  await call(who, 'PUT', `/attempts/${s.body.attemptId}/responses`, { responses });
  await call(who, 'POST', `/attempts/${s.body.attemptId}/submit`, { responses });
  return s.body.attemptId;
}
let firstMock;

test('setup: admin, students and a mock to take', async () => {
  await reg('admin', 'boss7@example.com'); await reg('ana', 'ana7@example.com'); await reg('ben', 'ben7@example.com');
  const m = await call('ana', 'GET', '/mocks'); assert.ok(m.body.mocks.length >= 1); firstMock = m.body.mocks[0].id;
});

test('referral: code, friend joins with it, first real attempt rewards both', async () => {
  const set = await call('admin', 'GET', '/admin/mocks');
  // make the second mock a referral reward, locked until its release date
  const second = set.body.mocks.find((x) => x.id !== firstMock);
  assert.ok(second, 'fixture needs two mocks');
  const p = await call('admin', 'PATCH', `/admin/mocks/${second.id}`, { refLocked: true }); assert.equal(p.status, 200);
  const list = await call('ana', 'GET', '/mocks'); assert.equal(list.body.mocks.find((x) => x.id === second.id).locked, true);
  assert.equal((await call('ana', 'POST', `/mocks/${second.id}/start`)).status, 403);
  const rf = await call('ana', 'GET', '/referral'); assert.match(rf.body.code, /^[A-Z0-9]{6}$/); assert.ok(rf.body.link.includes(rf.body.code));
  await reg('cara', 'cara7@example.com', { ref: rf.body.code });
  assert.equal((await call('ana', 'GET', '/referral')).body.joined, 1);
  await takeMock('cara', firstMock, 8);
  assert.equal((await call('ana', 'GET', '/referral')).body.qualified, 1);
  assert.equal((await call('ana', 'POST', `/mocks/${second.id}/start`)).status, 200);
  assert.equal((await call('cara', 'POST', `/mocks/${second.id}/start`)).status, 200);
  assert.equal((await call('ben', 'POST', `/mocks/${second.id}/start`)).status, 403);
  const adm = await call('admin', 'GET', '/admin/referrals'); assert.equal(adm.body.stats.qualified, 1);
  assert.equal((await reg('self', 'self7@example.com', { ref: 'ZZZZZZ' })).status, 201);
});

test('practice: needs a finished mock, builds a hidden practice attempt, stays off the leaderboard', async () => {
  assert.equal((await call('ben', 'POST', '/practice', { size: 10 })).status, 409);
  await takeMock('ben', firstMock, 10);
  const ov = await call('ben', 'GET', '/practice/overview'); assert.equal(ov.status, 200);
  const dry = await call('ben', 'POST', '/practice', { size: 10, dryRun: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.ok(dry.body.count >= 5);
  const made = await call('ben', 'POST', '/practice', { size: 10 }); assert.ok(made.body.attemptId);
  assert.equal((await call('ben', 'POST', '/practice', { size: 10 })).body.resumed, true);
  const st = await call('ben', 'GET', `/attempts/${made.body.attemptId}`); assert.equal(st.body.status, 'in_progress');
  await call('ben', 'POST', `/attempts/${made.body.attemptId}/submit`, { responses: {} });
  const rs = await call('ben', 'GET', `/attempts/${made.body.attemptId}/result`); assert.equal(rs.body.kind, 'practice'); assert.equal(rs.body.community.unlocked, false);
  assert.ok(!(await call('ben', 'GET', '/mocks')).body.mocks.some((m) => m.id === 'practice'));
  const stats = await call('ben', 'GET', '/stats'); assert.equal(stats.body.completed, 1);
  const lb = await call('admin', 'GET', '/admin/mocks'); assert.ok(!lb.body.mocks.some((m) => m.id === 'practice'));
});

test('announcements v2: audience, schedule, dismiss, click, stats', async () => {
  const t = clock;
  const c = await call('admin', 'POST', '/admin/announcements', { title: 'Mock 5 is live', text: 'Take it tonight.', level: 'good', linkUrl: '/', linkLabel: 'Open', audience: 'all', pinned: true });
  assert.equal(c.status, 201);
  const later = await call('admin', 'POST', '/admin/announcements', { text: 'Later', startsAt: t + 3600000, audience: 'all' }); assert.equal(later.status, 201);
  assert.equal((await call('admin', 'POST', '/admin/announcements', { text: 'x', linkUrl: 'javascript:alert(1)' })).status, 400);
  const mine = await call('ben', 'GET', '/announcements'); assert.deepEqual(mine.body.announcements.map((a) => a.text), ['Take it tonight.']);
  await call('ben', 'POST', `/announcements/${c.body.id}/click`);
  await call('ben', 'POST', `/announcements/${c.body.id}/dismiss`);
  assert.equal((await call('ben', 'GET', '/announcements')).body.announcements.length, 0);
  assert.equal((await call('ana', 'GET', '/announcements')).body.announcements.length, 1);
  clock += 2 * 3600000;
  assert.equal((await call('ana', 'GET', '/announcements')).body.announcements.length, 2);
  const list = await call('admin', 'GET', '/admin/announcements'); const a = list.body.announcements.find((x) => x.id === c.body.id);
  assert.equal(a.stats.clicked, 1); assert.equal(a.stats.dismissed, 1); assert.equal(a.status, 'live');
  const inbox = await call('ana', 'GET', '/inbox'); assert.ok(inbox.body.unread >= 1);
  await call('ana', 'POST', '/inbox/read'); assert.equal((await call('ana', 'GET', '/inbox')).body.unread, 0);
  await call('admin', 'POST', `/admin/announcements/${c.body.id}/end`);
  assert.ok(!(await call('ana', 'GET', '/announcements')).body.announcements.some((x) => x.id === c.body.id));
});

test('notifications: prefs, unsubscribe link, reminder rules and admin config', async () => {
  assert.equal((await call('ana', 'PATCH', '/notifications/prefs', { email: false })).body.prefs.email, false);
  const tok = app.notifier.token(1); const bad = await call('x', 'GET', '/unsubscribe?u=1&t=nope'); assert.equal(bad.status, 400);
  const ok = await call('x', 'GET', `/unsubscribe?u=1&t=${tok}`); assert.equal(ok.status, 200);
  const cfg = await call('admin', 'GET', '/admin/notifications'); assert.equal(cfg.status, 200); assert.equal(cfg.body.flags.emailReady, false);
  const put = await call('admin', 'PUT', '/admin/notifications/config', { inactive: { enabled: true, days: 3 }, weeklyCap: 2 }); assert.equal(put.body.config.inactive.days, 3); assert.equal(put.body.config.weeklyCap, 2);
  clock = Date.parse('2026-11-12T10:00:00Z'); // long after everyone last practised
  const run = await app.runReminders({ force: true }); assert.ok(run.rules.inactive.eligible >= 1);
  const again = await app.runReminders({ force: true }); assert.equal(again.rules.inactive.sent, 0); // never repeats inside the window
  const inbox = await call('ben', 'GET', '/inbox'); assert.ok(inbox.body.items.some((i) => i.kind === 'reminder'));
});

test('quality report lists questions with right/wrong/time and is open to editors', async () => {
  const q = await call('admin', 'GET', '/admin/quality?min=1'); assert.equal(q.status, 200); assert.ok(q.body.total >= 1);
  const x = q.body.questions[0]; assert.ok('pctRight' in x && 'avgTimeSec' in x && Array.isArray(x.options));
  assert.equal((await call('ana', 'GET', '/admin/quality')).status, 403);
});

test('batches: teacher sees only their own students', async () => {
  const b = await call('admin', 'POST', '/admin/batches', { name: 'Evening batch' }); assert.equal(b.status, 201);
  const other = await call('admin', 'POST', '/admin/batches', { name: 'Morning batch' });
  await reg('tina', 'tina7@example.com');
  assert.equal((await call('admin', 'POST', `/admin/batches/${b.body.id}/teachers`, { identifier: 'tina7@example.com' })).status, 200);
  assert.equal((await call('admin', 'POST', `/admin/batches/${other.body.id}/teachers`, { identifier: 'nobody@example.com', name: 'Other T' })).status, 200);
  assert.equal((await call('ben', 'POST', '/batches/join', { code: 'WRONG1' })).status, 404);
  assert.equal((await call('ben', 'POST', '/batches/join', { code: b.body.code.toLowerCase() })).body.joined, true);
  const add = await call('admin', 'POST', `/admin/batches/${other.body.id}/students`, { list: 'ana7@example.com, ghost@example.com' }); assert.equal(add.body.added, 1); assert.deepEqual(add.body.notFound, ['ghost@example.com']);
  const login = await call('tina', 'POST', '/auth/login', { email: 'tina7@example.com', password: 'password123' }); assert.equal(login.body.user.role, 'teacher');
  const lst = await call('tina', 'GET', '/teacher/batches'); assert.deepEqual(lst.body.batches.map((x) => x.name), ['Evening batch']);
  const det = await call('tina', 'GET', `/teacher/batches/${b.body.id}`); assert.deepEqual(det.body.students.map((s) => s.name), ['ben']);
  assert.equal((await call('tina', 'GET', `/teacher/batches/${other.body.id}`)).status, 404);
  const ben = det.body.students[0]; assert.equal((await call('tina', 'GET', `/teacher/batches/${b.body.id}/students/${ben.id}`)).status, 200);
  const ana = (await call('admin', 'GET', `/admin/batches/${other.body.id}`)).body.students[0];
  assert.equal((await call('tina', 'GET', `/teacher/batches/${b.body.id}/students/${ana.id}`)).status, 404);
  const csv = await call('tina', 'GET', `/teacher/batches/${b.body.id}/export.csv`); assert.match(csv.body, /Name,Contact/);
  assert.equal((await call('tina', 'GET', '/mocks')).status, 403);
  assert.equal((await call('tina', 'GET', '/admin/overview')).status, 403);
  assert.equal((await call('ben', 'GET', '/teacher/batches')).status, 403);
});
