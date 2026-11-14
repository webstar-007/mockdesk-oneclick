// "Ask your data": plain-English questions for admins, answered from the platform's own numbers.
// Rule based and free. Every answer comes from a query on the database, never from a guess.
const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const avg = (a) => (a.length ? r1(a.reduce((x, y) => x + y, 0) / a.length) : 0);
const plural = (n, w, p = `${w}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? w : p}`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const SECTION_WORDS = { maths: ['maths', 'math', 'quant', 'mathematics'], reasoning: ['reasoning'], english: ['english'], ga: ['general awareness', ' ga ', 'gk', 'general knowledge'], computer: ['computer'] };

export const EXAMPLES = [
  'How did Mock 3 go?',
  'Which mock is the hardest?',
  'How many new students this week?',
  'What are the weakest topics?',
  'Top 5 students',
  'Who is taking a test right now?',
  'How many students never attempted a mock?',
  'Which questions are students getting wrong most?',
];

function parseRange(q, t) {
  const d0 = new Date(t); d0.setHours(0, 0, 0, 0); const today = d0.getTime();
  if (/yesterday/.test(q)) return { from: today - DAY, to: today, label: 'yesterday' };
  if (/today|so far today/.test(q)) return { from: today, to: Infinity, label: 'today' };
  if (/24 hours|last day|past day/.test(q)) return { from: t - DAY, to: Infinity, label: 'in the last 24 hours' };
  if (/this week|last 7 days|past week|last week|7 days/.test(q)) return { from: t - 7 * DAY, to: Infinity, label: 'in the last 7 days' };
  if (/this month|last 30 days|past month|last month|30 days/.test(q)) return { from: t - 30 * DAY, to: Infinity, label: 'in the last 30 days' };
  return { from: 0, to: Infinity, label: 'overall' };
}
const inRange = (ms, rg) => ms >= rg.from && ms < rg.to;

export function answerAsk(raw, h) {
  const text = String(raw || '').trim().slice(0, 300);
  const q = ` ${text.toLowerCase().replace(/[^a-z0-9@.' ?]/g, ' ').replace(/\s+/g, ' ')} `;
  const t = h.now(); const rg = parseRange(q, t); const db = h.db;
  const mocks = db.prepare("SELECT id, number, name, status FROM mocks WHERE id!='pool' ORDER BY number").all();
  const mockNo = q.match(/mock\s*(?:no\.?\s*)?(\d+)/); const mock = mockNo ? mocks.find((m) => m.number === Number(mockNo[1])) : null;
  const sec = Object.entries(SECTION_WORDS).find(([, w]) => w.some((x) => q.includes(x)))?.[0] || null;
  const n = Math.min(20, Math.max(1, Number((q.match(/\btop\s*(\d+)|\b(\d+)\s*(?:students|users)/) || []).slice(1).find(Boolean)) || 5));
  const students = () => db.prepare("SELECT id, name, email, phone, created_at, last_seen FROM users WHERE COALESCE(role,'student')='student'").all();
  const mockName = (id) => mocks.find((m) => m.id === id)?.name || id;
  const ans = (answer, extra = {}) => ({ answer: Array.isArray(answer) ? answer : [answer], ...extra });
  const none = (what) => ans(`There is no data yet for ${what}.`);

  // 1. one student
  const email = q.match(/[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  const who = !email && q.match(/(?:how is|how's|how did|how has|about|show me|find|look up|lookup|student)\s+([a-z][a-z .'-]{2,40}?)(?:\s+(?:doing|perform\w*|do|go|getting)|\s*\?|\s*$)/);
  const nameWords = who ? who[1].trim() : '';
  if (email || (nameWords && !/^(the|all|our|my|mock|any|every|each|students?|users?|platform|everyone|everybody|it|this|that|we|us)\b/.test(nameWords))) {
    const found = email
      ? db.prepare("SELECT * FROM users WHERE lower(email)=? AND COALESCE(role,'student')='student'").all(email[0])
      : db.prepare("SELECT * FROM users WHERE lower(name) LIKE ? AND COALESCE(role,'student')='student' LIMIT 6").all(`%${nameWords}%`);
    if (found.length > 1) return ans(`${found.length} students match "${nameWords}". Be more specific, or use an email address.`, { table: { cols: ['Name', 'Contact'], rows: found.map((u) => [u.name, u.email || u.phone || '']) } });
    if (found.length === 1) {
      const u = found[0]; const b = h.briefs().filter((x) => x.userId === u.id).sort((a, c) => a.submittedAt - c.submittedAt);
      if (!b.length) return ans(`${u.name} has not finished any mock yet.${u.last_seen ? ` Last seen ${new Date(u.last_seen).toISOString().slice(0, 10)}.` : ''}`, { link: { to: `/admin/users/${u.id}`, label: 'Open profile' } });
      const first = b[0]; const last = b[b.length - 1]; const best = b.reduce((x, y) => (y.score > x.score ? y : x));
      const lines = [`${u.name} has finished ${plural(b.length, 'mock')} with an average of ${avg(b.map((x) => x.pct))}% and accuracy of ${avg(b.map((x) => x.accuracy))}%.`, `Best: ${best.score}/${best.max} on ${mockName(best.mockId)}. Latest: ${last.score}/${last.max} (${last.pct}%) on ${mockName(last.mockId)}.`];
      if (b.length > 1) lines.push(`Since the first attempt the score is ${last.pct >= first.pct ? 'up' : 'down'} ${Math.abs(r1(last.pct - first.pct))} percentage points.`);
      const tp = {}; for (const { row, res } of h.results()) if (row.user_id === u.id) for (const x of res.topics) { const o = (tp[x.topic] ||= { total: 0, correct: 0 }); o.total += x.total; o.correct += x.correct; }
      const weak = Object.entries(tp).filter(([, v]) => v.total >= 4).map(([k, v]) => [k, Math.round((v.correct / v.total) * 100)]).sort((a, c) => a[1] - c[1]).slice(0, 3);
      if (weak.length) lines.push(`Weakest topics: ${weak.map(([k, v]) => `${k} (${v}%)`).join(', ')}.`);
      return ans(lines, { link: { to: `/admin/users/${u.id}`, label: 'Open profile' } });
    }
    if (email) return ans(`No student has the email ${email[0]}.`);
  }

  // 2. one mock
  if (mock && !/question|topic|weak|strong|top|leaderboard|rank|best/.test(q) || (mock && /how did|go|perform|result|average|stat|summary/.test(q))) {
    const started = db.prepare('SELECT COUNT(*) c FROM attempts WHERE mock_id=? AND started_at>=? AND started_at<?').get(mock.id, rg.from, rg.to).c;
    const b = h.briefs().filter((x) => x.mockId === mock.id && inRange(x.submittedAt || 0, rg));
    if (!b.length) return ans(`${mock.name}: ${plural(started, 'attempt')} started ${rg.label}, none finished yet.`);
    const top = b.reduce((x, y) => (y.score > x.score ? y : x)); const low = b.reduce((x, y) => (y.score < x.score ? y : x));
    const topics = {}; const secs = {};
    for (const { row, res } of h.results()) if (row.mock_id === mock.id && inRange(row.submitted_at || 0, rg)) {
      for (const x of res.topics) { const o = (topics[x.topic] ||= { total: 0, correct: 0 }); o.total += x.total; o.correct += x.correct; }
      for (const s of res.sections) { const o = (secs[s.short] ||= { p: [], acc: [] }); o.p.push(s.maxMarks ? (s.score / s.maxMarks) * 100 : 0); if (s.attempted) o.acc.push(s.accuracy); }
    }
    const weak = Object.entries(topics).filter(([, v]) => v.total >= 5).map(([k, v]) => [k, Math.round((v.correct / v.total) * 100)]).sort((a, c) => a[1] - c[1]).slice(0, 3);
    const finishedPct = started ? Math.round((b.length / started) * 100) : 100;
    const lines = [`${mock.name} (${rg.label}): ${plural(started, 'attempt')} started and ${b.length} finished (${Math.min(100, finishedPct)}%). Average score ${avg(b.map((x) => x.score))}/${b[0].max} (${avg(b.map((x) => x.pct))}%), average accuracy ${avg(b.map((x) => x.accuracy))}%.`, `Highest ${top.score}, lowest ${low.score}. Average time ${mmss(avg(b.map((x) => x.timeSec)))}. ${b.filter((x) => x.auto).length} ran out of time and were auto-submitted.`];
    if (weak.length) lines.push(`Students struggled most with ${weak.map(([k, v]) => `${k} (${v}%)`).join(', ')}.`);
    return ans(lines, { table: { cols: ['Section', 'Avg score %', 'Avg accuracy %'], rows: Object.entries(secs).map(([k, v]) => [k, avg(v.p), avg(v.acc)]) }, link: { to: `/admin/analytics`, label: 'Open analytics' } });
  }

  // 3. which mock is hardest / easiest / compare
  if (/hardest|easiest|toughest|compare|which mock|each mock|all mocks|every mock|mock.*(rank|wise)/.test(q) && !/question/.test(q)) {
    const rows = mocks.filter((m) => m.status !== 'draft').map((m) => { const b = h.briefs().filter((x) => x.mockId === m.id && inRange(x.submittedAt || 0, rg)); return { m, n: b.length, pct: avg(b.map((x) => x.pct)), acc: avg(b.map((x) => x.accuracy)) }; }).filter((x) => x.n > 0).sort((a, c) => a.pct - c.pct);
    if (!rows.length) return none('mock scores');
    return ans([`${rows[0].m.name} is the hardest so far (average ${rows[0].pct}%). ${rows[rows.length - 1].m.name} is the easiest (average ${rows[rows.length - 1].pct}%). Ranked ${rg.label}, lowest average first.`], { table: { cols: ['Mock', 'Finished', 'Avg score %', 'Avg accuracy %'], rows: rows.map((x) => [x.m.name, x.n, x.pct, x.acc]) } });
  }

  // 4. hardest questions
  if (/question/.test(q) && /wrong|hard|difficult|fail|lowest|struggl|worst|miss/.test(q)) {
    const stat = new Map();
    for (const { row, res } of h.results()) if ((!mock || row.mock_id === mock.id) && inRange(row.submitted_at || 0, rg)) for (const x of res.questions) { if (sec && x.section !== sec) continue; const o = stat.get(x.id) || { n: 0, ok: 0, text: x.text, topic: x.topic, mock: row.mock_id }; o.n++; if (x.status === 'correct') o.ok++; stat.set(x.id, o); }
    const rows = [...stat.entries()].filter(([, v]) => v.n >= 3).map(([id, v]) => ({ id, ...v, p: Math.round((v.ok / v.n) * 100) })).sort((a, c) => a.p - c.p).slice(0, 8);
    if (!rows.length) return none('questions (at least 3 attempts per question are needed)');
    return ans(`These ${rows.length} questions have the lowest share of correct answers${mock ? ` in ${mock.name}` : ''}. Check them for errors or a missing explanation.`, { table: { cols: ['Question', 'Topic', 'Attempts', '% correct'], rows: rows.map((x) => [x.text.replace(/\s+/g, ' ').slice(0, 70), x.topic, x.n, x.p]) }, link: { to: '/admin/bank', label: 'Open question bank' } });
  }

  // 5. topics
  if (/topic|weak|strong|struggl|worst|best at/.test(q) && !/student|user/.test(q.replace(/students? (are|is)/, ''))) {
    const tp = {};
    for (const { row, res } of h.results()) if ((!mock || row.mock_id === mock.id) && inRange(row.submitted_at || 0, rg)) for (const x of res.topics) { if (sec && x.section !== sec) continue; const o = (tp[x.topic] ||= { total: 0, correct: 0 }); o.total += x.total; o.correct += x.correct; }
    const list = Object.entries(tp).filter(([, v]) => v.total >= 5).map(([k, v]) => ({ k, total: v.total, p: Math.round((v.correct / v.total) * 100) })).sort((a, c) => a.p - c.p);
    if (!list.length) return none('topics');
    const wantStrong = /strong|best/.test(q); const show = (wantStrong ? [...list].reverse() : list).slice(0, 8);
    return ans(`${wantStrong ? 'Strongest' : 'Weakest'} topics${sec ? ` in ${sec}` : ''}${mock ? ` for ${mock.name}` : ''} (${rg.label}), by share of correct answers.`, { table: { cols: ['Topic', 'Questions answered', '% correct'], rows: show.map((x) => [x.k, x.total, x.p]) }, link: { to: '/admin/coverage', label: 'See question coverage' } });
  }

  // 6. top students
  if (/top|best|leaderboard|rank|highest/.test(q) && /student|user|scorer|performer|aspirant|candidate|\btop\s*\d+/.test(q)) {
    const by = new Map(); for (const x of h.briefs()) if (inRange(x.submittedAt || 0, rg) && (!mock || x.mockId === mock.id)) { const o = by.get(x.userId) || []; o.push(x); by.set(x.userId, o); }
    const names = new Map(students().map((u) => [u.id, u]));
    const rows = [...by.entries()].filter(([id]) => names.has(id)).map(([id, a]) => ({ u: names.get(id), n: a.length, pct: avg(a.map((x) => x.pct)), best: Math.max(...a.map((x) => x.score)) })).sort((a, c) => c.pct - a.pct || c.n - a.n).slice(0, n);
    if (!rows.length) return none('student scores');
    return ans(`Top ${rows.length} students by average score ${rg.label}${mock ? ` on ${mock.name}` : ''}.`, { table: { cols: ['Student', 'Mocks', 'Avg %', 'Best score'], rows: rows.map((x) => [x.u.name, x.n, x.pct, x.best]) } });
  }

  // 7. students who never attempted
  if (/never|haven't|havent|not attempted|no attempt|inactive|dormant|not started|zero attempts|without/.test(q)) {
    const had = new Set(db.prepare('SELECT DISTINCT user_id FROM attempts').all().map((x) => x.user_id));
    const rows = students().filter((u) => !had.has(u.id)).sort((a, c) => Date.parse(c.created_at) - Date.parse(a.created_at));
    return ans(`${plural(rows.length, 'student')} signed up but never started a mock.${rows.length ? ' The most recent signups are listed.' : ''}`, { table: rows.length ? { cols: ['Student', 'Contact', 'Signed up'], rows: rows.slice(0, 10).map((u) => [u.name, u.email || u.phone || '', String(u.created_at).slice(0, 10)]) } : undefined, link: { to: '/admin/users?segment=never', label: 'Open the list' } });
  }

  // 8. live now
  if (/right now|currently|live|in progress|taking|at the moment|now\b/.test(q) && /test|mock|student|who|how many|attempt/.test(q)) {
    const rows = db.prepare("SELECT a.mock_id, u.name FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.status='in_progress' AND a.started_at>?").all(t - 4 * 3600000);
    if (!rows.length) return ans('Nobody is taking a test right now.', { link: { to: '/admin/live', label: 'Open live tests' } });
    const by = {}; for (const x of rows) by[mockName(x.mock_id)] = (by[mockName(x.mock_id)] || 0) + 1;
    return ans(`${plural(rows.length, 'student is', 'students are')} taking a test right now.`, { table: { cols: ['Mock', 'Students'], rows: Object.entries(by) }, link: { to: '/admin/live', label: 'Open live tests' } });
  }

  // 9. integrity
  if (/suspicious|cheat|integrity|flagged|flags|left the (test|screen)|fullscreen/.test(q)) {
    const rows = db.prepare("SELECT integrity FROM attempts WHERE status='submitted' AND submitted_at>=? AND submitted_at<?").all(rg.from || t - 30 * DAY, rg.to);
    let n4 = 0; let n10 = 0; let fs3 = 0;
    for (const x of rows) { try { const i = JSON.parse(x.integrity || '{}'); if ((i.leaves || 0) >= 10) n10++; else if ((i.leaves || 0) >= 4) n4++; if ((i.fsExits || 0) >= 3) fs3++; } catch { /* ignore */ } }
    return ans(`${rg.from ? rg.label : 'In the last 30 days'}: ${plural(n10, 'attempt')} left the test 10 or more times and ${plural(n4, 'attempt')} left 4 to 9 times. ${plural(fs3, 'attempt')} left fullscreen 3 or more times. These are reasons to look, not proof.`, { link: { to: '/admin/integrity', label: 'Open Integrity' } });
  }

  // 10. doubts
  if (/doubt|chatbot|chat\b|helper/.test(q)) {
    const c = db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT user_id) u FROM doubts WHERE at>=? AND at<?').get(rg.from || t - 7 * DAY, rg.to);
    const topq = db.prepare('SELECT question_id, COUNT(*) c FROM doubts WHERE at>=? GROUP BY question_id ORDER BY c DESC LIMIT 5').all(rg.from || t - 7 * DAY);
    const lines = [`${plural(c.c, 'doubt')} asked by ${plural(c.u, 'student')} ${rg.from ? rg.label : 'in the last 7 days'}.`];
    return ans(lines, { table: topq.length ? { cols: ['Question id', 'Doubts'], rows: topq.map((x) => [x.question_id, x.c]) } : undefined });
  }

  // 11. sign-ups / student counts
  if (/sign ?up|new (users|students)|registered|joined|how many (students|users)|total (students|users)|student count/.test(q)) {
    const all = students(); const inR = all.filter((u) => inRange(Date.parse(u.created_at) || 0, rg));
    const active7 = all.filter((u) => u.last_seen && t - u.last_seen < 7 * DAY).length; const started = new Set(db.prepare('SELECT DISTINCT user_id FROM attempts').all().map((x) => x.user_id));
    const lines = [rg.from ? `${plural(inR.length, 'new student')} signed up ${rg.label}.` : `${plural(all.length, 'student')} have signed up in total.`, `${plural(active7, 'student')} were active in the last 7 days, and ${all.filter((u) => started.has(u.id)).length} of ${all.length} have started at least one mock.`];
    return ans(lines, { link: { to: '/admin/users', label: 'Open users' } });
  }

  // 12. attempts counts
  if (/attempt|submitted|finished|completed|tests? taken|how many tests/.test(q)) {
    const startedN = db.prepare('SELECT COUNT(*) c FROM attempts WHERE started_at>=? AND started_at<?').get(rg.from, rg.to).c;
    const b = h.briefs().filter((x) => inRange(x.submittedAt || 0, rg));
    return ans(`${plural(startedN, 'attempt')} started and ${b.length} finished ${rg.label}.${b.length ? ` Average score ${avg(b.map((x) => x.pct))}%.` : ''}`, { link: { to: '/admin/attempts', label: 'Open attempts' } });
  }

  // 13. whole platform
  if (/overall|summary|how are we|platform|doing|going|this week|today|report/.test(q)) {
    const r2 = rg.from ? rg : { from: t - 7 * DAY, to: Infinity, label: 'in the last 7 days' };
    const all = students(); const startedN = db.prepare('SELECT COUNT(*) c FROM attempts WHERE started_at>=? AND started_at<?').get(r2.from, r2.to).c;
    const b = h.briefs().filter((x) => inRange(x.submittedAt || 0, r2));
    const lines = [`${r2.label[0].toUpperCase()}${r2.label.slice(1)}: ${plural(all.filter((u) => inRange(Date.parse(u.created_at) || 0, r2)).length, 'new student')}, ${plural(startedN, 'attempt')} started, ${b.length} finished${b.length ? `, average score ${avg(b.map((x) => x.pct))}%` : ''}.`];
    if (b.length) { const by = {}; for (const x of b) by[x.mockId] = (by[x.mockId] || 0) + 1; const top = Object.entries(by).sort((a, c) => c[1] - a[1])[0]; lines.push(`The most taken mock was ${mockName(top[0])} (${top[1]} finished).`); }
    return ans(lines, { link: { to: '/admin', label: 'Open overview' } });
  }

  return { answer: ['I can answer questions about mocks, students, topics, attempts, sign-ups, live tests and integrity flags. Try one of the examples below.'], help: true };
}
