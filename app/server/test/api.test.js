import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../lib/db.js';
import { gradeQuestion } from '../lib/scoring.js';

let clock = Date.parse('2026-11-04T00:00:00Z');
const sent = [];
const app = createApp(openDb(':memory:'), { allowIncomplete: true, now: () => clock, serveClient: false, otpSender: async (m) => { sent.push(m); } });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
let cookie = '';
async function call(method, url, body) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json() };
}
test.after(() => server.close());

test('grading: +3 / -1 / 0', () => {
  const q = { answer: 2, marks: 3, negativeMarks: 1 };
  assert.equal(gradeQuestion(q, { selected: 2 }).marksAwarded, 3);
  assert.equal(gradeQuestion(q, { selected: 0 }).marksAwarded, -1);
  assert.equal(gradeQuestion(q, { selected: null }).marksAwarded, 0);
  assert.equal(gradeQuestion(q, undefined).status, 'unattempted');
});

test('auth required, register validates, login works', async () => {
  assert.equal((await call('GET', '/mocks')).status, 401);
  assert.equal((await call('POST', '/auth/register', { name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
  const r = await call('POST', '/auth/register', { name: 'Asha', email: 'asha@example.com', password: 'password123' });
  assert.equal(r.status, 201);
  assert.equal((await call('POST', '/auth/register', { name: 'x', email: 'asha@example.com', password: 'password123' })).status, 409);
  assert.equal((await call('GET', '/me')).body.user.name, 'Asha');
  assert.equal((await call('PATCH', '/me', { targetScore: 330 })).body.user.targetScore, 330);
  await call('POST', '/auth/logout');
  assert.equal((await call('POST', '/auth/login', { email: 'asha@example.com', password: 'wrong-pass' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'asha@example.com', password: 'password123' })).status, 200);
});

test('full attempt: no answer leak, save, resume, sections, scoring, expiry', async () => {
  const mocks = (await call('GET', '/mocks')).body.mocks;
  const mock = mocks.find((m) => m.totalQuestions > 0);
  assert.ok(mock, 'at least one mock bank must exist');
  const { attemptId, resumed } = (await call('POST', `/mocks/${mock.id}/start`)).body;
  assert.equal(resumed, false);
  assert.equal((await call('POST', `/mocks/${mock.id}/start`)).body.resumed, true);

  let st = (await call('GET', `/attempts/${attemptId}`)).body.attempt;
  assert.ok(st.questions.length > 0);
  for (const q of st.questions) for (const k of ['answer', 'explanation', 'wrongReasons', 'trap', 'steps']) assert.equal(k in q, false, `leaked ${k}`);
  assert.equal((await call('GET', `/attempts/${attemptId}/result`)).status, 409);

  // answer first question with option 0, mark second, then resume
  const [q1, q2] = st.questions;
  clock += 60000;
  await call('PUT', `/attempts/${attemptId}/responses`, { responses: { [q1.id]: { selected: 0, visited: true, marked: false, timeMs: 5000 }, [q2.id]: { selected: 9, visited: true, marked: true, timeMs: 1000 } }, lastQid: q2.id });
  st = (await call('GET', `/attempts/${attemptId}`)).body.attempt;
  assert.equal(st.responses[q1.id].selected, 0);
  assert.equal(st.responses[q2.id].selected, null, 'out-of-range selection rejected');
  assert.equal(st.lastQid, q2.id);

  // go through every segment; the last segment's end auto-submits via expiry
  let res = (await call('POST', `/attempts/${attemptId}/segment/submit`, { responses: {} })).body;
  const total = st.segments.length;
  if (total > 1) {
    assert.equal(res.status, 'in_progress');
    const s2 = res.attempt;
    assert.equal(s2.segmentIndex, 1);
    // saving to a question from the locked segment is ignored
    await call('PUT', `/attempts/${attemptId}/responses`, { responses: { [q1.id]: { selected: 3 } } });
    // let all remaining time lapse -> auto submit
    clock += 3 * 3600 * 1000;
    assert.equal((await call('GET', `/attempts/${attemptId}`)).body.status, 'submitted');
  } else {
    assert.equal(res.status, 'submitted');
  }
  const result = (await call('GET', `/attempts/${attemptId}/result`)).body;
  const first = result.questions.find((q) => q.id === q1.id);
  assert.equal(first.selected, 0);
  assert.equal(first.marksAwarded, first.correct === 0 ? 3 : -1);
  assert.equal(result.summary.attempted, result.summary.correct + result.summary.incorrect);
  assert.equal(result.summary.totalQuestions, result.summary.correct + result.summary.incorrect + result.summary.unattempted);
  // PDF report downloads as a real PDF
  const pdf = await fetch(`${base}/attempts/${attemptId}/report.pdf`, { headers: { cookie } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  const sumSections = result.sections.reduce((a, s) => a + s.score, 0);
  assert.equal(sumSections, result.summary.score);
  assert.equal(result.summary.marked, 1);
  if (total > 1) assert.equal(result.attempt.autoSubmitted, true);

  const list = (await call('GET', '/mocks')).body.mocks.find((m) => m.id === mock.id);
  assert.equal(list.status, 'completed');
  const stats = (await call('GET', '/stats')).body;
  assert.equal(stats.completed, 1);
  assert.equal((await call('GET', '/attempts')).body.attempts[0].status, 'submitted');
});

test("another user cannot read someone else's attempt", async () => {
  const mine = (await call('GET', '/attempts')).body.attempts[0].id;
  cookie = '';
  await call('POST', '/auth/register', { name: 'Other', email: 'o@example.com', password: 'password123' });
  assert.equal((await call('GET', `/attempts/${mine}/result`)).status, 404);
});

test('OTP sign-in by email and mobile', async () => {
  cookie = '';
  assert.equal((await call('POST', '/auth/otp/request', { channel: 'email', identifier: 'nope' })).status, 400);
  assert.equal((await call('POST', '/auth/otp/request', { channel: 'sms', identifier: '12345' })).status, 400);
  // mobile: bare 10-digit number is normalised to +91
  let r = await call('POST', '/auth/otp/request', { channel: 'sms', identifier: '98765 43210' });
  assert.equal(r.status, 200); assert.equal(sent.at(-1).to, '+919876543210'); assert.match(r.body.to, /^\+91•+10$/);
  assert.match(sent.at(-1).code, /^\d{6}$/);
  // cooldown
  assert.equal((await call('POST', '/auth/otp/request', { channel: 'sms', identifier: '9876543210' })).status, 429);
  // wrong code, then right code creates the account and signs in
  const good = sent.at(-1).code, bad = good === '000000' ? '111111' : '000000';
  r = await call('POST', '/auth/otp/verify', { channel: 'sms', identifier: '9876543210', code: bad });
  assert.equal(r.status, 401); assert.match(r.body.error, /4 tries left/);
  assert.equal(JSON.stringify((await call('POST', '/auth/otp/request', { channel: 'sms', identifier: '9876543210' })).status), '429'); // cooldown, still fine
  r = await call('POST', '/auth/otp/verify', { channel: 'sms', identifier: '+91 9876543210', code: good });
  assert.equal(r.status, 400); assert.equal(r.body.code, 'NAME_REQUIRED'); // new number must give a name; code not used up
  r = await call('POST', '/auth/otp/verify', { channel: 'sms', identifier: '+91 9876543210', code: good, name: 'Ravi K' });
  assert.equal(r.status, 200); assert.equal(r.body.isNew, true); assert.equal(r.body.user.name, 'Ravi K'); assert.equal(r.body.user.phone, '+919876543210');
  assert.equal((await call('GET', '/me')).status, 200);
  // code is single use
  assert.equal((await call('POST', '/auth/otp/verify', { channel: 'sms', identifier: '9876543210', code: good })).status, 400);
  // same number again signs into the same account
  await call('POST', '/auth/logout'); clock += 31000;
  await call('POST', '/auth/otp/request', { channel: 'sms', identifier: '9876543210' });
  r = await call('POST', '/auth/otp/verify', { channel: 'sms', identifier: '9876543210', code: sent.at(-1).code });
  assert.equal(r.body.isNew, false);
  assert.equal((await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'whatever12' })).body.code, 'NO_ACCOUNT');
  // email: existing password account signs in via OTP too
  await call('POST', '/auth/logout'); clock += 31000;
  r = await call('POST', '/auth/otp/request', { channel: 'email', identifier: 'Asha@Example.com' });
  assert.equal(r.status, 200); assert.equal(sent.at(-1).to, 'asha@example.com');
  r = await call('POST', '/auth/otp/verify', { channel: 'email', identifier: 'asha@example.com', code: sent.at(-1).code });
  assert.equal(r.body.isNew, false); assert.equal(r.body.user.name, 'Asha');
  // lock-out after 5 wrong codes, and expiry
  await call('POST', '/auth/logout'); clock += 31000;
  await call('POST', '/auth/otp/request', { channel: 'email', identifier: 'lock@example.com' });
  const c = sent.at(-1).code, w = c === '123456' ? '654321' : '123456'; let last;
  for (let i = 0; i < 5; i++) last = await call('POST', '/auth/otp/verify', { channel: 'email', identifier: 'lock@example.com', code: w });
  assert.equal(last.status, 429);
  assert.equal((await call('POST', '/auth/otp/verify', { channel: 'email', identifier: 'lock@example.com', code: c })).status, 400);
  clock += 31000; await call('POST', '/auth/otp/request', { channel: 'email', identifier: 'late@example.com' });
  clock += 11 * 60 * 1000;
  r = await call('POST', '/auth/otp/verify', { channel: 'email', identifier: 'late@example.com', code: sent.at(-1).code });
  assert.equal(r.status, 400); assert.equal(r.body.code, 'EXPIRED');
  // phone-only users cannot use password login
  assert.equal((await call('POST', '/auth/login', { email: 'x@y.co', password: 'password123' })).status, 404);
});

test('public overview works without signing in and exposes no personal data', async () => {
  const saved = cookie; cookie = '';
  const r = await call('GET', '/public/overview');
  cookie = saved;
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.mocks) && Array.isArray(r.body.sections) && r.body.totals);
  assert.ok(r.body.mocks.every((m) => m.id && m.questions > 0));
  const text = JSON.stringify(r.body);
  assert.ok(!/@|password|email|phone/i.test(text));
});
