// How a student attempted a test: a label for every question, a behaviour summary and a what-if strategy report.
// Pure functions over the stored result. `expected` is seconds per question by section, supplied by the server.
const r1 = (x) => Math.round(x * 10) / 10;

export const LABELS = {
  perfect: { text: 'Perfect attempt', tone: 'good', tip: 'Right, and within the time it deserved.' },
  overtime_correct: { text: 'Right, but slow', tone: 'mid', tip: 'Correct, but it took far longer than planned.' },
  too_fast: { text: 'Too fast, wrong', tone: 'bad', tip: 'Wrong after only a few seconds. Often a misread question or a guess.' },
  overtime_wrong: { text: 'Slow and wrong', tone: 'bad', tip: 'A long time spent and still no marks.' },
  wrong: { text: 'Wrong', tone: 'bad', tip: 'Wrong in a normal amount of time.' },
  wasted: { text: 'Time spent, no answer', tone: 'mid', tip: 'You spent a long time and left it blank.' },
  skipped: { text: 'Skipped', tone: 'none', tip: 'Left blank quickly.' },
};

export function labelOf(q, expectedSec) {
  const exp = expectedSec || 60; const t = q.timeSec || 0;
  if (q.status === 'correct') return t <= exp * 1.5 ? 'perfect' : 'overtime_correct';
  if (q.status === 'incorrect') return t > 0 && t <= Math.max(8, exp * 0.35) ? 'too_fast' : t >= Math.max(exp * 2, 45) ? 'overtime_wrong' : 'wrong';
  return t >= Math.max(exp * 1.5, 40) ? 'wasted' : 'skipped';
}

export function labelAll(d) {
  const out = {}; for (const q of d.questions) if (!q.qualifying) out[q.id] = labelOf(q, d.expected?.[q.section]);
  return out;
}

export function behaviour(d) {
  const labels = labelAll(d); const counts = Object.fromEntries(Object.keys(LABELS).map((k) => [k, 0]));
  for (const k of Object.values(labels)) counts[k]++;
  const total = Object.keys(labels).length || 1; const wrong = counts.too_fast + counts.overtime_wrong + counts.wrong;
  let title = 'Mixed pace'; let line = 'No single habit stands out. Use the labels in the review to see where time and marks went.';
  if (counts.too_fast >= 4 && counts.too_fast >= wrong * 0.3) { title = 'Rushing'; line = `${counts.too_fast} questions were answered wrong within seconds. Read the full question and every option before you commit.`; }
  else if (counts.wasted + counts.overtime_wrong >= 5) { title = 'Getting stuck'; line = `${counts.wasted + counts.overtime_wrong} questions took long and gave no marks. Set a time cap per question and move on.`; }
  else if (counts.perfect / total >= 0.6) { title = 'Steady and accurate'; line = `${counts.perfect} questions were right in good time. Keep this rhythm and work on the topics where you lost marks.`; }
  else if (counts.skipped / total >= 0.25) { title = 'Cautious'; line = `${counts.skipped} questions were skipped quickly. Some of them may have been within reach with a second look.`; }
  else if (counts.overtime_correct >= 5) { title = 'Accurate but slow'; line = `${counts.overtime_correct} correct answers took too long. Practise the faster method to free up time.`; }
  return { title, line, counts, labels, total };
}

/** "What would have raised my score": every figure is an estimate from this attempt alone. */
export function strategy(d) {
  const b = behaviour(d); const items = []; const scored = d.questions.filter((q) => !q.qualifying); const s = d.summary;
  const avgExp = (() => { const xs = scored.map((q) => d.expected?.[q.section]).filter(Boolean); return xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : 60; })();
  const rushed = scored.filter((q) => b.labels[q.id] === 'too_fast');
  if (rushed.length >= 2) { const g = rushed.reduce((a, q) => a + q.negativeMarks, 0); items.push({ key: 'guess', gain: g, title: 'Leave the quick guesses blank', body: `${rushed.length} answers were wrong within seconds. Skipping them keeps ${r1(g)} marks you lost to penalties.` }); }
  const sinks = scored.filter((q) => ['overtime_wrong', 'wasted'].includes(b.labels[q.id]));
  if (sinks.length >= 2) {
    const saved = sinks.reduce((a, q) => a + Math.max(0, q.timeSec - (d.expected?.[q.section] || avgExp) * 1.5), 0); const extra = Math.floor(saved / avgExp);
    const acc = s.attempted ? s.correct / s.attempted : 0.5; const mk = scored.length ? scored.reduce((a, q) => a + q.marks, 0) / scored.length : 1; const ng = scored.length ? scored.reduce((a, q) => a + q.negativeMarks, 0) / scored.length : 0;
    const gain = Math.max(0, extra * (acc * mk - (1 - acc) * ng));
    if (extra >= 1) items.push({ key: 'sinks', gain, title: 'Cap the time sinks', body: `${sinks.length} questions swallowed about ${Math.round(saved / 60)} extra minutes and gave no marks. That time covers roughly ${extra} more questions at your accuracy, worth about ${r1(gain)} marks.` });
  }
  const left = scored.filter((q) => q.status === 'unattempted');
  const allowed = (d.segments || []).reduce((a, x) => a + x.minutes, 0) * 60; const used = s.timeTakenSec || 0;
  if (allowed && left.length >= 3 && allowed - used >= allowed * 0.1 && !d.attempt.autoSubmitted) { const mins = Math.round((allowed - used) / 60); items.push({ key: 'spare', gain: 0, title: 'You finished with time to spare', body: `You submitted with about ${mins} minute${mins === 1 ? '' : 's'} left and ${left.length} questions blank. Use spare time for a second pass.` }); }
  // section order only matters when one timer covers several sections
  const shared = d.segments?.length === 1 && d.sections.length > 1;
  const rate = d.sections.map((x) => ({ key: x.key, name: x.short || x.name, perMin: x.timeSec ? (x.score / x.timeSec) * 60 : 0, score: x.score, mins: Math.round(x.timeSec / 60) })).sort((a, c) => c.perMin - a.perMin);
  if (shared && rate.length >= 2 && rate[0].perMin > 0) items.push({ key: 'order', gain: 0, title: 'Try this section order next time', body: `Marks per minute were highest in ${rate[0].name} and lowest in ${rate[rate.length - 1].name}. Start with ${rate.slice(0, 2).map((x) => x.name).join(' then ')}, and leave ${rate[rate.length - 1].name} for last.` });
  items.sort((a, c) => c.gain - a.gain);
  return { items, rate: shared ? rate : null, b };
}
