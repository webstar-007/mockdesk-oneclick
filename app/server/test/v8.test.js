import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const f = path.join(os.tmpdir(), `admins8-${Date.now()}.txt`);
fs.writeFileSync(f, 'boss8@example.com\n');
process.env.MOCKDESK_ADMINS_FILE = f; process.env.MOCKDESK_ADMIN_EMAILS = '';
const { createApp } = await import('../app.js');
const { openDb } = await import('../lib/db.js');
let clock = Date.parse('2026-11-04T10:00:00Z');
const H = 3600000;
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
/** Start a mock, answer every open question with option `pick` (or the correct one when `right` is a map), submit. */
async function take(who, mockId, pick = 0) {
  const s = await call(who, 'POST', `/mocks/${mockId}/start`); if (s.status !== 200) return { status: s.status, body: s.body };
  const id = s.body.attemptId;
  for (let guard = 0; guard < 6; guard++) {
    const a = await call(who, 'GET', `/attempts/${id}`); if (a.body.attempt?.status === 'submitted' || a.body.status === 'submitted') break;
    const responses = {}; (a.body.attempt?.questions || []).forEach((q) => { responses[q.id] = { selected: pick, marked: false, visited: true, timeMs: 4000 }; });
    await call(who, 'PUT', `/attempts/${id}/responses`, { responses });
    const r = await call(who, 'POST', `/attempts/${id}/submit`, { responses });
    if (r.body.status === 'submitted') break;
  }
  return { status: 200, id };
}
let exam, mockA, mockLive, mockPyq;
const SECTIONS = ['reasoning', 'ga', 'maths', 'english'];

test('exams: create from a template, built-in is read-only, students see it', async () => {
  await reg('admin', 'boss8@example.com'); await reg('ana', 'ana8@example.com'); await reg('ben', 'ben8@example.com'); await reg('cara', 'cara8@example.com');
  const l = await call('admin', 'GET', '/admin/exams'); assert.equal(l.status, 200);
  assert.ok(l.body.templates.some((t) => t.id === 'ssc-chsl-t1')); assert.ok(l.body.exams.find((x) => x.builtin));
  assert.equal((await call('admin', 'PUT', '/admin/exams/ssc-cgl-t2', { name: 'x', sections: [] })).status, 400);
  assert.equal((await call('admin', 'POST', '/admin/exams', { name: '', sections: [] })).status, 400);
  const mini = { name: 'Mini Test Exam', short: 'Mini', timing: 'overall', minutes: 10, sections: SECTIONS.map((k) => ({ key: k, name: k, short: k, questions: 3, marks: 2, negative: 0.5 })) };
  const c = await call('admin', 'POST', '/admin/exams', mini); assert.equal(c.status, 201, JSON.stringify(c.body)); exam = c.body.id;
  const cfg = await call('ana', 'GET', '/config');
  const e = cfg.body.exams.find((x) => x.id === exam); assert.ok(e); assert.ok(cfg.body.exams.length >= 2);
  assert.equal(cfg.body.patterns[exam].segments.length, 1); assert.equal(cfg.body.patterns[exam].scoredMarks, 24);
});

