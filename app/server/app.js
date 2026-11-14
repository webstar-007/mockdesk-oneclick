import { recordError } from './lib/health.js';
import { answerDoubt } from './lib/doubts.js';
import { plainSummary } from './lib/summary.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import examConfig from '../config/exam.config.js';
import { validateDbMock } from './lib/bank.js';
import { seedFromFiles, loadQuestions, mockRow, parseMock, sectionsFor, segmentsFor } from './lib/catalog.js';
import { adminRouter, UPLOAD_DIR } from './admin.js';
import { makeSettings } from './lib/settings.js';
import { makeMailer, makePusher, createNotifier } from './lib/notify.js';
import { runReminders } from './lib/reminders.js';
import { makeFeatures } from './features.js';
import { promoteAdmins } from './lib/admins.js';
import { buildResult, upgradeResult } from './lib/scoring.js';
import { makeSender, normEmail, normPhone, maskId, newCode, hashCode, codeMatches, OTP_TTL_MS, OTP_COOLDOWN_MS, OTP_MAX_PER_HOUR, OTP_MAX_WRONG } from './lib/otp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRACE_MS = 5000;
// Dev/testing only: MOCKDESK_TIME_SCALE=0.02 shortens every section timer (e.g. 30 min -> 36 s).
const SCALE = Number(process.env.MOCKDESK_TIME_SCALE) > 0 ? Number(process.env.MOCKDESK_TIME_SCALE) : 1;
const SESSION_MS = 14 * 24 * 3600 * 1000;
const INSTRUCTIONS = [
  'The paper has five sections: Mathematical Abilities, Reasoning, English, General Awareness and Computer Knowledge.',
  'Each section has its own countdown. When it ends, answers are saved and submitted automatically and the next section opens.',
  'Once a section has ended you cannot return to it.',
  'Every question carries 3 marks. 1 mark is deducted for each wrong answer. There is no penalty for unanswered questions.',
  'Computer Knowledge is a qualifying section. You must score at least 27 of its 60 marks to qualify. Its marks are not added to your total score.',
  'Use the question palette to jump to any question inside the open section.',
  'Mark for Review is only a reminder for you; a marked question that has an answer is still evaluated.',
  'Your progress is saved automatically. If you lose connection or close the tab, sign in and resume. The clock keeps running.',
];

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const iso = (ms) => new Date(ms).toISOString();

