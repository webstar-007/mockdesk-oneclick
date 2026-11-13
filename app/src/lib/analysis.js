// Derived metrics for the result page. Pure functions over the stored result.
const r1 = (x) => Math.round(x * 10) / 10;
export function analyse(d, config) {
  const scored = d.questions.filter((q) => !q.qualifying);
  const wrong = scored.filter((q) => q.status === 'incorrect');
  const skipped = scored.filter((q) => q.status === 'unattempted');
  const right = scored.filter((q) => q.status === 'correct');
  const avg = d.summary.avgTimePerQuestionSec || 0;
  const mk = (q) => q.marks, neg = (q) => q.negativeMarks;
  const penalty = wrong.reduce((a, q) => a + neg(q), 0);
  const wrongMissed = wrong.reduce((a, q) => a + mk(q), 0);
  const skippedMarks = skipped.reduce((a, q) => a + mk(q), 0);
  const net = d.summary.score;
  const secAvg = {}; for (const s of [...d.sections, ...(d.qualifying || [])]) secAvg[s.key] = s.total ? s.timeSec / s.total : 0;
  const slowLimit = (q) => Math.max(75, (secAvg[q.section] || avg) * 2.2);
  const rushed = wrong.filter((q) => q.timeSec > 0 && q.timeSec <= Math.max(8, (secAvg[q.section] || avg) * 0.35));
  const overthought = scored.filter((q) => q.status !== 'correct' && q.timeSec >= slowLimit(q));
  const marked = scored.filter((q) => q.marked && q.status !== 'unattempted');
  const markedRight = marked.filter((q) => q.status === 'correct').length;
  const pace = [...d.sections, ...(d.qualifying || [])].map((s) => {
    const seg = config?.segments?.find((g) => g.sections.includes(s.key)); const allowed = seg && seg.sections.length === 1 ? seg.minutes * 60 : seg ? (seg.minutes * 60 * s.total) / seg.sections.reduce((a, k) => a + (config.sections[k]?.questions || 0), 0) : null;
    return { key: s.key, name: s.name, short: s.short, used: s.timeSec, allowed, perQ: s.total ? s.timeSec / s.total : 0, allowedPerQ: allowed && s.total ? allowed / s.total : null, qualifying: s.qualifying };
  });
  const diff = ['easy', 'moderate', 'hard'].map((k) => { const qs = scored.filter((q) => q.difficulty === k); const c = qs.filter((q) => q.status === 'correct').length; return { key: k, total: qs.length, correct: c, wrong: qs.filter((q) => q.status === 'incorrect').length, pct: qs.length ? r1((c / qs.length) * 100) : 0 }; }).filter((x) => x.total);
  const topics = d.topics.filter((t) => !t.qualifying).slice().sort((a, b) => a.accuracy - b.accuracy || b.incorrect - a.incorrect);
  // three concrete fixes, ranked by marks at stake
  const secLoss = d.sections.map((s) => ({ s, lost: s.maxMarks - s.score })).sort((a, b) => b.lost - a.lost);
  const fixes = [];
  if (penalty >= 6) fixes.push({ title: 'Cut guessing', body: `${wrong.length} wrong answers cost ${penalty} marks in penalties. Skip when you cannot remove two options.`, marks: penalty });
  if (secLoss[0]) fixes.push({ title: `Strengthen ${secLoss[0].s.short}`, body: `${secLoss[0].s.short} is where most marks were left (${secLoss[0].lost} of ${secLoss[0].s.maxMarks}). Start with ${topics.find((t) => t.section === secLoss[0].s.key && t.accuracy < 100)?.topic || 'its weakest topic'}.`, marks: secLoss[0].lost });
  if (overthought.length >= 2) fixes.push({ title: 'Stop over-investing', body: `${overthought.length} questions ate long stretches and gave no marks. Set a 90-second cap and move on.`, marks: overthought.length * 3 });
  if (rushed.length >= 2) fixes.push({ title: 'Slow down on easy-looking questions', body: `${rushed.length} wrong answers were given in a few seconds. Read the question and the options twice.`, marks: rushed.length * 4 });
  if (skipped.length >= 8) fixes.push({ title: 'Attempt more', body: `${skipped.length} questions were left blank. Sweep each section once for the quick ones before going deep.`, marks: skipped.length * 3 });
  fixes.sort((a, b) => b.marks - a.marks);
  return { scored, wrong, skipped, right, penalty, wrongMissed, skippedMarks, net, rushed, overthought, marked, markedRight, pace, diff, topics, fixes: fixes.slice(0, 3), potential: net + penalty + 0, avg };
}