test('a mock follows its exam: builder, marking (+2 / −0.5) and one overall timer', async () => {
  const b = await call('admin', 'POST', '/admin/mocks/build', { examId: exam, name: 'Mini Mock 1', difficulty: 'moderate', include: 'all', allowPartial: true, plan: SECTIONS.map((k) => ({ section: k, easy: 0, moderate: 3, hard: 0 })) });
  assert.equal(b.status, 201, JSON.stringify(b.body)); mockA = b.body.mock.id;
  const d = await call('admin', 'GET', `/admin/mocks/${mockA}`); assert.equal(d.body.mock.examId, exam);
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${mockA}`, { status: 'published' })).status, 200);
  const cl = await call('admin', 'POST', '/admin/mocks', { name: 'Mini Live', difficulty: 'moderate', cloneFrom: mockA }); assert.equal(cl.status, 201); mockLive = cl.body.mock.id;
  const cp = await call('admin', 'POST', '/admin/mocks', { name: 'Mini 2019 paper', difficulty: 'moderate', cloneFrom: mockA }); mockPyq = cp.body.mock.id;
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${mockPyq}`, { status: 'published', kind: 'pyq', paperYear: 2019, paperLabel: 'Shift 2' })).status, 200);
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${mockPyq}`, { paperYear: 1800 })).status, 400);
  const list = (await call('ana', 'GET', '/mocks')).body.mocks; const m = list.find((x) => x.id === mockA);
  assert.equal(m.examId, exam); assert.equal(m.segments.length, 1); assert.equal(m.segments[0].minutes, 10); assert.equal(m.cfg.maths.marksPerQuestion, 2);
  assert.equal(m.totalMarks, 24); assert.deepEqual([list.find((x) => x.id === mockPyq).kind, list.find((x) => x.id === mockPyq).paperYear], ['pyq', 2019]);
  const t = await take('ana', mockA, 0); const r = await call('ana', 'GET', `/attempts/${t.id}/result`);
  const s = r.body.summary; assert.equal(s.maxMarks, 24);
  assert.equal(s.score, s.correct * 2 - s.incorrect * 0.5); assert.ok(s.correct + s.incorrect > 0);
});

test('exam pattern locks once attempts exist; exam with mocks cannot be deleted', async () => {
  const cur = (await call('admin', 'GET', '/admin/exams')).body.exams.find((x) => x.id === exam);
  const edit = (fn) => { const b = JSON.parse(JSON.stringify(cur)); fn(b); return b; };
  assert.equal((await call('admin', 'PUT', `/admin/exams/${exam}`, edit((b) => { b.sections[0].marks = 3; }))).status, 400);
  assert.equal((await call('admin', 'PUT', `/admin/exams/${exam}`, edit((b) => { b.description = 'renamed only'; }))).status, 200);
  assert.equal((await call('admin', 'DELETE', `/admin/exams/${exam}`)).status, 400);
  assert.equal((await call('admin', 'PATCH', `/admin/exams/${exam}`, { active: false })).status, 200);
  assert.ok(!(await call('ana', 'GET', '/config')).body.exams.some((x) => x.id === exam));
  assert.equal((await call('admin', 'PATCH', `/admin/exams/${exam}`, { active: true })).status, 200);
  const tmp = await call('admin', 'POST', '/admin/exams', { name: 'Temp', timing: 'overall', minutes: 5, sections: [{ key: 'maths', name: 'Maths', questions: 2, marks: 1, negative: 0 }] });
  assert.equal((await call('admin', 'DELETE', `/admin/exams/${tmp.body.id}`)).status, 200);
});

test('live window: anytime inside it, first finished attempt counts, ranks only after close', async () => {
  const open = clock + 1 * H, close = clock + 25 * H;
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${mockLive}`, { liveUntil: new Date(close).toISOString() })).status, 400, 'needs an opening time');
  const p = await call('admin', 'PATCH', `/admin/mocks/${mockLive}`, { status: 'published', availableFrom: new Date(open).toISOString(), liveUntil: new Date(close).toISOString() }); assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal((await call('admin', 'PATCH', `/admin/mocks/${mockLive}`, { liveUntil: new Date(open - H).toISOString() })).status, 400);
  const up = (await call('ana', 'GET', '/mocks')).body.mocks.find((x) => x.id === mockLive); assert.equal(up.live.state, 'upcoming'); assert.equal(up.upcoming, true);
  assert.equal((await call('ana', 'POST', `/mocks/${mockLive}/start`)).body.code, 'NOT_OPEN');
  clock = open + 2 * H; // ana starts early in the window, ben starts a day later: no need to start together
  const a1 = await take('ana', mockLive, 0); assert.equal(a1.status, 200);
  const mid = await call('ana', 'GET', `/mocks/${mockLive}/live`); assert.equal(mid.body.state, 'open'); assert.equal(mid.body.top, null); assert.ok(mid.body.mine.attemptId);
  clock = open + 20 * H;
  const b1 = await take('ben', mockLive, 1); assert.equal(b1.status, 200);
  const a2 = await take('ana', mockLive, 1); // second go: for practice only
  const r2 = await call('ana', 'GET', `/attempts/${a2.id}/result`); assert.equal(r2.body.live.official, false);
  const r1 = await call('ana', 'GET', `/attempts/${a1.id}/result`); assert.equal(r1.body.live.official, true); assert.equal(r1.body.live.rank, undefined, 'no rank before close');
  clock = close + H;
  const after = await call('ana', 'GET', `/mocks/${mockLive}/live`); assert.equal(after.body.state, 'closed');
  assert.equal(after.body.top.length, 2); assert.equal(after.body.mine.of, 2); assert.equal(after.body.mine.attemptId, a1.id);
  assert.ok(after.body.top.every((x) => x.rank >= 1 && !('userId' in x) && !('email' in x))); assert.match(after.body.top.map((x) => x.name).join(), /Kumar|K\./);
  const rr = await call('ana', 'GET', `/attempts/${a1.id}/result`); assert.ok(rr.body.live.rank >= 1); assert.equal(rr.body.live.of, 2);
  const cv = await call('cara', 'GET', `/mocks/${mockLive}/live`); assert.equal(cv.body.mine, null, 'a student who did not take part has no rank');
});

