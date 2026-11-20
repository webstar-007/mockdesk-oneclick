import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const f = path.join(os.tmpdir(), `admins9-${Date.now()}.txt`);
fs.writeFileSync(f, 'boss9@example.com\n');
process.env.MOCKDESK_ADMINS_FILE = f; process.env.MOCKDESK_ADMIN_EMAILS = '';
const { createApp } = await import('../app.js');
const { openDb } = await import('../lib/db.js');
let clock = Date.parse('2026-11-04T10:00:00Z'); const H = 3600000, D = 24 * H;
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
const reg = (who, email) => call(who, 'POST', '/auth/register', { name: `${who} Kumar`, email, password: 'password123' });
async function take(who, mockId, pick = 0) {
  const s = await call(who, 'POST', `/mocks/${mockId}/start`); assert.equal(s.status, 200, JSON.stringify(s.body)); const id = s.body.attemptId;
  for (let i = 0; i < 6; i++) {
    const a = await call(who, 'GET', `/attempts/${id}`); const responses = {};
    (a.body.attempt?.questions || []).forEach((q) => { responses[q.id] = { selected: pick, marked: false, visited: true, timeMs: 4000 }; });
    await call(who, 'PUT', `/attempts/${id}/responses`, { responses });
    if ((await call(who, 'POST', `/attempts/${id}/submit`, { responses })).body.status === 'submitted') break;
  }
  return id;
}
const SECS = ['reasoning', 'ga', 'maths', 'english'];
let exam, mock, live, aAna, aBen;

test('setup: exam, mock built from the bank, two students', async () => {
  await reg('admin', 'boss9@example.com'); await reg('ana', 'ana9@example.com'); await reg('ben', 'ben9@example.com');
  exam = (await call('admin', 'POST', '/admin/exams', { name: 'Mini 9', timing: 'overall', minutes: 12, interface: { style: 'bank', calculator: true }, sections: SECS.map((k) => ({ key: k, name: k, short: k, questions: 3, marks: 2, negative: 0.5 })) })).body.id;
  const b = await call('admin', 'POST', '/admin/mocks/build', { examId: exam, name: 'Nine Mock', difficulty: 'moderate', include: 'all', allowPartial: true, plan: SECS.map((k) => ({ section: k, easy: 0, moderate: 3, hard: 0 })) });
  assert.equal(b.status, 201); mock = b.body.mock.id;
  await call('admin', 'PATCH', `/admin/mocks/${mock}`, { status: 'published' });
  aAna = await take('ana', mock, 0); aBen = await take('ben', mock, 0);
});

test('exam interface style and calculator reach the student', async () => {
  const cfg = await call('ana', 'GET', '/config'); assert.deepEqual(cfg.body.exams.find((x) => x.id === exam).interface, { style: 'bank', calculator: true });
  const s = await call('ana', 'POST', `/mocks/${mock}/start`); assert.deepEqual(s.body.ui ?? (await call('ana', 'GET', `/attempts/${s.body.attemptId}`)).body.attempt.ui, { style: 'bank', calculator: true });
  assert.equal((await call('admin', 'POST', '/admin/exams', { name: 'Bad UI', timing: 'overall', minutes: 5, interface: { style: 'neon' }, sections: [{ key: 'maths', name: 'M', questions: 1, marks: 1, negative: 0 }] })).status, 400);
});

test('result carries pace data, and mistakes can be tagged with a reason', async () => {
  const r = await call('ana', 'GET', `/attempts/${aAna}/result`);
  assert.equal(r.body.segments.length, 1); assert.ok(r.body.expected.maths > 0); assert.deepEqual(r.body.teacherNotes, []);
  const wrong = r.body.questions.find((q) => q.status === 'incorrect'); assert.ok(wrong, 'needs a wrong answer');
  const right = r.body.questions.find((q) => q.status === 'correct');
  assert.equal((await call('ana', 'PUT', `/attempts/${aAna}/errors/${wrong.id}`, { reason: 'bogus' })).status, 400);
  assert.equal((await call('ana', 'PUT', `/attempts/${aAna}/errors/${wrong.id}`, { reason: 'silly' })).status, 200);
  if (right) assert.equal((await call('ana', 'PUT', `/attempts/${aAna}/errors/${right.id}`, { reason: 'silly' })).status, 400);
  assert.equal((await call('ben', 'PUT', `/attempts/${aAna}/errors/${wrong.id}`, { reason: 'silly' })).status, 404, 'cannot tag another student\'s attempt');
  assert.equal((await call('ana', 'GET', `/attempts/${aAna}/errors`)).body.reasons[wrong.id], 'silly');
  const sm = await call('ana', 'GET', '/errors/summary'); assert.equal(sm.body.tagged, 1); assert.equal(sm.body.reasons[0].key, 'silly'); assert.ok(sm.body.mistakes >= 1);
  await call('ana', 'PUT', `/attempts/${aAna}/errors/${wrong.id}`, { reason: '' }); assert.equal((await call('ana', 'GET', '/errors/summary')).body.tagged, 0);
});