export function createApp(db, { allowIncomplete = process.env.MOCKDESK_ALLOW_INCOMPLETE === '1', now = () => Date.now(), serveClient = true, otpSender = makeSender() } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ---------- mock catalogue (cached; validated banks only unless allowIncomplete) ----------
  seedFromFiles(db);
  const promote = () => promoteAdmins(db);
  promote();
  db.prepare("INSERT OR IGNORE INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES ('practice',0,'Practice set','moderate','Personalised practice (hidden)','archived','[]','practice',?,?)").run(now(), now());
  const settings = makeSettings(db);
  const notifier = createNotifier({ db, now, settings, mailer: makeMailer(), pusher: makePusher(settings) });
  const cache = new Map();
  const invalidate = () => { cache.clear(); snaps.clear(); };
  const hydrate = ({ meta, questions, segments, sectionsCfg, complete }) => ({ meta, questions, segments, sectionsCfg, complete, byId: new Map(questions.map((q) => [q.id, q])) });
  /** Build a runnable mock from the database. Returns null when it does not exist or (unless allowIncomplete) does not validate. */
  function getMock(id) {
    if (cache.has(id)) return cache.get(id);
    const row = parseMock(mockRow(db, id));
    if (!row) return null;
    const questions = loadQuestions(db, id);
    const v = validateDbMock(row, questions);
    const complete = v.errors.length === 0;
    if (!complete && !allowIncomplete) { cache.set(id, null); return null; }
    const m = hydrate({ meta: { id: row.id, number: row.number, name: row.name, difficulty: row.difficulty, description: row.description, status: row.status, tags: row.tags, source: row.source }, questions, segments: segmentsFor(questions, row.source), sectionsCfg: sectionsFor(questions, row.source), complete });
    cache.set(id, m);
    return m;
  }
  /** An attempt runs against the questions it started with, so later edits never change a test in progress. */
  const snaps = new Map();
  function mockOf(a) {
    if (!a.snapshot) return getMock(a.mock_id);
    let m = snaps.get(a.id);
    if (!m) { m = hydrate(JSON.parse(a.snapshot)); if (snaps.size > 200) snaps.clear(); snaps.set(a.id, m); }
    return m;
  }
  const mockName = (id) => db.prepare('SELECT name FROM mocks WHERE id=?').get(id)?.name || id;
  const segQuestions = (m, segIdx) => m.questions.filter((q) => m.segments[segIdx].sections.includes(q.section));
  const isQual = (k) => !!examConfig.sections[k]?.qualifying;
  // Totals count only scored sections; qualifying sections (Computer) are listed separately.
  const totals = (m) => ({
    q: m.questions.filter((q) => !isQual(q.section)).length,
    marks: m.questions.filter((q) => !isQual(q.section)).reduce((a, q) => a + q.marks, 0),
    min: m.segments.reduce((a, s) => a + s.minutes, 0),
  });
  const readResult = (r) => upgradeResult(JSON.parse(r.result), examConfig.sections);
  const features = makeFeatures({ db, now, settings, notifier, getMock, readResult, iso });
  app.runReminders = (opts = {}) => runReminders({ db, notifier, settings, now, ...opts });
  app.notifier = notifier; app.db = db;

  // ---------- auth ----------
  const cookieOf = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const publicUser = (u) => ({ role: u.role || 'student', id: u.id, name: u.name, email: u.email, phone: u.phone || null, targetScore: u.target_score, examDate: u.exam_date, createdAt: u.created_at });
  function startSession(res, userId) {
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sid, userId, now() + SESSION_MS);
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
  function auth(req, res, next) {
    const sid = cookieOf(req).sid;
    const row = sid && db.prepare('SELECT u.* , s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(sid);
    if (!row || row.expires_at < now()) return res.status(401).json({ error: 'Please sign in' });
    if (row.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended. Contact the administrator.', code: 'SUSPENDED' });
    if (!row.last_seen || now() - row.last_seen > 60000 || row.last_ip !== req.ip) db.prepare('UPDATE users SET last_seen=?, last_ip=? WHERE id=?').run(now(), req.ip || null, row.id);
    req.user = row; req.sid = sid; next();
  }
  if (process.env.MOCKDESK_TRUST_PROXY) app.set('trust proxy', 1); // set when a proxy such as Caddy or Nginx sits in front
  const api = express.Router();
  const attempts = new Map(); // simple in-memory rate limit for auth
  const limited = (req, res) => {
    const k = req.ip; const t = now(); const a = (attempts.get(k) || []).filter((x) => t - x < 60000);
    a.push(t); attempts.set(k, a);
    if (a.length > 30) { res.status(429).json({ error: 'Too many attempts, try again in a minute' }); return true; }
    return false;
  };

  api.post('/auth/register', (req, res) => {
    if (limited(req, res)) return;
    const { name, email, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter a valid email' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const mail = email.trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(mail)) return res.status(409).json({ error: 'An account with this email already exists' });
    const salt = crypto.randomBytes(16).toString('hex');
    const r = db.prepare('INSERT INTO users(name,email,salt,hash,created_at) VALUES (?,?,?,?,?)').run(String(name).trim().slice(0, 80), mail, salt, hashPw(password, salt), iso(now()));
    features.applyReferral(Number(r.lastInsertRowid), req.body?.ref);
    promote(); startSession(res, Number(r.lastInsertRowid));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid)) });
  });
  api.post('/auth/login', (req, res) => {
    if (limited(req, res)) return;
    const { email, password } = req.body || {};
    promote();
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
    if (!u) return res.status(404).json({ error: 'No account found with this email. Create an account first.', code: 'NO_ACCOUNT' });
    const ok = u && u.hash && crypto.timingSafeEqual(Buffer.from(hashPw(String(password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
    if (u.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended. Contact the administrator.', code: 'SUSPENDED' });
    startSession(res, u.id);
    res.json({ user: publicUser(u) });
  });
  // ---- one-time-password sign-in (email or mobile). Signing in with a new email/number creates the account. ----
  api.post('/auth/otp/request', async (req, res) => {
    if (limited(req, res)) return;
    const channel = req.body?.channel === 'sms' ? 'sms' : req.body?.channel === 'email' ? 'email' : null;
    if (!channel) return res.status(400).json({ error: 'Choose email or mobile' });
    const id = channel === 'email' ? normEmail(req.body.identifier) : normPhone(req.body.identifier);
    if (!id) return res.status(400).json({ error: channel === 'email' ? 'Enter a valid email' : 'Enter a valid mobile number' });
    const key = `${channel}:${id}`, t = now(); const row = db.prepare('SELECT * FROM otps WHERE key=?').get(key);
    if (row && t - row.sent_at < OTP_COOLDOWN_MS) return res.status(429).json({ error: `Please wait ${Math.ceil((OTP_COOLDOWN_MS - (t - row.sent_at)) / 1000)} s before asking for another code`, code: 'COOLDOWN', retryIn: Math.ceil((OTP_COOLDOWN_MS - (t - row.sent_at)) / 1000) });
    const fresh = !row || t - row.window_start > 3600000; const count = fresh ? 0 : row.sent_count;
    if (count >= OTP_MAX_PER_HOUR) return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.', code: 'HOURLY' });
    const code = newCode(), salt = crypto.randomBytes(16).toString('hex');
    try { await otpSender({ channel, to: id, code }); }
    catch (e) { console.error('OTP delivery failed:', e.message); recordError('otp', e.message); return res.status(e.code === 'OTP_NOT_CONFIGURED' ? 503 : 502).json({ error: e.code === 'OTP_NOT_CONFIGURED' ? 'Code delivery is not set up on this server' : 'Could not send the code. Try again shortly.' }); }
    db.prepare('INSERT OR REPLACE INTO otps(key,salt,code_hash,expires_at,wrong,sent_at,window_start,sent_count) VALUES (?,?,?,?,0,?,?,?)').run(key, salt, hashCode(code, salt), t + OTP_TTL_MS, t, fresh ? t : row.window_start, count + 1);
    const exists = !!db.prepare(`SELECT 1 FROM users WHERE ${channel === 'email' ? 'email' : 'phone'}=?`).get(id);
    res.json({ ok: true, exists, channel, to: maskId(channel, id), resendIn: OTP_COOLDOWN_MS / 1000, expiresIn: OTP_TTL_MS / 1000 });
  });
  api.post('/auth/otp/verify', (req, res) => {
    if (limited(req, res)) return;
    const channel = req.body?.channel === 'sms' ? 'sms' : req.body?.channel === 'email' ? 'email' : null;
    const id = channel === 'email' ? normEmail(req.body?.identifier) : channel ? normPhone(req.body?.identifier) : null;
    const code = String(req.body?.code || '').trim();
    if (!id || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code' });
    const key = `${channel}:${id}`, row = db.prepare('SELECT * FROM otps WHERE key=?').get(key);
    if (!row || row.expires_at < now()) { if (row) db.prepare('DELETE FROM otps WHERE key=?').run(key); return res.status(400).json({ error: 'This code has expired. Ask for a new one.', code: 'EXPIRED' }); }
    if (!codeMatches(code, row.salt, row.code_hash)) {
      if (row.wrong + 1 >= OTP_MAX_WRONG) { db.prepare('DELETE FROM otps WHERE key=?').run(key); return res.status(429).json({ error: 'Too many wrong codes. Ask for a new one.', code: 'LOCKED' }); }
      db.prepare('UPDATE otps SET wrong=wrong+1 WHERE key=?').run(key);
      return res.status(401).json({ error: `Incorrect code. ${OTP_MAX_WRONG - row.wrong - 1} tries left.` });
    }
    const col = channel === 'email' ? 'email' : 'phone';
    let u = db.prepare(`SELECT * FROM users WHERE ${col}=?`).get(id), isNew = false;
    const given = String(req.body?.name || '').trim().slice(0, 80);
    if (!u && !given) return res.status(400).json({ error: 'No account exists for this yet. Enter your name to create one, or go to Sign up.', code: 'NAME_REQUIRED' });
    db.prepare('UPDATE otps SET code_hash=?, expires_at=0 WHERE key=?').run('', key); // single use
    if (!u) {
      const name = given;
      const r = db.prepare(`INSERT INTO users(name,${col},created_at) VALUES (?,?,?)`).run(name || 'Student', id, iso(now()));
      u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid); isNew = true; features.applyReferral(u.id, req.body?.ref);
    }
    if (u.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended. Contact the administrator.', code: 'SUSPENDED' });
    promote(); u = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
    startSession(res, u.id);
    res.json({ user: publicUser(u), isNew });
  });
  api.post('/auth/logout', (req, res) => {
    const sid = cookieOf(req).sid; if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true });
  });
  api.get('/config', (req, res) => res.json({
    exam: examConfig.exam,
    sections: examConfig.sections,
    scoredMarks: Object.values(examConfig.sections).filter((x) => !x.qualifying).reduce((a, x) => a + x.questions * x.marksPerQuestion, 0),
    segments: examConfig.segments,
    instructions: INSTRUCTIONS,
    lowTimeWarningSeconds: examConfig.lowTimeWarningSeconds,
    autosaveMs: examConfig.autosaveMs,
    statuses: examConfig.statuses,
  }));

  api.get('/health', (req, res) => res.json({ ok: true, exam: examConfig.exam.id, mocks: db.prepare("SELECT id FROM mocks WHERE status='published'").all().filter((r) => getMock(r.id)).length }));

  // Public: what the landing page shows to visitors who have not signed in. Nothing personal; cached for a minute.
  let pubCache = { at: 0, body: null };
  api.get('/public/overview', (req, res) => {
    if (!pubCache.body || Date.now() - pubCache.at > 60000) {
      const mocks = [];
      for (const row of db.prepare("SELECT id FROM mocks WHERE status='published' AND (available_from IS NULL OR available_from<=?) ORDER BY number, created_at").all(now())) {
        const m = getMock(row.id); if (!m) continue;
        const t = totals(m);
        mocks.push({ id: m.meta.id, number: m.meta.number, name: m.meta.name, difficulty: m.meta.difficulty, description: m.meta.description, questions: t.q, marks: t.marks, minutes: t.min });
      }
      const sections = Object.entries(examConfig.sections).map(([key, s]) => ({ key, name: s.name, short: s.short, questions: s.questions, qualifying: !!s.qualifying, qualifyingMarks: s.qualifyingMarks || null, marks: s.marksPerQuestion, negative: s.negativeMarks }));
      const segments = examConfig.segments.map((s) => ({ sections: s.sections, minutes: s.minutes }));
      pubCache = { at: Date.now(), body: { exam: examConfig.exam.name, mocks, sections, segments, totals: { mocks: mocks.length, questions: mocks.reduce((a, x) => a + x.questions, 0) } } };
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(pubCache.body);
  });

  api.get('/unsubscribe', (req, res) => {
    const uid = Number(req.query.u);
    if (!uid || !notifier.tokenOk(uid, req.query.t)) return res.status(400).type('html').send('<p>This link is not valid.</p>');
    const u = db.prepare('SELECT notify_prefs FROM users WHERE id=?').get(uid); let p = {}; try { p = JSON.parse(u?.notify_prefs || '{}'); } catch { /* defaults */ }
    p.email = false; db.prepare('UPDATE users SET notify_prefs=? WHERE id=?').run(JSON.stringify(p), uid);
    res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>You are unsubscribed</h1><p>We will not email you reminders any more. You can switch them back on in your profile.</p><p><a href="/">Back to MockDesk</a></p>');
  });
  api.use(auth);
  api.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));
  api.patch('/me', (req, res) => {
    const { name, targetScore, examDate } = req.body || {};
    const u = req.user;
    const n = name !== undefined ? String(name).trim().slice(0, 80) : u.name;
    if (!n) return res.status(400).json({ error: 'Name cannot be empty' });
    const t = targetScore === undefined ? u.target_score : targetScore === null || targetScore === '' ? null : Number(targetScore);
    if (t !== null && (!Number.isFinite(t) || t < 0 || t > 1000)) return res.status(400).json({ error: 'Invalid target score' });
    const d = examDate === undefined ? u.exam_date : examDate || null;
    if (d && Number.isNaN(Date.parse(d))) return res.status(400).json({ error: 'Invalid exam date' });
    db.prepare('UPDATE users SET name=?, target_score=?, exam_date=? WHERE id=?').run(n, t, d, u.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)) });
  });

  // ---------- attempts: lifecycle ----------
  const loadAttempt = (id, userId) => {
    const a = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(id, userId);
    return a || null;
  };
  /** Advance segments whose time is over; finalise when the last one lapses. Mutates DB. */
  function expire(a) {
    if (a.status !== 'in_progress') return a;
    const m = mockOf(a);
    let changed = false;
    while (a.status === 'in_progress') {
      const end = a.segment_started_at + m.segments[a.segment_index].minutes * 60000 * SCALE;
      if (now() <= end + GRACE_MS) break;
      changed = true;
      if (a.segment_index + 1 >= m.segments.length) { finalise(a, m, end, true); break; }
      a.segment_index += 1; a.segment_started_at = end;
    }
    if (changed && a.status === 'in_progress') db.prepare('UPDATE attempts SET segment_index=?, segment_started_at=? WHERE id=?').run(a.segment_index, a.segment_started_at, a.id);
    return a;
  }
  function finalise(a, m, atMs, auto) {
    const submittedAt = Math.min(atMs ?? now(), now());
    const responses = JSON.parse(a.responses || '{}');
    const result = buildResult({
      attempt: { id: a.id, mockId: a.mock_id, mockName: m.meta.name, difficulty: m.meta.difficulty, startedAt: iso(a.started_at), submittedAt: iso(submittedAt), autoSubmitted: auto },
      questions: m.questions, responses, sectionsCfg: m.sectionsCfg || examConfig.sections,
    });
    db.prepare("UPDATE attempts SET status='submitted', submitted_at=?, auto_submitted=?, result=? WHERE id=?").run(submittedAt, auto ? 1 : 0, JSON.stringify(result), a.id);
    a.status = 'submitted'; a.submitted_at = submittedAt;
    try { features.onSubmitted(a, result); } catch (e) { recordError('referral', e.message); }
  }
  const cleanResp = (r) => ({
    selected: Number.isInteger(r?.selected) && r.selected >= 0 && r.selected < examConfig.optionsPerQuestion ? r.selected : null,
    marked: !!r?.marked, visited: !!r?.visited, timeMs: Math.max(0, Math.min(Number(r?.timeMs) || 0, 4 * 3600 * 1000)),
  });
  /** merge client responses for the open segment only */
  function mergeResponses(a, m, incoming, lastQid) {
    if (!incoming || typeof incoming !== 'object') return;
    const open = new Set(segQuestions(m, a.segment_index).map((q) => q.id));
    const cur = JSON.parse(a.responses || '{}');
    for (const [qid, r] of Object.entries(incoming)) {
      if (!open.has(qid)) continue;
      const c = cleanResp(r);
      // never let a lower time overwrite a higher one (out-of-order saves)
      c.timeMs = Math.max(c.timeMs, cur[qid]?.timeMs || 0);
      cur[qid] = c;
    }
    a.responses = JSON.stringify(cur);
    if (lastQid && open.has(lastQid)) a.last_qid = lastQid;
    db.prepare('UPDATE attempts SET responses=?, last_qid=? WHERE id=?').run(a.responses, a.last_qid || null, a.id);
  }
  const publicQ = (q) => ({ id: q.id, section: q.section, index: q.index, text: q.text, options: q.options, passage: q.passage, passageId: q.passageId, table: q.table || null, figure: q.figure || null, optionFigures: q.optionFigures || null, image: q.image || null, optionImages: q.optionImages || null, marks: q.marks, negativeMarks: q.negativeMarks });
  function stateOf(a) {
    const m = mockOf(a);
    const end = a.segment_started_at + m.segments[a.segment_index].minutes * 60000 * SCALE;
    const responses = JSON.parse(a.responses || '{}');
    const open = segQuestions(m, a.segment_index);
    return {
      id: a.id, mockId: a.mock_id, mockName: m.meta.name, difficulty: m.meta.difficulty, segmentIndex: a.segment_index,
      segments: m.segments.map((s, i) => ({ id: s.id, sections: s.sections, minutes: s.minutes, state: i < a.segment_index ? 'locked' : i === a.segment_index ? 'open' : 'upcoming' })),
      segmentEndsAt: iso(end), serverNow: iso(now()),
      questions: open.map(publicQ),
      responses: Object.fromEntries(open.map((q) => [q.id, responses[q.id] || { selected: null, marked: false, visited: false, timeMs: 0 }])),
      lastQid: a.last_qid && open.some((q) => q.id === a.last_qid) ? a.last_qid : open[0]?.id,
    };
  }

  // Admin accounts are separate from student accounts: they only use /api/admin.
  api.use(['/mocks', '/attempts', '/stats', '/questions', '/practice', '/referral', '/batches', '/my', '/inbox', '/push', '/announcements', '/notifications'], (req, res, next) => (['admin', 'editor', 'teacher'].includes(req.user?.role) ? res.status(403).json({ error: 'This account uses its own console, not the student area', code: 'ADMIN_ONLY' }) : next()));
  features.mount(api); features.mountTeacher(api);
  api.get('/mocks', (req, res) => {
    const rows = db.prepare('SELECT * FROM attempts WHERE user_id=? ORDER BY started_at DESC').all(req.user.id);
    for (const r of rows) if (r.status === 'in_progress' && mockOf(r)) expire(r);
    const out = [];
    const now_ = now();
    for (const row of db.prepare("SELECT * FROM mocks WHERE id!='practice' AND ((status='published' AND (available_from IS NULL OR available_from<=? OR ref_locked=1)) OR id IN (SELECT mock_id FROM attempts WHERE user_id=? AND status='in_progress')) ORDER BY number, created_at").all(now_, req.user.id)) {
      const m = getMock(row.id); if (!m) continue; const meta = m.meta;
      const access = features.accessOf(row, req.user.id, now_);
      const hasProg = rows.some((r) => r.mock_id === row.id && r.status === 'in_progress');
      if (access === 'hidden' && !hasProg) continue;
      const mine = rows.filter((r) => r.mock_id === meta.id);
      const prog = mine.find((r) => r.status === 'in_progress');
      const done = mine.filter((r) => r.status === 'submitted').map((r) => ({ r, res: readResult(r).summary }));
      const best = done.reduce((b, d) => (!b || d.res.score > b.score ? { score: d.res.score, percentage: d.res.percentage } : b), null);
      const lastD = done[0];
      const t = totals(m);
      out.push({
        id: meta.id, number: meta.number, name: meta.name, difficulty: meta.difficulty, description: meta.description, tags: meta.tags || [],
        totalQuestions: t.q, totalMarks: t.marks, totalMinutes: t.min,
        qualifying: m.segments.flatMap((x) => x.sections).filter(isQual).map((k) => ({ key: k, questions: m.questions.filter((q) => q.section === k).length, maxMarks: m.questions.filter((q) => q.section === k).reduce((a, q) => a + q.marks, 0), qualifyingMarks: m.sectionsCfg[k].qualifyingMarks })),
        sections: m.segments.flatMap((s) => s.sections).map((k) => ({ key: k, questions: m.questions.filter((q) => q.section === k).length })),
        status: prog ? 'in_progress' : done.length ? 'completed' : 'not_attempted',
        inProgressAttemptId: prog?.id || null, attempts: done.length, best,
        last: lastD ? { attemptId: lastD.r.id, score: lastD.res.score, percentage: lastD.res.percentage, submittedAt: iso(lastD.r.submitted_at) } : null,
        complete: m.complete, locked: access === 'locked' && !hasProg,
      });
    }
    res.json({ mocks: out });
  });

  api.post('/mocks/:mockId/start', (req, res) => {
    const m = getMock(req.params.mockId);
    const row = db.prepare('SELECT * FROM mocks WHERE id=?').get(req.params.mockId);
    const avail = m && row && row.id !== 'practice' && (m.meta.status === 'published');
    if (!m || !avail) return res.status(404).json({ error: 'Mock not found or not available yet' });
    const acc = features.accessOf(row, req.user.id, now());
    const resuming = db.prepare("SELECT 1 FROM attempts WHERE user_id=? AND mock_id=? AND status='in_progress'").get(req.user.id, row.id);
    if (acc === 'hidden' && !resuming) return res.status(404).json({ error: 'Mock not found or not available yet' });
    if (acc === 'locked' && !resuming) return res.status(403).json({ error: 'Invite a friend to unlock this mock early, or wait for its release date.', code: 'LOCKED' });
    let a = db.prepare("SELECT * FROM attempts WHERE user_id=? AND mock_id=? AND status='in_progress'").get(req.user.id, m.meta.id);
    if (a) { expire(a); if (a.status === 'in_progress') return res.json({ attemptId: a.id, resumed: true }); }
    const id = crypto.randomUUID(); const t = now();
    const snapshot = JSON.stringify({ meta: m.meta, questions: m.questions, segments: m.segments, sectionsCfg: m.sectionsCfg, complete: m.complete });
    db.prepare("INSERT INTO attempts(id,user_id,mock_id,status,segment_index,segment_started_at,started_at,snapshot,ip) VALUES (?,?,?,'in_progress',0,?,?,?,?)").run(id, req.user.id, m.meta.id, t, t, snapshot, req.ip || null);
    res.json({ attemptId: id, resumed: false });
  });

  api.get('/attempts/:id', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    expire(a);
    if (a.status !== 'in_progress') return res.json({ status: 'submitted' });
    res.json({ status: 'in_progress', attempt: stateOf(a) });
  });

  api.put('/attempts/:id/responses', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    if (a.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already submitted', code: 'SUBMITTED' });
    const m = mockOf(a);
    // late saves inside the grace window still count
    const end = a.segment_started_at + m.segments[a.segment_index].minutes * 60000 * SCALE;
    if (now() > end + GRACE_MS) { expire(a); return res.status(409).json({ error: 'This section has ended', code: 'SEGMENT_EXPIRED' }); }
    mergeResponses(a, m, req.body?.responses, req.body?.lastQid);
    res.json({ ok: true, serverNow: iso(now()) });
  });

  // The exam page reports how often the student left the test (counts only go up). Shown to admins under Integrity.
  api.post('/attempts/:id/integrity', (req, res) => {
    const a = db.prepare("SELECT id, integrity FROM attempts WHERE id=? AND user_id=? AND status='in_progress'").get(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    let cur = {}; try { cur = JSON.parse(a.integrity || '{}'); } catch { /* start fresh */ }
    const n = (v) => Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
    const next = { leaves: Math.max(n(cur.leaves), n(req.body?.leaves)), fsExits: Math.max(n(cur.fsExits), n(req.body?.fsExits)), lastAt: now() };
    db.prepare('UPDATE attempts SET integrity=? WHERE id=?').run(JSON.stringify(next), a.id);
    res.json({ ok: true });
  });
  api.post('/attempts/:id/segment/submit', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    if (a.status !== 'in_progress') return res.json({ status: 'submitted' });
    const m = mockOf(a);
    const end = a.segment_started_at + m.segments[a.segment_index].minutes * 60000 * SCALE;
    if (now() <= end + GRACE_MS) mergeResponses(a, m, req.body?.responses, req.body?.lastQid);
    if (a.segment_index + 1 >= m.segments.length) { finalise(a, m, now(), now() > end + GRACE_MS); return res.json({ status: 'submitted' }); }
    a.segment_index += 1; a.segment_started_at = now();
    db.prepare('UPDATE attempts SET segment_index=?, segment_started_at=? WHERE id=?').run(a.segment_index, a.segment_started_at, a.id);
    expire(a);
    if (a.status !== 'in_progress') return res.json({ status: 'submitted' });
    res.json({ status: 'in_progress', attempt: stateOf(a) });
  });

  api.post('/attempts/:id/submit', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    if (a.status === 'in_progress') {
      const m = mockOf(a);
      const end = a.segment_started_at + m.segments[a.segment_index].minutes * 60000 * SCALE;
      if (now() <= end + GRACE_MS) mergeResponses(a, m, req.body?.responses, req.body?.lastQid);
      finalise(a, m, now(), false);
    }
    res.json({ status: 'submitted' });
  });

  // ---------- results & history ----------
  api.get('/attempts/:id/result', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    expire(a);
    if (a.status !== 'submitted') return res.status(409).json({ error: 'Attempt not submitted yet' });
    const result = readResult(a);
    // How this attempt compares with the user's earlier work and with other MockDesk users (aggregate only, no names).
    const mine = db.prepare("SELECT id, mock_id, submitted_at, result FROM attempts WHERE user_id=? AND status='submitted' AND mock_id!='practice' AND submitted_at<? ORDER BY submitted_at DESC").all(req.user.id, a.submitted_at ?? Infinity);
    const brief = (r) => { const x = readResult(r).summary; return { attemptId: r.id, score: x.score, percentage: x.percentage, accuracy: x.accuracy, timeTakenSec: x.timeTakenSec }; };
    const isPractice = a.mock_id === 'practice';
    const prev = !isPractice && mine[0] ? { ...brief(mine[0]), mockName: mockName(mine[0].mock_id) } : null;
    const prevSame = isPractice ? null : mine.find((r) => r.mock_id === a.mock_id);
    const best = new Map();
    for (const r of db.prepare("SELECT user_id, result FROM attempts WHERE mock_id=? AND status='submitted'").all(a.mock_id)) { const sc = readResult(r).summary.score; if (!(best.get(r.user_id) >= sc)) best.set(r.user_id, sc); }
    const MIN_USERS = 10, scores = isPractice ? [] : [...best.values()], my = best.get(req.user.id) ?? result.summary.score;
    const community = isPractice ? { unlocked: false, practice: true, users: 0, needed: MIN_USERS } : scores.length >= MIN_USERS ? {
      unlocked: true, users: scores.length, rank: 1 + scores.filter((x) => x > my).length,
      percentile: Math.round((scores.filter((x) => x < my).length / scores.length) * 1000) / 10,
      avgScore: Math.round((scores.reduce((p, c) => p + c, 0) / scores.length) * 10) / 10, topScore: Math.max(...scores), yourBest: my,
    } : { unlocked: false, users: scores.length, needed: MIN_USERS };
    const plain = plainSummary(result, { prevSame: prevSame ? brief(prevSame) : null, prev, community, target: req.user.target_score });
    res.json({ ...result, compare: { previous: prev, previousSameMock: prevSame ? brief(prevSame) : null }, community, plain, kind: isPractice ? 'practice' : 'mock', doubt: doubtGate(req.user.id, a.mock_id) });
  });
  // ---------- free doubt helper (one question at a time) ----------
  const DOUBT_HOUR = Number(process.env.MOCKDESK_DOUBT_PER_HOUR) || 20; const DOUBT_DAY = Number(process.env.MOCKDESK_DOUBT_PER_DAY) || 80;
  /** Whether this student may use the helper right now, and why not. */
  function doubtGate(userId, mockId) {
    if (process.env.MOCKDESK_DOUBT_CHAT === 'off') return { available: false, reason: 'Doubt help is switched off.' };
    const m = db.prepare('SELECT doubt_chat FROM mocks WHERE id=?').get(mockId);
    if (m && m.doubt_chat === 0) return { available: false, reason: 'Doubt help is switched off for this mock while it is live.' };
    if (db.prepare("SELECT 1 FROM attempts WHERE user_id=? AND status='in_progress' AND started_at>?").get(userId, now() - 6 * 3600000)) return { available: false, reason: 'Doubt help is off while a test is running. Finish your test first.' };
    const t = now(); const h = db.prepare('SELECT COUNT(*) c, MIN(at) o FROM doubts WHERE user_id=? AND at>?').get(userId, t - 3600000); const d = db.prepare('SELECT COUNT(*) c FROM doubts WHERE user_id=? AND at>?').get(userId, t - 86400000).c;
    if (h.c >= DOUBT_HOUR) return { available: false, limited: true, reason: `You have used your ${DOUBT_HOUR} questions for this hour. Try again in ${Math.max(1, Math.ceil((h.o + 3600000 - t) / 60000))} minutes.` };
    if (d >= DOUBT_DAY) return { available: false, limited: true, reason: `You have reached today's limit of ${DOUBT_DAY} questions. Come back tomorrow.` };
    return { available: true, left: Math.min(DOUBT_HOUR - h.c, DOUBT_DAY - d) };
  }
  api.post('/attempts/:id/doubt', (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    expire(a);
    if (a.status !== 'submitted') return res.status(409).json({ error: 'Doubt help opens after you submit this test.', code: 'CHAT_LOCKED' });
    const gate = doubtGate(req.user.id, a.mock_id);
    if (!gate.available) return res.status(gate.limited ? 429 : 423).json({ error: gate.reason, code: gate.limited ? 'CHAT_LIMIT' : 'CHAT_LOCKED' });
    const message = String(req.body?.message || '').trim().slice(0, 300);
    if (!message) return res.status(400).json({ error: 'Type a question first' });
    const q = readResult(a).questions.find((x) => x.id === req.body?.questionId);
    if (!q) return res.status(404).json({ error: 'Question not found in this attempt' });
    const out = answerDoubt(q, message);
    db.prepare('INSERT INTO doubts(user_id, attempt_id, question_id, intent, at) VALUES (?,?,?,?,?)').run(req.user.id, a.id, q.id, out.intent, now());
    res.json({ ...out, left: Math.max(0, (gate.left || 1) - 1) });
  });
  // Downloadable PDF of the result, analysis and solutions. ?scope=all includes every question (default: mistakes only).
  api.get('/attempts/:id/report.pdf', async (req, res) => {
    const a = loadAttempt(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Attempt not found' });
    expire(a);
    if (a.status !== 'submitted') return res.status(409).json({ error: 'Attempt not submitted yet' });
    try {
      const { buildReportPdf } = await import('./lib/pdf.js');
      const result = readResult(a);
      const prevSame = db.prepare("SELECT id, result FROM attempts WHERE user_id=? AND mock_id=? AND status='submitted' AND submitted_at<? ORDER BY submitted_at DESC").get(req.user.id, a.mock_id, a.submitted_at ?? Infinity);
      const brief = (r) => { const x = readResult(r).summary; return { score: x.score, accuracy: x.accuracy, timeTakenSec: x.timeTakenSec }; };
      const doc = buildReportPdf({ user: req.user, result, config: { sections: examConfig.sections, segments: examConfig.segments }, compare: { previousSameMock: prevSame ? brief(prevSame) : null }, community: null, scope: req.query.scope === 'all' ? 'all' : 'mistakes' });
      const safe = String(result.attempt.mockName).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="MockDesk-${safe}-${req.query.scope === 'all' ? 'full-solutions' : 'report'}.pdf"`);
      doc.pipe(res); doc.end();
    } catch (e) { console.error('PDF failed', e); recordError('pdf', e.message); if (!res.headersSent) res.status(500).json({ error: 'Could not create the PDF' }); }
  });
  api.get('/attempts', (req, res) => {
    const rows = db.prepare('SELECT * FROM attempts WHERE user_id=? ORDER BY started_at DESC').all(req.user.id);
    res.json({
      attempts: rows.map((r) => {
        if (r.status === 'in_progress' && mockOf(r)) expire(r);
        const meta = r.mock_id === 'practice' ? { name: (() => { try { return JSON.parse(r.snapshot).meta.name; } catch { return 'Practice set'; } })(), difficulty: 'moderate' } : db.prepare('SELECT name, difficulty FROM mocks WHERE id=?').get(r.mock_id);
        const base = { kind: r.mock_id === 'practice' ? 'practice' : 'mock', id: r.id, mockId: r.mock_id, mockName: meta?.name || r.mock_id, difficulty: meta?.difficulty, status: r.status, startedAt: iso(r.started_at), submittedAt: r.submitted_at ? iso(r.submitted_at) : null };
        if (r.status !== 'submitted') return { ...base, score: null, maxMarks: null, percentage: null, accuracy: null, timeTakenSec: null, sections: [] };
        const s = readResult(r);
        return { ...base, score: s.summary.score, maxMarks: s.summary.maxMarks, percentage: s.summary.percentage, accuracy: s.summary.accuracy, qualified: s.summary.qualified, timeTakenSec: s.summary.timeTakenSec, sections: s.sections.map((x) => ({ key: x.key, score: x.score, maxMarks: x.maxMarks, accuracy: x.accuracy, attempted: x.attempted })) };
      }),
    });
  });
  api.get('/stats', (req, res) => {
    const rows = db.prepare("SELECT * FROM attempts WHERE user_id=? AND status='submitted' AND mock_id!='practice' ORDER BY submitted_at ASC").all(req.user.id);
    const results = rows.map((r) => ({ r, res: readResult(r) }));
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
    const secAgg = {}; const topicAgg = {};
    for (const { res: x } of results) {
      for (const s of x.sections) { const a = (secAgg[s.key] ||= { p: [], acc: [] }); a.p.push(s.maxMarks ? (s.score / s.maxMarks) * 100 : 0); if (s.attempted) a.acc.push(s.accuracy); }
      for (const t of x.topics) { const a = (topicAgg[t.topic + '|' + t.section] ||= { topic: t.topic, section: t.section, total: 0, correct: 0 }); a.total += t.total; a.correct += t.correct; }
    }
    const qualAgg = results.flatMap(({ res: x }) => x.qualifying || []);
    const qualifying = qualAgg.length ? {
      attempts: qualAgg.length, passed: qualAgg.filter((x) => x.qualified).length,
      avgMarks: avg(qualAgg.map((x) => x.score)), bestMarks: Math.max(...qualAgg.map((x) => x.score)),
      maxMarks: qualAgg[0].maxMarks, qualifyingMarks: qualAgg[0].qualifyingMarks,
      trend: results.filter(({ res: x }) => x.qualifying?.length).map(({ res: x }) => ({ mockName: x.attempt.mockName, score: x.qualifying[0].score, qualified: x.qualifying[0].qualified })),
    } : null;
    const sections = Object.keys(secAgg).map((k) => ({ key: k, name: examConfig.sections[k].name, short: examConfig.sections[k].short, avgPercentage: avg(secAgg[k].p), avgAccuracy: avg(secAgg[k].acc), attempts: secAgg[k].p.length }));
    const ranked = [...sections].sort((a, b) => b.avgPercentage - a.avgPercentage);
    const weakTopics = Object.values(topicAgg).filter((t) => t.total >= 2).map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 1000) / 10 })).sort((a, b) => a.accuracy - b.accuracy).slice(0, 8);
    res.json({
      attempted: db.prepare("SELECT COUNT(*) c FROM attempts WHERE user_id=? AND mock_id!='practice'").get(req.user.id).c, completed: results.length,
      bestScore: results.length ? Math.max(...results.map((x) => x.res.summary.score)) : null,
      avgPercentage: avg(results.map((x) => x.res.summary.percentage)), avgAccuracy: avg(results.map((x) => x.res.summary.accuracy)),
      trend: results.map(({ r, res: x }) => ({ attemptId: r.id, mockName: x.attempt.mockName, submittedAt: x.attempt.submittedAt, score: x.summary.score, maxMarks: x.summary.maxMarks, percentage: x.summary.percentage, accuracy: x.summary.accuracy })),
      activity: db.prepare('SELECT started_at FROM attempts WHERE user_id=? AND started_at>=?').all(req.user.id, now() - 100 * 86400000).map((x) => x.started_at),
      sections, qualifying, strongest: ranked.length > 1 ? ranked[0].key : null, weakest: ranked.length > 1 ? ranked.at(-1).key : null, weakTopics,
    });
  });

  // ---------- student-facing extras: announcements and "report a question" ----------
  api.post('/questions/:id/report', (req, res) => {
    const q = db.prepare('SELECT id, mock_id FROM questions WHERE id=?').get(req.params.id);
    const own = db.prepare('SELECT 1 FROM attempts WHERE user_id=? AND status=? AND mock_id=?').get(req.user.id, 'submitted', q?.mock_id);
    if (!q || !own) return res.status(404).json({ error: 'Question not found' });
    const reason = ['wrong_answer', 'unclear', 'typo', 'other'].includes(req.body?.reason) ? req.body.reason : 'other';
    const note = String(req.body?.note || '').trim().slice(0, 600);
    if (db.prepare("SELECT 1 FROM reports WHERE question_id=? AND user_id=? AND status='open'").get(q.id, req.user.id)) return res.json({ ok: true, already: true });
    db.prepare('INSERT INTO reports(question_id,mock_id,user_id,reason,note,created_at) VALUES (?,?,?,?,?,?)').run(q.id, q.mock_id, req.user.id, reason, note, now());
    res.status(201).json({ ok: true });
  });

  // ---------- admin ----------
  api.use('/admin', (req, res, next) => (['admin', 'editor'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Admin access only' })), adminRouter({ db, now, invalidate, getMock, readResult, hashPw, iso, settings, notifier, features, runReminders: (o = {}) => runReminders({ db, notifier, settings, now, ...o }) }));

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);
  app.use('/api', (err, req, res, next) => { console.error(err); recordError('server', `${req.method} ${req.path}: ${err?.message || err}`); res.status(500).json({ error: 'Server error' }); }); // eslint-disable-line

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', setHeaders: (r) => { r.setHeader('X-Content-Type-Options', 'nosniff'); r.setHeader('Content-Security-Policy', "default-src 'none'"); } }));
  const dist = path.join(ROOT, 'dist');
  if (serveClient && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}
