import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectIntent, answerDoubt } from '../lib/doubts.js';
import { plainSummary } from '../lib/summary.js';

const f = path.join(os.tmpdir(), `admins3-${Date.now()}.txt`);
fs.writeFileSync(f, 'boss3@example.com\n');
process.env.MOCKDESK_ADMINS_FILE = f; process.env.MOCKDESK_ADMIN_EMAILS = ''; process.env.MOCKDESK_DOUBT_PER_HOUR = '3';
const { createApp } = await import('../app.js');
const { openDb } = await import('../lib/db.js');
let clock = Date.parse('2026-11-04T00:00:00Z');
const app = createApp(openDb(':memory:'), { allowIncomplete: true, now: () => clock, serveClient: false });
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const jar = { admin: '', stu: '' };
async function call(who, method, url, body) {
  const r = await fetch(base + '/api' + url, { method, headers: { 'content-type': 'application/json', cookie: jar[who] }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  return { status: r.status, body: await r.json() };
}
test.after(() => { server.close(); fs.rmSync(f, { force: true }); });
const reg = (who, email) => call(who, 'POST', '/auth/register', { name: who === 'stu' ? 'Priya Sharma' : who, email, password: 'password123' });

test('doubt helper understands common questions and stays on topic', () => {
  assert.equal(detectIntent('Is there a faster way?').intent, 'shortcut');
  assert.equal(detectIntent('why was my answer wrong').intent, 'mine');
  assert.equal(detectIntent('why is option C wrong').intent, 'option');
  assert.equal(detectIntent('who won the world cup').intent, 'scope');
  const q = { options: ['1', '2', '3', '4'], correct: 1, selected: 2, status: 'incorrect', explanation: 'Because 2.', whyWrong: 'Three is too big.', shortcut: 'Use a trick.', steps: ['a', 'b'] };
  assert.match(answerDoubt(q, 'why was my answer wrong').replies[0].text, /Three is too big/);
  assert.match(answerDoubt(q, 'quick way?').replies[0].text, /Use a trick/);
  assert.match(answerDoubt(q, 'what is the capital of France').replies[0].title, /only help with this question/);
});

test('plain summary reads like a person wrote it', () => {
  const res = { summary: { score: 120, maxMarks: 390, percentage: 31, attempted: 100, totalQuestions: 130, accuracy: 55, unattempted: 30, avgTimePerQuestionSec: 70 },
    sections: [{ short: 'Maths', score: 60, maxMarks: 90 }, { short: 'English', score: 10, maxMarks: 135 }], qualifying: [{ short: 'Computer', score: 20, qualifyingMarks: 27, qualified: false }],
    topics: [{ topic: 'Percentages', section: 'maths', total: 5, correct: 1, accuracy: 20 }], questions: [{ marksAwarded: -1 }, { marksAwarded: -1 }, { marksAwarded: 3 }] };
  const s = plainSummary(res, { target: 200, prevSame: { score: 100 } });
  assert.match(s.headline, /120 out of 390.*80 marks below your target/);
  assert.ok(s.points.some((p) => /Maths was your strongest/.test(p)) && s.points.some((p) => /Percentages/.test(p)) && s.points.some((p) => /up 20 marks/.test(p)) && s.points.some((p) => /below the qualifying/.test(p)));
  assert.ok(s.next.length >= 1 && s.next.length <= 3);
});

test('doubt chat: locked while testing, only after submit, limited per hour, switchable per mock', async () => {
  await reg('admin', 'boss3@example.com'); await reg('stu', 'priya@example.com');
  const start = await call('stu', 'POST', '/mocks/mock1/start'); const id = start.body.attemptId; assert.ok(id);
  assert.equal((await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: 'x', message: 'help' })).status, 409); // still running
  const sub = await call('stu', 'POST', `/attempts/${id}/submit`); assert.equal(sub.status, 200);
  const res = (await call('stu', 'GET', `/attempts/${id}/result`)).body;
  assert.ok(res.plain.headline && res.plain.points.length && res.doubt.available === true);
  const qid = res.questions[0].id;
  const ok = await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'explain the solution' });
  assert.equal(ok.status, 200); assert.ok(ok.body.replies.length);
  assert.equal((await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: 'nope', message: 'help' })).status, 404);
  await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'steps?' });
  await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'shortcut?' });
  const lim = await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'trap?' });
  assert.equal(lim.status, 429); assert.equal(lim.body.code, 'CHAT_LIMIT');
  clock += 3700000; // an hour later the limit resets
  assert.equal((await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'trap?' })).status, 200);
  await call('admin', 'PATCH', '/admin/mocks/mock1', { doubtChat: false }); // admin switches it off for a live mock
  const off = await call('stu', 'POST', `/attempts/${id}/doubt`, { questionId: qid, message: 'help' });
  assert.equal(off.status, 423); assert.match(off.body.error, /switched off/);
  assert.equal((await call('stu', 'GET', `/attempts/${id}/result`)).body.doubt.available, false);
  await call('admin', 'PATCH', '/admin/mocks/mock1', { doubtChat: true });
});

test('ask your data answers from real numbers and stays admin-only', async () => {
  const ask = async (q) => (await call('admin', 'POST', '/admin/ask', { q })).body;
  assert.equal((await call('stu', 'POST', '/admin/ask', { q: 'how many students' })).status, 403);
  const a1 = await ask('How did Mock 1 go?'); assert.match(a1.answer.join(' '), /CGL Tier-II Mock 1/);
  assert.match((await ask('how many students have signed up')).answer.join(' '), /signed up/);
  const st = await ask('How is Priya Sharma doing?'); assert.match(st.answer.join(' '), /Priya Sharma/);
  assert.match((await ask('who is taking a test right now')).answer.join(' '), /Nobody|right now/);
  assert.match((await ask('how many students never attempted a mock')).answer.join(' '), /student/);
  assert.match((await ask('how many doubts were asked')).answer.join(' '), /doubt/);
  assert.equal((await ask('tell me a joke')).help, true);
  assert.equal((await call('admin', 'POST', '/admin/ask', { q: 'x' })).status, 400);
});