test('correcting an answer key re-scores everyone, tells them, and lands in the public fix log', async () => {
  const before = (await call('ana', 'GET', `/attempts/${aAna}/result`)).body; const bBefore = (await call('ben', 'GET', `/attempts/${aBen}/result`)).body;
  const q = before.questions.find((x) => x.status === 'incorrect'); assert.equal(q.selected, 0);
  const full = (await call('admin', 'GET', `/admin/questions/${q.id}`)).body.question;
  const put = await call('admin', 'PUT', `/admin/questions/${q.id}`, { ...full, answer: 0, publicNote: 'Reviewed with the subject lead.' });
  assert.equal(put.body.keyChanged, true, JSON.stringify(put.body)); assert.equal(put.body.rescored, 2);
  const after = (await call('ana', 'GET', `/attempts/${aAna}/result`)).body; const aq = after.questions.find((x) => x.id === q.id);
  assert.equal(aq.status, 'correct'); assert.equal(after.summary.score, before.summary.score + q.marks + q.negativeMarks);
  assert.ok((await call('ben', 'GET', `/attempts/${aBen}/result`)).body.summary.score >= bBefore.summary.score);
  const inbox = await call('ana', 'GET', '/inbox'); assert.ok(inbox.body.items.some((i) => /corrected a question/.test(i.title)), JSON.stringify(inbox.body.items.map((i) => i.title)));
  const fixes = await call('ben', 'GET', '/fixes'); assert.equal(fixes.body.fixes.length, 1); assert.equal(fixes.body.fixes[0].kind, 'answer'); assert.match(fixes.body.fixes[0].summary, /from option . to A/); assert.ok(!('text' in fixes.body.fixes[0]));
  // a second edit with the same key does nothing
  assert.equal((await call('admin', 'PUT', `/admin/questions/${q.id}`, { ...full, answer: 0 })).body.rescored, 0);
});

test('teacher notes: only the student\'s own teacher, student is told, student sees it', async () => {
  const b = await call('admin', 'POST', '/admin/batches', { name: 'Notes batch' }); await reg('tina', 'tina9@example.com'); await reg('zed', 'zed9@example.com');
  await call('admin', 'POST', `/admin/batches/${b.body.id}/teachers`, { identifier: 'tina9@example.com' });
  await call('ben', 'POST', '/batches/join', { code: b.body.code }); const benId = (await call('ben', 'GET', '/me')).body.user.id;
  await call('tina', 'POST', '/auth/login', { email: 'tina9@example.com', password: 'password123' });
  assert.equal((await call('tina', 'POST', `/teacher/students/${benId}/notes`, { attemptId: aBen, note: '' })).status, 400);
  const ok = await call('tina', 'POST', `/teacher/students/${benId}/notes`, { attemptId: aBen, note: 'Good speed. Slow down on reasoning.' }); assert.equal(ok.status, 201);
  assert.equal((await call('tina', 'POST', `/teacher/students/${benId}/notes`, { attemptId: aAna, note: 'not my student' })).status, 404);
  const anaId = (await call('ana', 'GET', '/me')).body.user.id; assert.equal((await call('tina', 'POST', `/teacher/students/${anaId}/notes`, { attemptId: aAna, note: 'x y' })).status, 404);
  assert.equal((await call('ben', 'POST', `/teacher/students/${benId}/notes`, { attemptId: aBen, note: 'sneaky' })).status, 403);
  const r = await call('ben', 'GET', `/attempts/${aBen}/result`); assert.equal(r.body.teacherNotes.length, 1); assert.match(r.body.teacherNotes[0].note, /Slow down/);
  assert.ok((await call('ben', 'GET', '/inbox')).body.items.some((i) => /left a note/.test(i.title)));
  assert.equal((await call('ana', 'GET', `/attempts/${aAna}/result`)).body.teacherNotes.length, 0);
  assert.equal((await call('tina', 'DELETE', `/teacher/notes/${ok.body.note.id}`)).status, 200);
  assert.equal((await call('ben', 'GET', `/attempts/${aBen}/result`)).body.teacherNotes.length, 0);
});

