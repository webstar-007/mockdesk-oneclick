// Plain-language summary of one result. Rules only, no outside service.
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const join = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/**
 * res: stored result (summary, sections, qualifying, topics, questions).
 * ctx: { prevSame, prev, community, target } where prev* are { score, percentage, accuracy }.
 */
export function plainSummary(res, ctx = {}) {
  const s = res.summary; const points = []; const next = [];
  const qs = (res.questions || []).filter((q) => !q.qualifying);
  const penalty = Math.abs(qs.reduce((a, q) => a + (q.marksAwarded < 0 ? q.marksAwarded : 0), 0));

  let headline = `You scored ${s.score} out of ${s.maxMarks} (${s.percentage}%).`;
  if (ctx.target) { const d = ctx.target - s.score; headline += d > 0 ? ` That is ${d} marks below your target of ${ctx.target}.` : ` That meets your target of ${ctx.target}.`; }

  if (!s.attempted) return { headline, points: ['You left every question blank, so no marks were earned.'], next: ['Take the mock again and answer the questions you are sure about first. Skipped questions score nothing, so attempt what you can.'] };
  const secs = (res.sections || []).filter((x) => x.maxMarks).map((x) => ({ ...x, p: pct(x.score, x.maxMarks) })).sort((a, b) => b.p - a.p);
  if (secs.length > 1) {
    const best = secs[0]; const worst = secs[secs.length - 1];
    points.push(best.p === worst.p ? `Your sections were evenly matched at about ${best.p}%.` : `${best.short} was your strongest section (${best.p}%). ${worst.short} needs the most work (${worst.p}%).`);
  }

  points.push(`You attempted ${s.attempted} of ${s.totalQuestions} questions with ${s.accuracy}% accuracy.${penalty ? ` Wrong answers cost you ${penalty} marks.` : ''}`);

  const weak = (res.topics || []).filter((t) => !t.qualifying && t.total >= 3 && t.accuracy < 50).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  if (weak.length) points.push(`Fix these topics first: ${join(weak.map((t) => `${t.topic} (${t.correct}/${t.total} right)`))}.`);
  else if ((res.topics || []).length) points.push('No topic dropped below 50% accuracy, so your basics look steady.');

  const slow = qs.filter((q) => q.status !== 'correct' && q.timeSec >= 90).length;
  if (slow >= 2) points.push(`You spent 90 seconds or more on ${slow} questions you did not get right. Moving on sooner would have saved time for easier marks.`);
  const avgT = s.avgTimePerQuestionSec;
  if (avgT) points.push(`Your average was ${mmss(avgT)} per question.`);

  for (const c of res.qualifying || []) points.push(c.qualified ? `${c.short}: you scored ${c.score}, above the qualifying mark of ${c.qualifyingMarks}.` : `${c.short}: you scored ${c.score}, below the qualifying mark of ${c.qualifyingMarks}. This section does not add to your total but you must clear it.`);

  const prev = ctx.prevSame || ctx.prev;
  if (prev) {
    const d = Math.round((s.score - prev.score) * 10) / 10; const label = ctx.prevSame ? 'your last attempt of this mock' : 'your previous test';
    points.push(d === 0 ? `Your score is the same as ${label}.` : `Compared with ${label}, your score is ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} marks.`);
  }
  if (ctx.community?.unlocked) points.push(`You are in the top ${Math.max(1, Math.round(100 - ctx.community.percentile))}% of students who took this mock.`);

  if (weak.length) next.push(`Open Review, filter by Incorrect, and redo the ${weak[0].topic} questions.`);
  if (penalty >= 10 || (s.attempted && s.accuracy < 60)) next.push('When you cannot rule out two options, skip the question. Negative marks are costing you.');
  if (s.totalQuestions && s.unattempted / s.totalQuestions > 0.25) next.push('You left many questions blank. In the next mock, spend your last few minutes on the easiest unanswered ones.');
  if (s.accuracy >= 80 && s.percentage < 70) next.push('Your accuracy is high but you are not attempting enough. Work on speed with timed sectional practice.');
  if (!next.length) next.push(s.percentage >= 80 ? 'Strong result. Try a harder mock to keep pushing.' : 'Review every incorrect question, then take your next mock.');
  return { headline, points, next: next.slice(0, 3) };
}