test('live closing reminder reaches students who have not started', async () => {
  const open = clock + 1 * H, close = clock + 7 * H;
  const cl = await call('admin', 'POST', '/admin/mocks', { name: 'Mini Live 2', difficulty: 'moderate', cloneFrom: mockA }); const id = cl.body.mock.id;
  await call('admin', 'PATCH', `/admin/mocks/${id}`, { status: 'published', availableFrom: new Date(open - 2 * H).toISOString(), liveUntil: new Date(close - 1 * H).toISOString() });
  clock = open; await call('ana', 'GET', '/mocks');
  await app.runReminders(); const inbox = await call('ben', 'GET', '/inbox');
  assert.ok(inbox.body.items.some((i) => /Mini Live 2/.test(i.title + i.body) && /close/i.test(i.title + i.body)), JSON.stringify(inbox.body.items.map((i) => i.title)));
});

test('notebook: bookmarks, notes, ownership, mistakes and redo practice', async () => {
  const done = (await call('ana', 'GET', '/attempts')).body.attempts.find((x) => x.status === 'submitted' && x.mockId === mockA);
  const res = await call('ana', 'GET', `/attempts/${done.id}/result`); const qs = res.body.questions; assert.ok(qs.length >= 3);
  const q0 = qs[0].id;
  assert.equal((await call('ben', 'PUT', `/bookmarks/${q0}`, { attemptId: done.id })).status, 404, 'cannot bookmark from someone else\'s attempt');
  assert.equal((await call('ana', 'PUT', `/bookmarks/nope`, { attemptId: done.id })).status, 404);
  assert.equal((await call('ana', 'PUT', `/bookmarks/${q0}`, { attemptId: done.id, note: 'remember this' })).status, 200);
  assert.equal((await call('ana', 'PUT', `/bookmarks/${qs[1].id}`, { attemptId: done.id })).status, 200);
  assert.equal((await call('ana', 'PUT', `/bookmarks/${qs[2].id}`, { attemptId: done.id })).status, 200);
  const ids = await call('ana', 'GET', '/bookmarks/ids'); assert.equal(ids.body.ids.length, 3); assert.equal(ids.body.notes[q0], 'remember this');
  assert.equal((await call('ben', 'GET', '/bookmarks/ids')).body.ids.length, 0);
  const nb = await call('ana', 'GET', '/notebook?tab=bookmarks'); assert.equal(nb.body.total, 3); assert.equal(nb.body.items.find((x) => x.id === q0).note, 'remember this'); assert.ok(nb.body.items[0].options.length >= 2);
  const mis = await call('ana', 'GET', '/notebook?tab=mistakes'); assert.ok(mis.body.total >= qs.filter((x) => x.status === 'incorrect').length);
  assert.ok(mis.body.items.every((x) => x.status === 'incorrect'));
  const pr = await call('ana', 'POST', '/practice', { source: 'bookmarks', size: 5 }); assert.equal(pr.status, 200, JSON.stringify(pr.body)); assert.ok(pr.body.attemptId);
  const ov = await call('ana', 'GET', '/practice/overview'); assert.equal(ov.body.notebook.bookmarks, 3);
  assert.equal((await call('ana', 'DELETE', `/bookmarks/${qs[2].id}`)).status, 200); assert.equal((await call('ana', 'GET', '/bookmarks/ids')).body.ids.length, 2);
  assert.equal((await call('ben', 'POST', '/practice', { source: 'bookmarks', size: 5 })).status, 409, 'needs at least 3 saved questions');
});
