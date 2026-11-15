// Student-facing features added in v7: referrals, inbox and announcements, push, practice sets, batches and the teacher view.
import crypto from 'node:crypto';
import { DEFAULTS } from './lib/settings.js';
import { loadQuestions, sectionsFor } from './lib/catalog.js';
import { audienceWhere, inAudience } from './lib/audience.js';
import { SIZES, historyOf, pickPractice, weakList } from './lib/practice.js';
import { plainSummary } from './lib/summary.js';

const DAY = 86400000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LEVEL_RANK = { urgent: 0, warn: 1, good: 2, info: 3 };

export function makeFeatures({ db, now, settings, notifier, getMock, readResult, iso, exams }) {
  const refCfg = () => ({ ...DEFAULTS.referral, ...settings.get('referral', {}) });
  const origin = (req) => (process.env.MOCKDESK_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  // ---------- referrals ----------
  function ensureRefCode(userId) {
    const u = db.prepare('SELECT ref_code FROM users WHERE id=?').get(userId); if (u?.ref_code) return u.ref_code;
    for (let i = 0; i < 20; i++) {
      const code = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
      try { db.prepare('UPDATE users SET ref_code=? WHERE id=? AND ref_code IS NULL').run(code, userId); const got = db.prepare('SELECT ref_code FROM users WHERE id=?').get(userId).ref_code; if (got) return got; } catch { /* code taken, try another */ }
    }
    return null;
  }
  /** Called when a brand-new account is created with someone's code. Silently ignores anything invalid. */
  function applyReferral(newUserId, code) {
    if (!code || !refCfg().enabled) return false;
    const ref = db.prepare('SELECT id FROM users WHERE ref_code=?').get(String(code).trim().toUpperCase());
    if (!ref || ref.id === newUserId) return false;
    const r = db.prepare('INSERT OR IGNORE INTO referrals(referrer_id, friend_id, status, created_at) VALUES (?,?,?,?)').run(ref.id, newUserId, 'joined', now());
    if (r.changes) db.prepare('UPDATE users SET referred_by=? WHERE id=?').run(ref.id, newUserId);
    return !!r.changes;
  }
  /** Give a locked mock to a student. Returns the mock, or null when there is nothing left to give. */
  function grantReward(userId, reason) {
    const m = db.prepare("SELECT id, name FROM mocks WHERE ref_locked=1 AND status='published' AND id NOT IN (SELECT mock_id FROM unlocks WHERE user_id=?) ORDER BY number LIMIT 1").get(userId);
    if (!m) return null;
    db.prepare('INSERT OR IGNORE INTO unlocks(user_id, mock_id, reason, at) VALUES (?,?,?,?)').run(userId, m.id, reason, now());
    notifier.notify(userId, { kind: 'reward', title: `${m.name} is unlocked for you`, body: 'Thanks for inviting a friend. You can start it now.', link: '/', ref: `reward:${m.id}`, channels: { email: false } }).catch(() => {});
    return m;
  }
  /** After any test is submitted: a referred friend's first real attempt counts, and rewards both sides. */
  function onSubmitted(a, result) {
    if (a.mock_id === 'practice' || (result?.summary?.attempted ?? 0) < 5) return;
    const r = db.prepare("SELECT * FROM referrals WHERE friend_id=? AND status='joined'").get(a.user_id); if (!r) return;
    db.prepare("UPDATE referrals SET status='qualified', qualified_at=? WHERE id=?").run(now(), r.id);
    grantReward(a.user_id, 'referred');
    const q = db.prepare("SELECT COUNT(*) c FROM referrals WHERE referrer_id=? AND status='qualified'").get(r.referrer_id).c;
    const had = db.prepare("SELECT COUNT(*) c FROM unlocks WHERE user_id=? AND reason='referral'").get(r.referrer_id).c;
    if (Math.floor(q / Math.max(1, refCfg().friendsNeeded)) > had) grantReward(r.referrer_id, 'referral');
    notifier.notify(r.referrer_id, { kind: 'referral', title: 'Your friend finished their first mock', body: 'Thanks for inviting them.', link: '/profile', ref: `friend:${r.friend_id}`, channels: { email: false } }).catch(() => {});
  }
  /** open | locked (needs an invite) | hidden (scheduled for later) */
  function accessOf(row, userId, t = now()) {
    if (row.live_until && row.available_from && row.available_from > t) return 'upcoming';
    const released = !row.available_from || row.available_from <= t;
    const unlocked = !!db.prepare('SELECT 1 FROM unlocks WHERE user_id=? AND mock_id=?').get(userId, row.id);
    if (row.ref_locked === 1 && !(row.available_from && row.available_from <= t)) return unlocked ? 'open' : 'locked';
    if (released) return 'open';
    return unlocked ? 'open' : 'hidden';
  }

  // ---------- live-window mocks ----------
  /** null for normal mocks; otherwise upcoming | open | closed. A live mock can be started any time between its opening and closing time. */
  const liveState = (row, t = now()) => (!row.live_until || !row.available_from ? null : t < row.available_from ? 'upcoming' : t <= row.live_until ? 'open' : 'closed');
  const boards = new Map();
  /** First finished attempt per student inside the window counts for rank. Built once, after the window closes. */
  function board(row) {
    const hit = boards.get(row.id); if (hit && (now() - hit.at < 60000 || now() > row.live_until + 3 * 3600000)) return hit;
    for (const r of db.prepare("SELECT id, result FROM attempts WHERE mock_id=? AND status='submitted' AND score IS NULL AND result IS NOT NULL").all(row.id)) { const s = readResult(r).summary; db.prepare('UPDATE attempts SET score=?, accuracy=? WHERE id=?').run(s.score, s.accuracy, r.id); }
    const rows = db.prepare("SELECT a.id, a.user_id, a.started_at, a.submitted_at, a.score, a.accuracy, u.name FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.mock_id=? AND a.status='submitted' AND a.started_at>=? AND a.started_at<=? ORDER BY a.started_at").all(row.id, row.available_from, row.live_until);
    const first = new Map(); for (const r of rows) if (!first.has(r.user_id)) first.set(r.user_id, r);
    const list = [...first.values()].sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || (a.submitted_at - a.started_at) - (b.submitted_at - b.started_at));
    list.forEach((r, i) => { r.rank = i + 1; });
    const out = { at: now(), list, byAttempt: new Map(list.map((r) => [r.id, r])), byUser: new Map(list.map((r) => [r.user_id, r])) }; boards.set(row.id, out); return out;
  }
  const shortName = (n) => { const p = String(n || 'Student').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
  const participants = (row) => db.prepare("SELECT COUNT(DISTINCT user_id) c FROM attempts WHERE mock_id=? AND status='submitted' AND started_at>=? AND started_at<=?").get(row.id, row.available_from, row.live_until).c;
  /** Small block for the dashboard card. */
  function liveSummary(row, userId, t = now()) {
    const state = liveState(row, t); if (!state) return null;
    const out = { state, opensAt: row.available_from, closesAt: row.live_until, taken: !!db.prepare("SELECT 1 FROM attempts WHERE user_id=? AND mock_id=? AND started_at>=? AND started_at<=?").get(userId, row.id, row.available_from, row.live_until) };
    if (state === 'closed') { const b = board(row); const me = b.byUser.get(userId); out.participants = b.list.length; if (me) { out.rank = me.rank; out.of = b.list.length; } }
    return out;
  }
  /** On the result page: is this the attempt that counts, and where does it stand. */
  function liveInfo(a) {
    const row = db.prepare('SELECT * FROM mocks WHERE id=?').get(a.mock_id); const state = row && liveState(row); if (!state || a.started_at < row.available_from || a.started_at > row.live_until) return null;
    const first = db.prepare("SELECT id FROM attempts WHERE user_id=? AND mock_id=? AND status='submitted' AND started_at>=? AND started_at<=? ORDER BY started_at LIMIT 1").get(a.user_id, a.mock_id, row.available_from, row.live_until);
    const official = first?.id === a.id; const out = { state, official, closesAt: row.live_until, name: row.name };
    if (state === 'closed' && official) { const b = board(row); const me = b.byAttempt.get(a.id); if (me) { out.rank = me.rank; out.of = b.list.length; out.percentile = b.list.length > 1 ? Math.round(((b.list.length - me.rank) / (b.list.length - 1)) * 100) : 100; } }
    if (state === 'open') out.participants = participants(row);
    return out;
  }

  // ---------- notebook: bookmarks and mistakes ----------
  const submittedOf = (userId) => db.prepare("SELECT id, mock_id, submitted_at, result, snapshot FROM attempts WHERE user_id=? AND status='submitted' AND result IS NOT NULL ORDER BY submitted_at DESC").all(userId);
  /** Questions the student currently gets wrong: the latest result for each question was incorrect. */
  function mistakesOf(userId) {
    const seen = new Set(); const out = [];
    for (const r of submittedOf(userId)) { const res = readResult(r); for (const q of res.questions || []) { if (q.qualifying || seen.has(q.id)) continue; seen.add(q.id); if (q.status === 'incorrect') out.push({ q, attemptId: r.id, at: r.submitted_at, mock: res.attempt?.mockName || '' }); } }
    return out;
  }
  function bookmarksOf(userId) {
    const rows = db.prepare('SELECT * FROM bookmarks WHERE user_id=? ORDER BY created_at DESC').all(userId); const cache = new Map(); const out = [];
    for (const b of rows) {
      let res = cache.get(b.attempt_id); if (res === undefined) { const a = db.prepare("SELECT result FROM attempts WHERE id=? AND user_id=? AND result IS NOT NULL").get(b.attempt_id, userId); res = a ? readResult(a) : null; cache.set(b.attempt_id, res); }
      const q = res?.questions?.find((x) => x.id === b.question_id); if (q) out.push({ q, attemptId: b.attempt_id, at: b.created_at, mock: res.attempt?.mockName || '', note: b.note || '' });
    }
    return out;
  }
  const noteOf = (userId) => new Map(db.prepare('SELECT question_id, note FROM bookmarks WHERE user_id=?').all(userId).map((b) => [b.question_id, b.note || '']));
  const shapeQ = ({ q, attemptId, at, mock, note }, marks) => ({ id: q.id, section: q.section, topic: q.topic, difficulty: q.difficulty, text: q.text, passage: q.passage || null, table: q.table || null, figure: q.figure || null, options: q.options, correct: q.correct, selected: q.selected, status: q.status, explanation: q.explanation || '', steps: q.steps || [], shortcut: q.shortcut || '', trap: q.trap || '', whyWrong: q.whyWrong || null, attemptId, mock, at, bookmarked: marks.has(q.id), note: marks.get(q.id) ?? note ?? '' });
  /** Runtime question objects (with answers) for practice, taken from the attempt each one came from. */
  function notebookQuestions(userId, source) {
    const picks = source === 'bookmarks' ? bookmarksOf(userId) : mistakesOf(userId); const snaps = new Map(); const out = [];
    for (const p of picks) { if (!snaps.has(p.attemptId)) { const a = db.prepare('SELECT snapshot FROM attempts WHERE id=?').get(p.attemptId); try { snaps.set(p.attemptId, new Map(JSON.parse(a.snapshot).questions.map((x) => [x.id, x]))); } catch { snaps.set(p.attemptId, new Map()); } } const q = snaps.get(p.attemptId).get(p.q.id); if (q) out.push(q); }
    return out;
  }

  // ---------- practice ----------
  const PRACTICE_DAILY = Number(process.env.MOCKDESK_PRACTICE_PER_DAY) || 5;
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function practiceData(userId, source) {
    const rows = db.prepare("SELECT id, mock_id, result FROM attempts WHERE user_id=? AND status='submitted' AND mock_id!='practice'").all(userId);
    const history = historyOf(rows, readResult);
    const candidates = new Map();
    for (const q of loadQuestions(db, 'pool')) candidates.set(q.id, q);
    for (const id of history.mockIds) { const m = getMock(id); if (m) for (const q of m.questions) candidates.set(q.id, q); }
    const examId = rows.length ? db.prepare('SELECT exam_id FROM mocks WHERE id=?').get(rows[rows.length - 1].mock_id)?.exam_id : null;
    const pat = exams.patternFor(examId); const secs = new Set(Object.keys(pat.sections));
    let list = source ? notebookQuestions(userId, source) : [...candidates.values()].filter((q) => secs.has(q.section));
    // marks follow the exam the student is preparing for
    list = list.filter((q) => q.options?.length === 4 && q.answer !== undefined && pat.sections[q.section]).map((q) => ({ ...q, marks: pat.sections[q.section].marksPerQuestion, negativeMarks: pat.sections[q.section].negativeMarks }));
    return { rows, history, candidates: list, pat };
  }

  function mount(api) {
    // referral
    api.get('/referral', (req, res) => {
      const code = ensureRefCode(req.user.id); const cfg = refCfg();
      const rows = db.prepare('SELECT status FROM referrals WHERE referrer_id=?').all(req.user.id);
      const qualified = rows.filter((r) => r.status === 'qualified').length; const need = Math.max(1, cfg.friendsNeeded);
      const unlocked = new Set(db.prepare('SELECT mock_id FROM unlocks WHERE user_id=?').all(req.user.id).map((x) => x.mock_id));
      const rewards = db.prepare("SELECT id, name, number FROM mocks WHERE ref_locked=1 AND status='published' ORDER BY number").all().map((m) => ({ id: m.id, name: m.name, unlocked: unlocked.has(m.id) }));
      res.json({ enabled: cfg.enabled, code, link: `${origin(req)}/?ref=${code}`, joined: rows.length, qualified, friendsNeeded: need, toNext: need - (qualified % need), rewards });
    });

    // inbox: notifications plus live announcements for this student
    const announcementsFor = (uid, t) => db.prepare('SELECT * FROM announcements WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) ORDER BY pinned DESC, id DESC LIMIT 60').all(t, t).filter((a) => inAudience(db, uid, a.audience || 'all', a.batch_id, t));
    const stateOf = (uid) => new Map(db.prepare('SELECT * FROM announcement_state WHERE user_id=?').all(uid).map((s) => [s.announcement_id, s]));
    const shape = (a) => ({ id: a.id, title: a.title || '', text: a.text, level: a.level, linkUrl: a.link_url || null, linkLabel: a.link_label || null, dismissible: a.dismissible !== 0, pinned: a.pinned === 1 });
    api.get('/announcements', (req, res) => {
      const t = now(); const st = stateOf(req.user.id);
      const list = announcementsFor(req.user.id, t).filter((a) => !(a.dismissible !== 0 && st.get(a.id)?.dismissed_at))
        .sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || b.id - a.id).slice(0, 3);
      for (const a of list) db.prepare('INSERT OR IGNORE INTO announcement_state(announcement_id,user_id,seen_at) VALUES (?,?,?)').run(a.id, req.user.id, t);
      res.json({ announcements: list.map(shape) });
    });
    api.post('/announcements/:id/dismiss', (req, res) => {
      const a = db.prepare('SELECT id, dismissible FROM announcements WHERE id=?').get(Number(req.params.id)); if (!a) return res.status(404).json({ error: 'Not found' });
      if (a.dismissible === 0) return res.status(400).json({ error: 'This message cannot be dismissed' });
      db.prepare('INSERT INTO announcement_state(announcement_id,user_id,seen_at,dismissed_at,read_at) VALUES (?,?,?,?,?) ON CONFLICT(announcement_id,user_id) DO UPDATE SET dismissed_at=excluded.dismissed_at, read_at=excluded.read_at').run(a.id, req.user.id, now(), now(), now());
      res.json({ ok: true });
    });
    api.post('/announcements/:id/click', (req, res) => {
      const a = db.prepare('SELECT id FROM announcements WHERE id=?').get(Number(req.params.id)); if (!a) return res.status(404).json({ error: 'Not found' });
      db.prepare('INSERT INTO announcement_state(announcement_id,user_id,seen_at,clicked_at,read_at) VALUES (?,?,?,?,?) ON CONFLICT(announcement_id,user_id) DO UPDATE SET clicked_at=excluded.clicked_at, read_at=excluded.read_at').run(a.id, req.user.id, now(), now(), now());
      res.json({ ok: true });
    });
    api.get('/inbox', (req, res) => {
      const t = now(); const st = stateOf(req.user.id);
      const notes = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40').all(req.user.id).map((n) => ({ key: `n${n.id}`, type: 'notification', id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, at: n.created_at, read: !!n.read_at }));
      const anns = announcementsFor(req.user.id, t).map((a) => ({ key: `a${a.id}`, type: 'announcement', id: a.id, level: a.level, title: a.title || 'Announcement', body: a.text, link: a.link_url, linkLabel: a.link_label, at: a.starts_at || a.created_at, read: !!st.get(a.id)?.read_at }));
      const items = [...notes, ...anns].sort((a, b) => b.at - a.at).slice(0, 50);
      res.json({ items, unread: items.filter((i) => !i.read).length });
    });
    api.post('/inbox/read', (req, res) => {
      const t = now(); db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(t, req.user.id);
      for (const a of announcementsFor(req.user.id, t)) db.prepare('INSERT INTO announcement_state(announcement_id,user_id,seen_at,read_at) VALUES (?,?,?,?) ON CONFLICT(announcement_id,user_id) DO UPDATE SET read_at=COALESCE(read_at, excluded.read_at)').run(a.id, req.user.id, t, t);
      res.json({ ok: true });
    });
    api.get('/notifications/prefs', (req, res) => { let p = {}; try { p = JSON.parse(req.user.notify_prefs || '{}'); } catch { /* defaults */ } res.json({ prefs: { inapp: true, push: true, email: true, ...p }, hasEmail: !!req.user.email, emailConfigured: notifier.hasMailer, pushSubscribed: !!db.prepare('SELECT 1 FROM push_subs WHERE user_id=?').get(req.user.id) }); });
    api.patch('/notifications/prefs', (req, res) => {
      let p = {}; try { p = JSON.parse(req.user.notify_prefs || '{}'); } catch { /* defaults */ }
      for (const k of ['inapp', 'push', 'email']) if (typeof req.body?.[k] === 'boolean') p[k] = req.body[k];
      db.prepare('UPDATE users SET notify_prefs=? WHERE id=?').run(JSON.stringify(p), req.user.id); res.json({ prefs: { inapp: true, push: true, email: true, ...p } });
    });
    api.get('/push/key', async (req, res) => { if (!notifier.hasPush) return res.status(503).json({ error: 'Push is not available' }); try { res.json({ key: await notifier.publicKey() }); } catch (e) { res.status(503).json({ error: 'Push is not available' }); } });
    api.post('/push/subscribe', (req, res) => {
      const s = req.body?.subscription; if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return res.status(400).json({ error: 'Invalid subscription' });
      db.prepare('INSERT INTO push_subs(endpoint,user_id,p256dh,auth,created_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth').run(String(s.endpoint).slice(0, 600), req.user.id, s.keys.p256dh, s.keys.auth, now());
      res.json({ ok: true });
    });
    api.post('/push/unsubscribe', (req, res) => { db.prepare('DELETE FROM push_subs WHERE user_id=? AND (endpoint=? OR ?=1)').run(req.user.id, String(req.body?.endpoint || ''), req.body?.all ? 1 : 0); res.json({ ok: true }); });

    api.get('/mocks/:id/live', (req, res) => {
      const row = db.prepare('SELECT * FROM mocks WHERE id=?').get(req.params.id); const t = now(); const state = row && row.status === 'published' ? liveState(row, t) : null;
      if (!state) return res.status(404).json({ error: 'This is not a live mock' });
      const out = { name: row.name, state, opensAt: row.available_from, closesAt: row.live_until, mine: null, top: null, participants: state === 'upcoming' ? 0 : state === 'open' ? participants(row) : board(row).list.length };
      if (state !== 'upcoming') { const mine = db.prepare("SELECT id FROM attempts WHERE user_id=? AND mock_id=? AND status='submitted' AND started_at>=? AND started_at<=? ORDER BY started_at LIMIT 1").get(req.user.id, row.id, row.available_from, row.live_until); out.mine = mine ? { attemptId: mine.id } : null; }
      if (state === 'closed') { const b = board(row); const me = b.byUser.get(req.user.id); if (me) out.mine = { attemptId: me.id, score: me.score, accuracy: me.accuracy, rank: me.rank, of: b.list.length, percentile: b.list.length > 1 ? Math.round(((b.list.length - me.rank) / (b.list.length - 1)) * 100) : 100 }; out.top = b.list.slice(0, 10).map((r) => ({ rank: r.rank, name: shortName(r.name), score: r.score, accuracy: r.accuracy, you: r.user_id === req.user.id })); }
      res.json(out);
    });

    // practice sets
    api.get('/practice/overview', (req, res) => {
      const { rows, history, candidates } = practiceData(req.user.id);
      const used = db.prepare("SELECT COUNT(*) c FROM attempts WHERE user_id=? AND mock_id='practice' AND started_at>=?").get(req.user.id, dayStart(now())).c;
      const nb = { bookmarks: bookmarksOf(req.user.id).length, mistakes: mistakesOf(req.user.id).length };
      const open = db.prepare("SELECT id FROM attempts WHERE user_id=? AND mock_id='practice' AND status='in_progress'").get(req.user.id);
      res.json({ ready: rows.length > 0 && candidates.length >= 10, needsMock: rows.length === 0, weak: weakList(history.topics, 6), sizes: SIZES, left: Math.max(0, PRACTICE_DAILY - used), inProgress: open?.id || null, pool: candidates.length, notebook: nb });
    });
    api.post('/practice', (req, res) => {
      const nbSrc = ['mistakes', 'bookmarks'].includes(req.body?.source); const size = Number(req.body?.size) || 20; if (!(nbSrc ? [5, ...SIZES] : SIZES).includes(size)) return res.status(400).json({ error: 'Choose 10, 20 or 30 questions' });
      const t = now(); const open = db.prepare("SELECT id FROM attempts WHERE user_id=? AND mock_id='practice' AND status='in_progress'").get(req.user.id);
      if (open && !req.body?.dryRun) return res.json({ attemptId: open.id, resumed: true });
      const source = ['mistakes', 'bookmarks'].includes(req.body?.source) ? req.body.source : null;
      const { rows, history, candidates, pat } = practiceData(req.user.id, source);
      if (!rows.length && !source) return res.status(409).json({ error: 'Finish one full mock first so we know your weak topics.', code: 'NEEDS_MOCK' });
      const used = db.prepare("SELECT COUNT(*) c FROM attempts WHERE user_id=? AND mock_id='practice' AND started_at>=?").get(req.user.id, dayStart(t)).c;
      if (!req.body?.dryRun && used >= PRACTICE_DAILY) return res.status(429).json({ error: `You have built ${PRACTICE_DAILY} practice sets today. Come back tomorrow.`, code: 'PRACTICE_LIMIT' });
      const { questions, topics } = pickPractice({ candidates, history, size });
      if (questions.length < (source ? 3 : 5)) return res.status(409).json({ error: source ? `Your ${source === 'mistakes' ? 'mistake list' : 'bookmarks'} needs at least 3 questions to build a set.` : 'There are not enough questions yet to build a practice set. Try again after more mocks are added.', code: 'NOT_ENOUGH' });
      const minutes = Math.max(10, questions.length);
      if (req.body?.dryRun) return res.json({ count: questions.length, minutes, topics });
      const sections = [...new Set(questions.map((q) => q.section))];
      const title = source ? (source === 'mistakes' ? 'Redo · my mistakes' : 'Redo · my bookmarks') : `Practice · ${topics.slice(0, 2).map((x) => x.topic).join(', ')}`;
      const snap = { meta: { id: 'practice', number: 0, name: title, difficulty: 'moderate', description: 'Built from your weak topics', status: 'published', tags: ['practice'], source: 'practice' }, questions, segments: [{ id: 'practice', sections, minutes }], sectionsCfg: sectionsFor(questions, 'practice', pat), complete: true };
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO attempts(id,user_id,mock_id,status,segment_index,segment_started_at,started_at,snapshot,ip,kind) VALUES (?,?,?,'in_progress',0,?,?,?,?, 'practice')").run(id, req.user.id, 'practice', t, t, JSON.stringify(snap), req.ip || null);
      res.json({ attemptId: id, resumed: false, count: questions.length, minutes });
    });

    // notebook
    api.get('/notebook', (req, res) => {
      const tab = req.query.tab === 'bookmarks' ? 'bookmarks' : 'mistakes'; const section = String(req.query.section || ''); const topic = String(req.query.topic || ''); const off = Math.max(0, Number(req.query.offset) || 0);
      const all = tab === 'bookmarks' ? bookmarksOf(req.user.id) : mistakesOf(req.user.id); const marks = noteOf(req.user.id);
      const sections = [...new Set(all.map((x) => x.q.section))]; const topics = [...new Set(all.filter((x) => !section || x.q.section === section).map((x) => x.q.topic))].sort();
      const list = all.filter((x) => (!section || x.q.section === section) && (!topic || x.q.topic === topic));
      res.json({ tab, total: list.length, sections, topics, items: list.slice(off, off + 15).map((x) => shapeQ(x, marks)), counts: { bookmarks: tab === 'bookmarks' ? all.length : bookmarksOf(req.user.id).length, mistakes: tab === 'mistakes' ? all.length : mistakesOf(req.user.id).length } });
    });
    api.get('/bookmarks/ids', (req, res) => { const r = db.prepare('SELECT question_id, note FROM bookmarks WHERE user_id=?').all(req.user.id); res.json({ ids: r.map((x) => x.question_id), notes: Object.fromEntries(r.filter((x) => x.note).map((x) => [x.question_id, x.note])) }); });
    api.put('/bookmarks/:qid', (req, res) => {
      const attemptId = String(req.body?.attemptId || ''); const a = db.prepare("SELECT result FROM attempts WHERE id=? AND user_id=? AND status='submitted'").get(attemptId, req.user.id);
      if (!a) return res.status(404).json({ error: 'Finish the test first, then save its questions' });
      if (!readResult(a).questions?.some((q) => q.id === req.params.qid)) return res.status(404).json({ error: 'Question not found in that test' });
      const note = req.body?.note === undefined ? null : String(req.body.note).slice(0, 500);
      if (db.prepare('SELECT COUNT(*) c FROM bookmarks WHERE user_id=?').get(req.user.id).c >= 500 && !db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND question_id=?').get(req.user.id, req.params.qid)) return res.status(400).json({ error: 'You can save up to 500 questions. Remove some first.' });
      db.prepare("INSERT INTO bookmarks(user_id,question_id,attempt_id,note,created_at) VALUES (?,?,?,COALESCE(?, ''),?) ON CONFLICT(user_id,question_id) DO UPDATE SET note=COALESCE(?, note), attempt_id=excluded.attempt_id").run(req.user.id, req.params.qid, attemptId, note, now(), note);
      res.json({ ok: true });
    });
    api.delete('/bookmarks/:qid', (req, res) => { db.prepare('DELETE FROM bookmarks WHERE user_id=? AND question_id=?').run(req.user.id, req.params.qid); res.json({ ok: true }); });

    // batches (student side)
    api.post('/batches/join', (req, res) => {
      const code = String(req.body?.code || '').trim().toUpperCase(); if (code.length < 4) return res.status(400).json({ error: 'Enter the batch code your teacher gave you' });
      const b = db.prepare('SELECT * FROM batches WHERE code=? AND archived=0').get(code); if (!b) return res.status(404).json({ error: 'No batch has that code. Check it with your teacher.' });
      const r = db.prepare('INSERT OR IGNORE INTO batch_members(batch_id,user_id,joined_at) VALUES (?,?,?)').run(b.id, req.user.id, now());
      res.json({ ok: true, joined: !!r.changes, batch: { id: b.id, name: b.name } });
    });
    api.get('/my/batches', (req, res) => res.json({ batches: db.prepare('SELECT b.id, b.name, (SELECT GROUP_CONCAT(u.name, \', \') FROM batch_teachers bt JOIN users u ON u.id=bt.user_id WHERE bt.batch_id=b.id) teachers FROM batches b JOIN batch_members bm ON bm.batch_id=b.id WHERE bm.user_id=? AND b.archived=0').all(req.user.id) }));
    api.post('/batches/:id/leave', (req, res) => { db.prepare('DELETE FROM batch_members WHERE batch_id=? AND user_id=?').run(Number(req.params.id), req.user.id); res.json({ ok: true }); });
  }

  // ---------- teacher portal ----------
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
  function mountTeacher(api) {
    const guard = (req, res, next) => (req.user?.role === 'teacher' ? next() : res.status(403).json({ error: 'Teacher access only' }));
    const mine = (req) => db.prepare('SELECT b.* FROM batches b JOIN batch_teachers bt ON bt.batch_id=b.id WHERE bt.user_id=? AND b.archived=0 ORDER BY b.name').all(req.user.id);
    const batchOf = (req) => db.prepare('SELECT b.* FROM batches b JOIN batch_teachers bt ON bt.batch_id=b.id WHERE bt.user_id=? AND b.id=? AND b.archived=0').get(req.user.id, Number(req.params.id));
    const attemptsOf = (ids) => (ids.length ? db.prepare(`SELECT id, user_id, mock_id, submitted_at, started_at, result FROM attempts WHERE status='submitted' AND mock_id!='practice' AND user_id IN (${ids.map(() => '?').join(',')}) ORDER BY submitted_at`).all(...ids) : []);
    const members = (b) => db.prepare("SELECT u.id, u.name, u.email, u.phone, u.last_seen, bm.joined_at FROM batch_members bm JOIN users u ON u.id=bm.user_id WHERE bm.batch_id=? AND COALESCE(u.role,'student')='student' ORDER BY u.name").all(b.id);
    const mockName = (id) => db.prepare('SELECT name FROM mocks WHERE id=?').get(id)?.name || id;
    function summarise(b) {
      const ms = members(b); const att = attemptsOf(ms.map((m) => m.id)); const by = new Map(); const topics = new Map(); const perMock = new Map(); const t = now();
      for (const r of att) {
        const res = readResult(r); const s = res.summary; (by.get(r.user_id) || by.set(r.user_id, []).get(r.user_id)).push({ id: r.id, mock: r.mock_id, at: r.submitted_at, pct: s.percentage, acc: s.accuracy, score: s.score, max: s.maxMarks });
        const pm = perMock.get(r.mock_id) || { n: 0, p: [] }; pm.n++; pm.p.push(s.percentage); perMock.set(r.mock_id, pm);
        for (const x of res.topics) { if (x.qualifying) continue; const k = `${x.section}:${x.topic}`; const o = topics.get(k) || { section: x.section, topic: x.topic, total: 0, correct: 0 }; o.total += x.total; o.correct += x.correct; topics.set(k, o); }
      }
      const students = ms.map((m) => { const a = by.get(m.id) || []; const last = a[a.length - 1]; const first = a[0]; return { id: m.id, name: m.name, contact: m.email || m.phone || '', joinedAt: m.joined_at, lastActive: m.last_seen || last?.at || null, mocks: a.length, avgPct: avg(a.map((x) => x.pct)), lastPct: last?.pct ?? null, trend: a.length > 1 ? Math.round((last.pct - first.pct) * 10) / 10 : null, inactive: !(m.last_seen && t - m.last_seen < 7 * DAY) && !(last && t - last.at < 7 * DAY) }; });
      return { students, perMock: [...perMock.entries()].map(([id, v]) => ({ mockId: id, name: mockName(id), finished: v.n, avgPct: avg(v.p) })), weakTopics: [...topics.values()].filter((x) => x.total >= 6).map((x) => ({ ...x, pct: pct(x.correct, x.total) })).sort((a, b) => a.pct - b.pct).slice(0, 8), by };
    }
    api.get('/teacher/batches', guard, (req, res) => res.json({ batches: mine(req).map((b) => { const s = summarise(b); return { id: b.id, name: b.name, code: b.code, students: s.students.length, avgPct: avg(s.students.filter((x) => x.mocks).map((x) => x.avgPct)), active7: s.students.filter((x) => !x.inactive).length }; }) }));
    api.get('/teacher/batches/:id', guard, (req, res) => {
      const b = batchOf(req); if (!b) return res.status(404).json({ error: 'Batch not found' });
      const s = summarise(b); res.json({ batch: { id: b.id, name: b.name, code: b.code }, students: s.students, perMock: s.perMock, weakTopics: s.weakTopics });
    });
    api.get('/teacher/batches/:id/students/:uid', guard, (req, res) => {
      const b = batchOf(req); if (!b) return res.status(404).json({ error: 'Batch not found' });
      const m = members(b).find((x) => x.id === Number(req.params.uid)); if (!m) return res.status(404).json({ error: 'That student is not in this batch' });
      const att = attemptsOf([m.id]); const topics = new Map(); let plain = null;
      const list = att.map((r) => { const res2 = readResult(r); const s = res2.summary; for (const x of res2.topics) { if (x.qualifying) continue; const k = `${x.section}:${x.topic}`; const o = topics.get(k) || { section: x.section, topic: x.topic, total: 0, correct: 0 }; o.total += x.total; o.correct += x.correct; topics.set(k, o); } return { id: r.id, mock: mockName(r.mock_id), at: r.submitted_at, score: s.score, max: s.maxMarks, pct: s.percentage, accuracy: s.accuracy, attempted: s.attempted }; });
      if (att.length) { const last = att[att.length - 1]; const prev = att.length > 1 ? readResult(att[att.length - 2]).summary : null; plain = plainSummary(readResult(last), { prev, target: db.prepare('SELECT target_score FROM users WHERE id=?').get(m.id)?.target_score }); }
      res.json({ student: { id: m.id, name: m.name, contact: m.email || m.phone || '', joinedAt: m.joined_at }, attempts: list.reverse(), topics: [...topics.values()].map((x) => ({ ...x, pct: pct(x.correct, x.total) })).sort((a, b) => a.pct - b.pct), plain });
    });
    api.get('/teacher/batches/:id/export.csv', guard, (req, res) => {
      const b = batchOf(req); if (!b) return res.status(404).json({ error: 'Batch not found' });
      const s = summarise(b); const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = ['Name,Contact,Mocks finished,Average %,Latest %,Change since first %,Last active', ...s.students.map((x) => [x.name, x.contact, x.mocks, x.avgPct, x.lastPct ?? '', x.trend ?? '', x.lastActive ? new Date(x.lastActive).toISOString().slice(0, 10) : ''].map(q).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${b.name.replace(/[^a-z0-9]+/gi, '-')}-results.csv"`); res.send(csv);
    });
  }
  return { mount, mountTeacher, ensureRefCode, applyReferral, grantReward, onSubmitted, accessOf, refCfg, liveSummary, liveInfo };
}