test('integrity: an excluded attempt drops off the live board, and students see the check', async () => {
  const cl = await call('admin', 'POST', '/admin/mocks', { name: 'Nine Live', difficulty: 'moderate', cloneFrom: mock }); live = cl.body.mock.id;
  const open = clock + H, close = clock + 3 * H;
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${live}`, { status: 'published', availableFrom: new Date(open).toISOString(), liveUntil: new Date(close).toISOString() })).status, 200);
  clock = open + H; const la = await take('ana', live, 0); const lb = await take('ben', live, 1);
  assert.equal((await call('ana', 'GET', `/attempts/${la}/result`)).body.live.integrity, 'pending');
  assert.equal((await call('admin', 'PATCH', `/admin/integrity/${lb}`, { excluded: true })).status, 200);
  clock = close + H;
  const board = await call('ana', 'GET', `/mocks/${live}/live`); assert.equal(board.body.top.length, 1); assert.equal(board.body.removed, 1); assert.equal(board.body.top[0].you, true);
  const ra = (await call('ana', 'GET', `/attempts/${la}/result`)).body.live; assert.equal(ra.integrity, 'verified'); assert.equal(ra.rank, 1); assert.equal(ra.removedCount, 1);
  const rb = (await call('ben', 'GET', `/attempts/${lb}/result`)).body.live; assert.equal(rb.integrity, 'removed'); assert.equal(rb.rank, undefined);
  assert.equal((await call('admin', 'PATCH', `/admin/integrity/${lb}`, { excluded: false })).status, 200);
  assert.equal((await call('ana', 'GET', `/mocks/${live}/live`)).body.top.length, 2);
});

test('cohorts: funnel, weekly retention, win-back groups and one-click nudge', async () => {
  clock += 12 * D; // everyone has gone quiet
  for (const [w, e] of [['admin', 'boss9'], ['ana', 'ana9'], ['ben', 'ben9']]) await call(w, 'POST', '/auth/login', { email: `${e}@example.com`, password: 'password123' });
  await reg('newbie', 'newbie9@example.com'); clock += 4 * D; await call('newbie', 'POST', '/auth/login', { email: 'newbie9@example.com', password: 'password123' });
  const c = await call('admin', 'GET', '/admin/cohorts'); assert.equal(c.status, 200);
  assert.equal(c.body.funnel[0].label, 'Signed up'); assert.ok(c.body.funnel[2].n >= 2); assert.equal(c.body.weeks.length, 8);
  const seg = (k) => c.body.segments.find((x) => x.key === k);
  assert.ok(seg('never_started').count >= 1); assert.ok(seg('never_started').sample.some((n) => /newbie/.test(n)));
  assert.equal((await call('admin', 'POST', '/admin/cohorts/nudge', { segment: 'nope' })).status, 400);
  const n = await call('admin', 'POST', '/admin/cohorts/nudge', { segment: 'never_started', title: 'Start your first mock', link: '/' }); assert.ok(n.body.sent >= 1);
  assert.ok((await call('newbie', 'GET', '/inbox')).body.items.some((i) => /first mock/.test(i.title)));
  assert.equal((await call('admin', 'POST', '/admin/cohorts/nudge', { segment: 'never_started', link: 'http://evil.example' })).status, 400);
  assert.equal((await call('ana', 'GET', '/admin/cohorts')).status, 403);
});

test('alerts: flagged questions surface, can be dismissed', async () => {
  const a = await call('admin', 'GET', '/admin/alerts'); assert.equal(a.status, 200); assert.ok(typeof a.body.count === 'number'); assert.ok(Array.isArray(a.body.items));
  if (a.body.items[0]) { assert.equal((await call('admin', 'POST', `/admin/alerts/${a.body.items[0].id}/dismiss`)).status, 200); assert.equal((await call('admin', 'GET', '/admin/alerts')).body.count, a.body.count - 1); }
  assert.equal((await call('ana', 'GET', '/admin/alerts')).status, 403);
});
