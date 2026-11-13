// Pure grading logic. Reads marks/negatives from each question (filled from config).
export function gradeQuestion(q, r) {
  const selected = r && Number.isInteger(r.selected) ? r.selected : null;
  if (selected === null) return { status: 'unattempted', marksAwarded: 0, selected: null };
  if (selected === q.answer) return { status: 'correct', marksAwarded: q.marks, selected };
  return { status: 'incorrect', marksAwarded: -q.negativeMarks, selected };
}

const blank = () => ({ total: 0, attempted: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, maxMarks: 0, timeSec: 0 });
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function buildResult({ attempt, questions, responses, sectionsCfg }) {
  const topics = {};
  const qOut = [];
  for (const q of questions) {
    const r = responses[q.id] || {};
    const g = gradeQuestion(q, r);
    const t = (topics[q.topic + '|' + q.section] ||= { topic: q.topic, section: q.section, total: 0, correct: 0, incorrect: 0, unattempted: 0 });
    t.total++; t[g.status]++;
    qOut.push({
      id: q.id, section: q.section, index: q.index, topic: q.topic, subtopic: q.subtopic, difficulty: q.difficulty,
      text: q.text, passage: q.passage, table: q.table || null, figure: q.figure || null, optionFigures: q.optionFigures || null, image: q.image || null, optionImages: q.optionImages || null, solutionImage: q.solutionImage || null, options: q.options, marks: q.marks, negativeMarks: q.negativeMarks,
      selected: g.selected, correct: q.answer, status: g.status, marked: !!r.marked, marksAwarded: g.marksAwarded,
      timeSec: Math.round((r.timeMs || 0) / 1000),
      explanation: q.explanation, steps: q.steps || [], shortcut: q.shortcut || '', trap: q.trap, revise: q.revise,
      approach: q.approach || '', wrongReasons: q.wrongReasons,
      whyWrong: g.status === 'incorrect' ? q.wrongReasons[g.selected] || null : null,
      currentAffairs: !!q.currentAffairs,
    });
  }
  return summarise({ attempt, qOut, topics, sectionsCfg });
}

export const RESULT_VERSION = 2;

/** Builds the summary from graded questions. Qualifying sections (e.g. Computer) are reported
 *  separately and excluded from the total score, percentage and accuracy. */
export function summarise({ attempt, qOut, topics, sectionsCfg }) {
  const secs = {};
  for (const q of qOut) {
    const s = (secs[q.section] ||= blank());
    s.total++; s.maxMarks += q.marks; s.score += q.marksAwarded; s.timeSec += q.timeSec || 0;
    if (q.status === 'correct') { s.correct++; s.attempted++; } else if (q.status === 'incorrect') { s.incorrect++; s.attempted++; } else s.unattempted++;
  }
  const sum = blank(); let marked = 0;
  for (const q of qOut) {
    const cfg = sectionsCfg[q.section] || {};
    q.qualifying = !!cfg.qualifying;
    if (q.marked) marked++;
    if (cfg.qualifying) continue;
    sum.total++; sum.maxMarks += q.marks; sum.score += q.marksAwarded; sum.timeSec += q.timeSec || 0;
    if (q.status === 'correct') { sum.correct++; sum.attempted++; } else if (q.status === 'incorrect') { sum.incorrect++; sum.attempted++; } else sum.unattempted++;
  }
  const all = Object.keys(sectionsCfg).filter((k) => secs[k]).map((k) => {
    const c = sectionsCfg[k];
    const o = { key: k, name: c.name, short: c.short, ...secs[k], accuracy: pct(secs[k].correct, secs[k].attempted), qualifying: !!c.qualifying };
    if (c.qualifying) { o.qualifyingMarks = c.qualifyingMarks; o.qualified = secs[k].score >= c.qualifyingMarks; }
    return o;
  });
  const sections = all.filter((x) => !x.qualifying);
  const qualifying = all.filter((x) => x.qualifying);
  const topicList = Object.values(topics).map((t) => ({ ...t, accuracy: pct(t.correct, t.total), qualifying: !!sectionsCfg[t.section]?.qualifying }));
  const submittedAt = attempt.submittedAt;
  const timeTakenSec = Math.max(0, Math.round((new Date(submittedAt) - new Date(attempt.startedAt)) / 1000));
  return {
    version: RESULT_VERSION,
    attempt: { id: attempt.id, mockId: attempt.mockId, mockName: attempt.mockName, difficulty: attempt.difficulty, startedAt: attempt.startedAt, submittedAt, autoSubmitted: !!attempt.autoSubmitted },
    summary: {
      score: sum.score, maxMarks: sum.maxMarks, percentage: pct(sum.score, sum.maxMarks), totalQuestions: sum.total,
      correct: sum.correct, incorrect: sum.incorrect, unattempted: sum.unattempted, attempted: sum.attempted,
      accuracy: pct(sum.correct, sum.attempted), timeTakenSec,
      avgTimePerQuestionSec: sum.total ? Math.round((sum.timeSec / sum.total) * 10) / 10 : 0, marked,
      qualified: qualifying.length ? qualifying.every((x) => x.qualified) : null,
    },
    sections, qualifying, topics: topicList, questions: qOut,
  };
}

/** Upgrade a result stored by an older version (Computer used to count towards the total). */
export function upgradeResult(res, sectionsCfg) {
  if (res && res.version === RESULT_VERSION) return res;
  const topics = {};
  for (const t of res.topics || []) topics[t.topic + '|' + t.section] = { topic: t.topic, section: t.section, total: t.total, correct: t.correct, incorrect: t.incorrect, unattempted: t.unattempted };
  return summarise({ attempt: res.attempt, qOut: res.questions, topics, sectionsCfg });
}
