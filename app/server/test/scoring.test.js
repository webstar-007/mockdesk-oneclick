import test from 'node:test';
import assert from 'node:assert/strict';
import examConfig from '../../config/exam.config.js';
import { buildResult, upgradeResult, gradeQuestion } from '../lib/scoring.js';

const mkQ = (section, n, ans = 0) => Array.from({ length: n }, (_, i) => ({
  id: `${section}-${i}`, section, index: i, topic: 'T', subtopic: 's', difficulty: 'easy', text: 'q', options: ['a', 'b', 'c', 'd'], answer: ans,
  marks: 3, negativeMarks: 1, wrongReasons: [null, 'x', 'x', 'x'], explanation: 'e', trap: 't', revise: 'r',
}));
const attempt = { id: 'a1', mockId: 'm', mockName: 'M', difficulty: 'hard', startedAt: '2026-01-01T00:00:00Z', submittedAt: '2026-01-01T02:00:00Z' };
const run = (computerCorrect, computerWrong) => {
  const maths = mkQ('maths', 30), comp = mkQ('computer', 20);
  const responses = {};
  maths.slice(0, 10).forEach((q) => { responses[q.id] = { selected: 0 }; });   // 10 correct = 30
  comp.slice(0, computerCorrect).forEach((q) => { responses[q.id] = { selected: 0 }; });
  comp.slice(computerCorrect, computerCorrect + computerWrong).forEach((q) => { responses[q.id] = { selected: 1 }; });
  return buildResult({ attempt, questions: [...maths, ...comp], responses, sectionsCfg: examConfig.sections });
};

test('computer marks are not added to the total score', () => {
  const r = run(20, 0);
  assert.equal(r.summary.score, 30);
  assert.equal(r.summary.maxMarks, 90);            // 30 maths questions only
  assert.equal(r.summary.totalQuestions, 30);
  assert.equal(r.sections.some((s) => s.key === 'computer'), false);
  assert.equal(r.qualifying.length, 1);
  assert.equal(r.qualifying[0].score, 60);
});

test('qualifying needs at least 27 marks', () => {
  assert.equal(run(9, 0).qualifying[0].qualified, true);       // 27 exactly
  assert.equal(run(8, 0).qualifying[0].qualified, false);      // 24
  assert.equal(run(10, 3).qualifying[0].score, 27);            // 30 - 3 negatives
  assert.equal(run(10, 3).summary.qualified, true);
  assert.equal(run(10, 4).summary.qualified, false);           // 26 after negatives
});

test('negative marking applies inside the qualifying section', () => {
  assert.equal(gradeQuestion({ answer: 0, marks: 3, negativeMarks: 1 }, { selected: 2 }).marksAwarded, -1);
  assert.equal(run(0, 5).qualifying[0].score, -5);
});

test('questions in the qualifying section are flagged', () => {
  const r = run(5, 0);
  assert.equal(r.questions.filter((q) => q.qualifying).length, 20);
});

test('older results (Computer inside the total) are upgraded on read', () => {
  const fresh = run(9, 0);
  const old = { ...fresh, version: undefined, summary: { ...fresh.summary, score: 57, maxMarks: 150 }, qualifying: undefined };
  const up = upgradeResult(old, examConfig.sections);
  assert.equal(up.summary.score, 30);
  assert.equal(up.summary.maxMarks, 90);
  assert.equal(up.qualifying[0].qualified, true);
});

test('a mock without a computer section reports no qualification', () => {
  const r = buildResult({ attempt, questions: mkQ('maths', 5), responses: {}, sectionsCfg: examConfig.sections });
  assert.equal(r.summary.qualified, null);
  assert.deepEqual(r.qualifying, []);
});
