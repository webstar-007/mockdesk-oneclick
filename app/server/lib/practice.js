// Personalised practice: pick questions from the student's weak topics. Same idea as the admin "build from bank" tool.
const ORDER = ['maths', 'reasoning', 'english', 'ga', 'computer'];
export const SIZES = [10, 20, 30];

/** What the student has done so far: topic accuracy and which questions they got right or wrong. */
export function historyOf(rows, readResult) {
  const topics = new Map(); const seen = new Map(); const mockIds = new Set();
  for (const r of rows) {
    mockIds.add(r.mock_id); const res = readResult(r);
    for (const t of res.topics || []) { if (t.qualifying) continue; const k = `${t.section}:${t.topic}`; const o = topics.get(k) || { section: t.section, topic: t.topic, total: 0, correct: 0 }; o.total += t.total; o.correct += t.correct; topics.set(k, o); }
    for (const q of res.questions || []) { if (q.qualifying) continue; const o = seen.get(q.id) || {}; if (q.status === 'correct') o.right = true; if (q.status === 'incorrect') o.wrong = true; seen.set(q.id, o); }
  }
  return { topics, seen, mockIds };
}
export const weakList = (topics, n = 6) => [...topics.values()].filter((t) => t.total >= 3).map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) })).sort((a, b) => a.accuracy - b.accuracy).slice(0, n);

/** candidates: question objects from the bank pool and from mocks the student has already finished. */
export function pickPractice({ candidates, history, size, rand = Math.random }) {
  const { topics, seen } = history; const cap = Math.max(3, Math.ceil(size / 3));
  const weakness = (q) => { const t = topics.get(`${q.section}:${q.topic}`); return t && t.total >= 2 ? 1 - t.correct / t.total : 0.45; };
  const scored = candidates.filter((q) => !q.qualifying).map((q) => {
    const s = seen.get(q.id); const w = weakness(q);
    return { q, w, score: 0.2 + w + (s ? 0 : 0.35) + (s?.wrong ? 0.25 : 0) - (s?.right && !s?.wrong ? 0.3 : 0) + rand() * 0.25 };
  }).sort((a, b) => b.score - a.score);
  const picked = []; const per = new Map(); const left = [];
  for (const c of scored) { const k = `${c.q.section}:${c.q.topic}`; if ((per.get(k) || 0) < cap) { picked.push(c); per.set(k, (per.get(k) || 0) + 1); } else left.push(c); if (picked.length >= size) break; }
  for (const c of left) { if (picked.length >= size) break; picked.push(c); }
  const chosen = picked.slice(0, size).sort((a, b) => ORDER.indexOf(a.q.section) - ORDER.indexOf(b.q.section) || String(a.q.topic).localeCompare(String(b.q.topic)));
  const idx = {};
  const questions = chosen.map(({ q }) => ({ ...q, index: (idx[q.section] = (idx[q.section] ?? -1) + 1) }));
  const mix = new Map(); for (const { q, w } of chosen) { const k = `${q.section}:${q.topic}`; const o = mix.get(k) || { section: q.section, topic: q.topic, count: 0, weak: Math.round(w * 100) }; o.count++; mix.set(k, o); }
  return { questions, topics: [...mix.values()].sort((a, b) => b.count - a.count) };
}
