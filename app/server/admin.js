// Admin API. Mounted at /api/admin behind the signed-in + role=admin check in app.js.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import examConfig from '../config/exam.config.js';
import { svgProblem, validateDbMock } from './lib/bank.js';
import { adminsFile, readAdmins } from './lib/admins.js';
import { recentErrors, clearErrors, startedAt, recordError } from './lib/health.js';
import { answerAsk, EXAMPLES } from './lib/ask.js';
import { mountAdminExtras } from './adminExtras.js';
import { Q_FIELDS, newId, loadQuestions, mockRow, parseMock, seedFromFiles } from './lib/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const UPLOAD_DIR = process.env.MOCKDESK_UPLOADS || path.join(ROOT, 'data', 'uploads');
const SECTIONS = Object.keys(examConfig.sections);
const IMG_RE = /^\/uploads\/[\w.-]+\.(png|jpe?g|webp|gif)$/i;
const DAY = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (a) => (a.length ? round1(a.reduce((x, y) => x + y, 0) / a.length) : 0);
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (cols, rows) => [cols.map((c) => csvCell(c[0])).join(','), ...rows.map((r) => cols.map((c) => csvCell(c[1](r))).join(','))].join('\r\n');

/** Validate and normalise a question coming from the editor or an import. Returns { q, errors }. */
export function cleanQuestion(body, { partial = false, strictOptions = false } = {}) {
  const errors = [];
  const str = (v, max = 4000) => (v == null ? '' : String(v).trim().slice(0, max));
  const q = {};
  const section = str(body.section);
  if (!examConfig.sections[section]) errors.push('Choose a section');
  q.text = str(body.text); if (!q.text) errors.push('Question text is required');
  const opts = Array.isArray(body.options) ? body.options.slice(0, examConfig.optionsPerQuestion).map((o) => str(o, 600)) : [];
  while (opts.length < examConfig.optionsPerQuestion) opts.push('');
  q.options = opts;
  q.answer = Number(body.answer); if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= opts.length) errors.push('Pick the correct option');
  q.difficulty = str(body.difficulty) || 'moderate'; if (!examConfig.difficulties.includes(q.difficulty)) errors.push('Difficulty must be easy, moderate or hard');
  q.topic = str(body.topic, 120) || 'General'; q.subtopic = str(body.subtopic, 120);
  q.explanation = str(body.explanation, 6000); q.shortcut = str(body.shortcut, 2000); q.trap = str(body.trap, 2000); q.revise = str(body.revise, 2000); q.approach = str(body.approach, 2000);
  q.steps = Array.isArray(body.steps) ? body.steps.map((x) => str(x, 1000)).filter(Boolean).slice(0, 20) : [];
  q.tags = Array.isArray(body.tags) ? [...new Set(body.tags.map((x) => str(x, 40).toLowerCase()).filter(Boolean))].slice(0, 12) : [];
  const wr = Array.isArray(body.wrongReasons) ? body.wrongReasons.slice(0, opts.length).map((x) => str(x, 600) || null) : [];
  while (wr.length < opts.length) wr.push(null);
  if (Number.isInteger(q.answer)) wr[q.answer] = null;
  q.wrongReasons = wr;
  q.passageId = str(body.passageId, 60) || null; q.passage = str(body.passage, 8000) || null;
  if (q.passage && !q.passageId) q.passageId = 'p_' + crypto.createHash('sha1').update(q.passage).digest('hex').slice(0, 8);
  if (!q.passage) q.passageId = null;
  q.currentAffairs = !!body.currentAffairs;
  for (const k of ['marks', 'negativeMarks']) if (body[k] !== undefined && body[k] !== null && body[k] !== '') { const n = Number(body[k]); if (Number.isFinite(n) && n >= 0 && n <= 10) q[k] = n; }
  const img = (v, label) => { const x = str(v, 200); if (!x) return null; if (!IMG_RE.test(x)) { errors.push(`${label} must be an uploaded image`); return null; } return x; };
  q.image = img(body.image, 'Question image'); q.solutionImage = img(body.solutionImage, 'Solution image');
  q.optionImages = Array.isArray(body.optionImages) && body.optionImages.some(Boolean) ? opts.map((_, i) => img(body.optionImages[i], `Option ${'ABCD'[i]} image`)) : null;
  if (strictOptions && (!Array.isArray(body.optionFigures) || !body.optionFigures.some(Boolean))) { const miss = q.options.map((o, i) => (!o && !q.optionImages?.[i] ? 'ABCD'[i] : null)).filter(Boolean); if (miss.length) errors.push(`Option ${miss.join(', ')} needs text or an image`); }
  if (body.figure) { const e = svgProblem(String(body.figure)); if (e) errors.push(`Figure SVG ${e}`); else q.figure = String(body.figure); }
  if (body.table && Array.isArray(body.table.headers) && Array.isArray(body.table.rows)) q.table = { caption: str(body.table.caption, 200), headers: body.table.headers.map((h) => str(h, 80)).slice(0, 10), rows: body.table.rows.slice(0, 40).map((r) => (Array.isArray(r) ? r.map((c) => str(c, 80)).slice(0, 10) : [])) };
  if (q.table && q.table.rows.some((r) => r.length !== q.table.headers.length)) errors.push('Every table row needs one cell per column');
  if (Array.isArray(body.optionFigures)) { const fs_ = body.optionFigures.map((f) => (f ? String(f) : '')); if (fs_.some(Boolean)) { if (fs_.length !== 4) errors.push('optionFigures needs 4 entries'); else for (const f of fs_) { const e = svgProblem(f); if (e) errors.push(`Option figure ${e}`); } if (!errors.length) q.optionFigures = fs_; } }
  void partial;
  return { section, q, errors };
}

export function adminRouter({ db, now, invalidate, getMock, readResult, hashPw, settings, notifier, features, runReminders }) {
  const r = express.Router();
  // Editors may only work on content: mocks, questions, images, reports and the coverage map. No student data, no settings.
  const EDITOR_OK = [/^\/meta$/, /^\/mocks(\/|$)/, /^\/questions(\/|$)/, /^\/upload$/, /^\/reports(\/|$)/, /^\/search$/, /^\/coverage$/, /^\/quality$/];
  r.use((req, res, next) => {
    if (req.user.role !== 'editor') return next();
    if (EDITOR_OK.some((re) => re.test(req.path)) && !/\/leaderboard$/.test(req.path)) return next();
    return res.status(403).json({ error: 'Editors can only work on mocks, questions and reports', code: 'EDITOR_ONLY' });
  });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const audit = (req, action, target = '', detail = '') => db.prepare('INSERT INTO audit(at,admin_id,admin_name,action,target,detail) VALUES (?,?,?,?,?,?)').run(now(), req.user.id, req.user.name, action, String(target).slice(0, 200), String(detail).slice(0, 500));
  const page = (req, def = 25) => { const size = Math.max(5, Math.min(200, Number(req.query.size) || def)); const p = Math.max(1, Number(req.query.page) || 1); return { size, p, off: (p - 1) * size }; };
  // The question pool is a hidden holding area for questions that are not (yet) in any mock.
  db.prepare("INSERT OR IGNORE INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES ('pool',0,'Question pool','moderate','Questions not yet in a mock','archived','[]','pool',?,?)").run(now(), now());
  const memo = new Map();
  const fp = () => { const x = db.prepare("SELECT COUNT(*) c, COALESCE(MAX(submitted_at),0) m, (SELECT COUNT(*) FROM questions) q FROM attempts WHERE status='submitted'").get(); return `${x.c}:${x.m}:${x.q}`; };
  const cached = (k, ttl, fn) => { const f = fp(); const h = memo.get(k); if (h && h.f === f && now() - h.t < ttl) return h.v; const v = fn(); memo.set(k, { t: now(), v, f }); return v; };
  const bust = () => { memo.clear(); invalidate(); };
  const bad = (res, msg, code = 400, extra = {}) => res.status(code).json({ error: msg, ...extra });

  // ---------- shared aggregates (cached briefly; results are JSON blobs) ----------
  const submittedRows = () => cached('rows', 15000, () => db.prepare("SELECT a.id, a.user_id, a.mock_id, a.started_at, a.submitted_at, a.auto_submitted, a.result FROM attempts a WHERE a.status='submitted' AND a.mock_id!='practice' AND a.result IS NOT NULL").all());
  const results = () => cached('results', 15000, () => submittedRows().map((row) => { try { return { row, res: readResult(row) }; } catch { return null; } }).filter(Boolean));
  const briefs = () => results().map(({ row, res }) => ({ id: row.id, userId: row.user_id, mockId: row.mock_id, score: res.summary.score, max: res.summary.maxMarks, pct: res.summary.percentage, accuracy: res.summary.accuracy, timeSec: res.summary.timeTakenSec, submittedAt: row.submitted_at, startedAt: row.started_at, auto: !!row.auto_submitted, qualified: res.summary.qualified }));
  const questionStats = () => cached('qstats', 15000, () => {
    const m = new Map();
    for (const { res } of results()) for (const q of res.questions) { const s = m.get(q.id) || { n: 0, correct: 0, wrong: 0, skipped: 0, time: 0 }; s.n++; s.time += q.timeSec || 0; if (q.status === 'correct') s.correct++; else if (q.status === 'incorrect') s.wrong++; else s.skipped++; m.set(q.id, s); }
    return m;
  });
  const qStat = (id) => { const s = questionStats().get(id); return s ? { attempts: s.n, pctCorrect: Math.round((s.correct / s.n) * 100), pctWrong: Math.round((s.wrong / s.n) * 100), pctSkipped: Math.round((s.skipped / s.n) * 100), avgTimeSec: Math.round(s.time / s.n) } : { attempts: 0, pctCorrect: null, pctWrong: null, pctSkipped: null, avgTimeSec: null }; };
  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const series = (stamps, days) => { const out = []; const base = new Date(now()); base.setUTCHours(0, 0, 0, 0); const idx = new Map(); for (let i = days - 1; i >= 0; i--) { const k = dayKey(base.getTime() - i * DAY); idx.set(k, out.length); out.push({ day: k, n: 0 }); } for (const t of stamps) { const i = idx.get(dayKey(t)); if (i !== undefined) out[i].n++; } return out; };
  const userRow = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role || 'student', status: u.status || 'active', createdAt: u.created_at, lastSeen: u.last_seen || null, targetScore: u.target_score, examDate: u.exam_date, note: u.admin_note || '' });

  // ---------- overview ----------
  r.get('/overview', (req, res) => {
    const t = now();
    const users = db.prepare("SELECT id, created_at, last_seen FROM users WHERE COALESCE(role,'student')='student'").all();
    const att = db.prepare("SELECT user_id, mock_id, status, started_at FROM attempts WHERE mock_id!='practice'").all();
    const b = briefs();
    const mockRows = db.prepare("SELECT id, name, status FROM mocks WHERE id NOT IN ('pool','practice')").all();
    const popular = mockRows.map((m) => { const mine = b.filter((x) => x.mockId === m.id); return { id: m.id, name: m.name, status: m.status, attempts: att.filter((a) => a.mock_id === m.id).length, completed: mine.length, avgPct: avg(mine.map((x) => x.pct)) }; }).sort((a, c) => c.attempts - a.attempts);
    const qs = questionStats(); const flagged = [];
    for (const [id, s] of qs) if (s.n >= 5 && s.correct / s.n < 0.2) flagged.push({ id, attempts: s.n, pctCorrect: Math.round((s.correct / s.n) * 100) });
    flagged.sort((a, c) => a.pctCorrect - c.pctCorrect);
    const flaggedRows = flagged.slice(0, 6).map((f) => { const row = db.prepare('SELECT mock_id, section, data FROM questions WHERE id=?').get(f.id); return row ? { ...f, mockId: row.mock_id, section: row.section, text: JSON.parse(row.data).text.slice(0, 120) } : null; }).filter(Boolean);
    const dayStart = new Date(t); dayStart.setHours(0, 0, 0, 0); const d0 = dayStart.getTime();
    const inR = (x, a, b2) => x >= a && x < b2;
    const compare = {
      attempts: { today: att.filter((a) => a.started_at >= d0).length, yesterday: att.filter((a) => inR(a.started_at, d0 - DAY, d0)).length },
      signups: { today: users.filter((u) => Date.parse(u.created_at) >= d0).length, yesterday: users.filter((u) => inR(Date.parse(u.created_at), d0 - DAY, d0)).length },
      finished: { today: b.filter((x) => x.submittedAt >= d0).length, yesterday: b.filter((x) => inR(x.submittedAt, d0 - DAY, d0)).length },
    };
    const userMap = new Map(db.prepare("SELECT id, name, email, phone FROM users WHERE COALESCE(role,'student')='student'").all().map((u) => [u.id, u]));
    const best = new Map(); for (const x of b) { if (!userMap.has(x.userId)) continue; const o = best.get(x.userId); if (!o || x.score > o.score) best.set(x.userId, { score: x.score, max: x.max, pct: x.pct, n: 0 }); best.get(x.userId).n = (best.get(x.userId).n || 0) + 1; }
    const topStudents = [...best].sort((a, c) => c[1].score - a[1].score).slice(0, 5).map(([id, v]) => ({ id, name: userMap.get(id).name, score: v.score, max: v.max, pct: v.pct }));
    const hours = Array.from({ length: 24 }, () => 0); for (const a of att) if (t - a.started_at < 14 * DAY) hours[new Date(a.started_at).getHours()]++;
    const inactive7 = users.filter((u) => t - (u.last_seen || Date.parse(u.created_at)) > 7 * DAY).length;
    const neverStarted = users.filter((u) => !att.some((a) => a.user_id === u.id)).length;
    const autoSub = db.prepare('SELECT COUNT(*) c FROM attempts WHERE auto_submitted=1').get().c;
    res.json({
      compare, topStudents, hours, health: { inactive7, neverStarted, autoSubmitted: autoSub, suspended: db.prepare("SELECT COUNT(*) c FROM users WHERE status='suspended'").get().c, questions: db.prepare("SELECT COUNT(*) c FROM questions WHERE mock_id NOT IN ('pool','practice')").get().c, bank: db.prepare("SELECT COUNT(*) c FROM questions").get().c },
      totals: { users: users.length, newToday: users.filter((u) => t - Date.parse(u.created_at) < DAY).length, newWeek: users.filter((u) => t - Date.parse(u.created_at) < 7 * DAY).length, active24h: users.filter((u) => u.last_seen && t - u.last_seen < DAY).length,
        attempts: att.length, completed: b.length, today: att.filter((a) => t - a.started_at < DAY).length, liveNow: att.filter((a) => a.status === 'in_progress' && t - a.started_at < 4 * 3600000).length,
        avgPct: avg(b.map((x) => x.pct)), avgAccuracy: avg(b.map((x) => x.accuracy)), openReports: db.prepare("SELECT COUNT(*) c FROM reports WHERE status='open'").get().c,
        suspended: db.prepare("SELECT COUNT(*) c FROM users WHERE status='suspended'").get().c, mocksPublished: mockRows.filter((m) => m.status === 'published').length, mocksDraft: mockRows.filter((m) => m.status === 'draft').length },
      signups: series(users.map((u) => Date.parse(u.created_at)), 30), attempts: series(att.map((a) => a.started_at), 30), popular, flagged: flaggedRows,
      recent: db.prepare("SELECT a.id, a.status, a.started_at, a.mock_id, u.name, u.email FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.mock_id!='practice' ORDER BY a.started_at DESC LIMIT 8").all().map((x) => ({ ...x, mockName: mockRows.find((m) => m.id === x.mock_id)?.name || x.mock_id })),
    });
  });

  // ---------- users ----------
  function listUsers(req) {
    const q = String(req.query.q || '').trim().toLowerCase();
    const bm = new Map(); for (const x of briefs()) { const o = bm.get(x.userId) || { n: 0, sum: 0, best: 0 }; o.n++; o.sum += x.pct; o.best = Math.max(o.best, x.score); bm.set(x.userId, o); }
    const started = new Map(db.prepare("SELECT user_id, COUNT(*) n, MAX(started_at) last FROM attempts WHERE mock_id!='practice' GROUP BY user_id").all().map((x) => [x.user_id, x]));
    let rows = db.prepare('SELECT * FROM users').all().map((u) => ({ ...userRow(u), started: started.get(u.id)?.n || 0, lastAttempt: started.get(u.id)?.last || null, completed: bm.get(u.id)?.n || 0, avgPct: bm.get(u.id) ? round1(bm.get(u.id).sum / bm.get(u.id).n) : null, best: bm.get(u.id)?.best ?? null }));
    if (q) rows = rows.filter((u) => [u.name, u.email, u.phone].some((x) => x && String(x).toLowerCase().includes(q)));
    if (req.query.role) rows = rows.filter((u) => u.role === req.query.role);
    if (req.query.status) rows = rows.filter((u) => u.status === req.query.status);
    const seg = req.query.segment; const tn = now();
    if (seg === 'never') rows = rows.filter((u) => u.role === 'student' && !u.started);
    if (seg === 'inactive') rows = rows.filter((u) => u.role === 'student' && u.started && tn - (u.lastSeen || Date.parse(u.createdAt)) > 7 * DAY);
    if (seg === 'new') rows = rows.filter((u) => tn - Date.parse(u.createdAt) < 7 * DAY);
    if (seg === 'top') rows = rows.filter((u) => u.avgPct != null && u.avgPct >= 70);
    if (seg === 'struggling') rows = rows.filter((u) => u.avgPct != null && u.avgPct < 35);
    const key = { name: 'name', joined: 'createdAt', attempts: 'completed', avg: 'avgPct', active: 'lastSeen', best: 'best' }[req.query.sort] || 'createdAt';
    const dir = req.query.dir === 'asc' ? 1 : -1;
    rows.sort((a, c) => { const x = a[key] ?? (typeof c[key] === 'string' ? '' : -1), y = c[key] ?? (typeof a[key] === 'string' ? '' : -1); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return rows;
  }
  r.get('/users', (req, res) => { const all = listUsers(req); const { size, off } = page(req); res.json({ total: all.length, users: all.slice(off, off + size) }); });
  r.get('/users.csv', (req, res) => {
    audit(req, 'export_users');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="mockdesk-users.csv"');
    res.send('﻿' + toCsv([['Name', (u) => u.name], ['Email', (u) => u.email], ['Mobile', (u) => u.phone], ['Role', (u) => u.role], ['Status', (u) => u.status], ['Joined', (u) => u.createdAt], ['Last active', (u) => (u.lastSeen ? new Date(u.lastSeen).toISOString() : '')], ['Tests started', (u) => u.started], ['Tests completed', (u) => u.completed], ['Average %', (u) => u.avgPct ?? ''], ['Best score', (u) => u.best ?? '']], listUsers({ query: {} })));
  });
  r.get('/users/:id', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) return bad(res, 'User not found', 404);
    const rows = db.prepare('SELECT * FROM attempts WHERE user_id=? ORDER BY started_at DESC').all(u.id);
    const names = new Map(db.prepare('SELECT id, name FROM mocks').all().map((m) => [m.id, m.name]));
    const secAgg = {}, topicAgg = {}; const attempts = []; const trend = [];
    for (const a of rows) {
      const base = { id: a.id, mockId: a.mock_id, mockName: names.get(a.mock_id) || a.mock_id, status: a.status, startedAt: a.started_at, submittedAt: a.submitted_at };
      if (a.status !== 'submitted' || !a.result) { attempts.push({ ...base, score: null }); continue; }
      const x = readResult(a);
      attempts.push({ ...base, score: x.summary.score, max: x.summary.maxMarks, pct: x.summary.percentage, accuracy: x.summary.accuracy, timeSec: x.summary.timeTakenSec, qualified: x.summary.qualified, auto: !!a.auto_submitted });
      trend.unshift({ mockName: base.mockName, pct: x.summary.percentage, score: x.summary.score });
      for (const s of x.sections) { const o = (secAgg[s.key] ||= { key: s.key, short: s.short, p: [], acc: [] }); o.p.push(s.maxMarks ? (s.score / s.maxMarks) * 100 : 0); if (s.attempted) o.acc.push(s.accuracy); }
      for (const t of x.topics) { const o = (topicAgg[t.topic + '|' + t.section] ||= { topic: t.topic, section: t.section, total: 0, correct: 0 }); o.total += t.total; o.correct += t.correct; }
    }
    const topics = Object.values(topicAgg).filter((t) => t.total >= 3).map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) })).sort((a, c) => a.accuracy - c.accuracy);
    const done = attempts.filter((x) => x.score !== null);
    res.json({
      user: userRow(u), attempts, trend, sections: Object.values(secAgg).map((s) => ({ key: s.key, short: s.short, avgPct: avg(s.p), avgAccuracy: avg(s.acc) })),
      weakTopics: topics.slice(0, 6), strongTopics: topics.slice(-6).reverse(),
      summary: { started: rows.length, completed: done.length, best: done.length ? Math.max(...done.map((x) => x.score)) : null, avgPct: avg(done.map((x) => x.pct)), avgAccuracy: avg(done.map((x) => x.accuracy)) },
      activeSessions: db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id=? AND expires_at>?').get(u.id, now()).c,
    });
  });
  r.patch('/users/:id', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) return bad(res, 'User not found', 404);
    const { name, role, status, confirm, note } = req.body || {};
    if (note !== undefined) { db.prepare('UPDATE users SET admin_note=? WHERE id=?').run(String(note).slice(0, 600), u.id); audit(req, 'user_note', u.email || u.phone); }
    const self = u.id === req.user.id;
    if (name !== undefined) { const n = String(name).trim().slice(0, 80); if (!n) return bad(res, 'Name cannot be empty'); db.prepare('UPDATE users SET name=? WHERE id=?').run(n, u.id); audit(req, 'user_rename', u.email || u.phone, `${u.name} → ${n}`); }
    if (role !== undefined && role !== (u.role || 'student')) {
      if (!['admin', 'editor', 'student', 'teacher'].includes(role)) return bad(res, 'Invalid role');
      if (self) return bad(res, 'You cannot change your own role');
      if (confirm !== (u.email || u.phone)) return bad(res, 'Type the user’s email to confirm a role change', 400, { code: 'CONFIRM' });
      db.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id); audit(req, 'user_role', u.email || u.phone, role);
    }
    if (status !== undefined && status !== (u.status || 'active')) {
      if (!['active', 'suspended'].includes(status)) return bad(res, 'Invalid status');
      if (self) return bad(res, 'You cannot suspend yourself');
      db.prepare('UPDATE users SET status=? WHERE id=?').run(status, u.id);
      if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      audit(req, status === 'suspended' ? 'user_suspend' : 'user_reactivate', u.email || u.phone);
    }
    res.json({ user: userRow(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)) });
  });
  r.post('/users/:id/signout', (req, res) => { const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id); if (!u) return bad(res, 'User not found', 404); const c = db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id).changes; audit(req, 'user_signout', u.email || u.phone, `${c} sessions`); res.json({ ok: true, sessions: Number(c) }); });
  r.post('/users/:id/password', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id); if (!u) return bad(res, 'User not found', 404);
    const pw = String(req.body?.password || ''); if (pw.length < 8) return bad(res, 'Password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex'); db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hashPw(pw, salt), u.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    audit(req, 'user_password_reset', u.email || u.phone); res.json({ ok: true });
  });
  r.delete('/users/:id', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id); if (!u) return bad(res, 'User not found', 404);
    if (u.id === req.user.id) return bad(res, 'You cannot delete your own account');
    if (req.body?.confirm !== (u.email || u.phone)) return bad(res, 'Type the user’s email to confirm deletion', 400, { code: 'CONFIRM' });
    db.exec('BEGIN'); try { for (const t of ['sessions', 'attempts', 'reports']) db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(u.id); db.prepare('DELETE FROM users WHERE id=?').run(u.id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(req, 'user_delete', u.email || u.phone, u.name); bust(); res.json({ ok: true });
  });

  // ---------- attempts ----------
  function listAttempts(req) {
    const q = String(req.query.q || '').trim().toLowerCase();
    const bm = new Map(briefs().map((b) => [b.id, b]));
    const names = new Map(db.prepare('SELECT id, name FROM mocks').all().map((m) => [m.id, m.name]));
    let rows = db.prepare('SELECT a.id, a.user_id, a.mock_id, a.status, a.started_at, a.submitted_at, a.auto_submitted, u.name uname, u.email, u.phone FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.mock_id!=\'practice\'').all().map((a) => { const b = bm.get(a.id); return { id: a.id, userId: a.user_id, user: a.uname, email: a.email || a.phone, mockId: a.mock_id, mockName: names.get(a.mock_id) || a.mock_id, status: a.status, startedAt: a.started_at, submittedAt: a.submitted_at, auto: !!a.auto_submitted, score: b?.score ?? null, max: b?.max ?? null, pct: b?.pct ?? null, accuracy: b?.accuracy ?? null, timeSec: b?.timeSec ?? null, qualified: b?.qualified ?? null }; });
    if (req.query.mock) rows = rows.filter((x) => x.mockId === req.query.mock);
    if (req.query.status) rows = rows.filter((x) => x.status === req.query.status);
    if (q) rows = rows.filter((x) => [x.user, x.email].some((s) => s && String(s).toLowerCase().includes(q)));
    const from = req.query.from ? Date.parse(req.query.from) : null, to = req.query.to ? Date.parse(req.query.to) + DAY : null;
    if (from) rows = rows.filter((x) => x.startedAt >= from); if (to) rows = rows.filter((x) => x.startedAt < to);
    if (req.query.min !== undefined && req.query.min !== '') rows = rows.filter((x) => x.score !== null && x.score >= Number(req.query.min));
    if (req.query.max !== undefined && req.query.max !== '') rows = rows.filter((x) => x.score !== null && x.score <= Number(req.query.max));
    const key = { score: 'score', accuracy: 'accuracy', time: 'timeSec', user: 'user', mock: 'mockName' }[req.query.sort] || 'startedAt'; const dir = req.query.dir === 'asc' ? 1 : -1;
    rows.sort((a, c) => { const x = a[key] ?? (typeof c[key] === 'string' ? '' : -1), y = c[key] ?? (typeof a[key] === 'string' ? '' : -1); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return rows;
  }
  r.get('/attempts', (req, res) => { const all = listAttempts(req); const { size, off } = page(req); res.json({ total: all.length, attempts: all.slice(off, off + size) }); });
  r.get('/attempts.csv', (req, res) => {
    audit(req, 'export_attempts');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="mockdesk-attempts.csv"');
    res.send('﻿' + toCsv([['Student', (x) => x.user], ['Contact', (x) => x.email], ['Mock', (x) => x.mockName], ['Status', (x) => x.status], ['Started', (x) => new Date(x.startedAt).toISOString()], ['Submitted', (x) => (x.submittedAt ? new Date(x.submittedAt).toISOString() : '')], ['Score', (x) => x.score ?? ''], ['Out of', (x) => x.max ?? ''], ['Percent', (x) => x.pct ?? ''], ['Accuracy %', (x) => x.accuracy ?? ''], ['Time (s)', (x) => x.timeSec ?? ''], ['Auto-submitted', (x) => (x.auto ? 'yes' : 'no')]], listAttempts({ query: req.query })));
  });
  r.get('/attempts/:id', (req, res) => {
    const a = db.prepare('SELECT * FROM attempts WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Attempt not found', 404);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(a.user_id);
    const mock = db.prepare('SELECT name FROM mocks WHERE id=?').get(a.mock_id);
    if (a.status !== 'submitted' || !a.result) return res.json({ user: userRow(u), status: a.status, mockName: mock?.name, startedAt: a.started_at, segmentIndex: a.segment_index });
    res.json({ user: userRow(u), status: 'submitted', result: readResult(a), auto: !!a.auto_submitted });
  });
  r.delete('/attempts/:id', (req, res) => { const a = db.prepare('SELECT id FROM attempts WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Attempt not found', 404); db.prepare('DELETE FROM attempts WHERE id=?').run(a.id); audit(req, 'attempt_delete', a.id); bust(); res.json({ ok: true }); });

  // ---------- mocks ----------
  const mockSummary = (m) => {
    const qs = loadQuestions(db, m.id); const v = validateDbMock(m, qs); const b = briefs().filter((x) => x.mockId === m.id);
    const per = Object.fromEntries(SECTIONS.map((k) => [k, qs.filter((q) => q.section === k).length]));
    const diff = { easy: 0, moderate: 0, hard: 0 }; qs.forEach((q) => { diff[q.difficulty] = (diff[q.difficulty] || 0) + 1; });
    return { id: m.id, number: m.number, name: m.name, difficulty: m.difficulty, description: m.description, status: m.status, tags: m.tags, source: m.source, availableFrom: m.available_from, doubtChat: m.doubt_chat !== 0, refLocked: m.ref_locked === 1, updatedAt: m.updated_at, createdAt: m.created_at, questions: qs.length, perSection: per, diff, errors: v.errors.length, warnings: v.warnings.length, attempts: db.prepare('SELECT COUNT(*) c FROM attempts WHERE mock_id=?').get(m.id).c, completed: b.length, avgPct: avg(b.map((x) => x.pct)) };
  };
  const cleanTags = (t) => (Array.isArray(t) ? [...new Set(t.map((x) => String(x).trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 10) : []);
  r.get('/meta', (req, res) => res.json({ sections: examConfig.sections, difficulties: examConfig.difficulties, optionsPerQuestion: examConfig.optionsPerQuestion, topics: [...new Set(db.prepare('SELECT data FROM questions').all().map((x) => JSON.parse(x.data).topic))].sort(), tags: [...new Set(db.prepare('SELECT tags FROM mocks').all().flatMap((x) => JSON.parse(x.tags || '[]')))].sort() }));
  r.get('/mocks', (req, res) => res.json({ mocks: db.prepare("SELECT * FROM mocks WHERE id NOT IN ('pool','practice') ORDER BY number, created_at").all().map(parseMock).map(mockSummary) }));
  r.post('/mocks', (req, res) => {
    const { name, difficulty, description, tags, cloneFrom } = req.body || {};
    const n = String(name || '').trim().slice(0, 80); if (!n) return bad(res, 'Give the mock a name');
    if (!examConfig.difficulties.includes(difficulty)) return bad(res, 'Choose easy, moderate or hard');
    const id = newId('m'); const t = now(); const number = (db.prepare('SELECT MAX(number) n FROM mocks').get().n || 0) + 1;
    db.prepare("INSERT INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,'admin',?,?)").run(id, number, n, difficulty, String(description || '').slice(0, 400), JSON.stringify(cleanTags(tags ?? [difficulty])), t, t);
    if (cloneFrom && mockRow(db, cloneFrom)) copyQuestions(cloneFrom, id, req.user.name);
    audit(req, cloneFrom ? 'mock_clone' : 'mock_create', n, id); bust(); res.status(201).json({ mock: mockSummary(parseMock(mockRow(db, id))) });
  });
  function copyQuestions(from, to, by = 'admin') {
    const ins = db.prepare('INSERT INTO questions(id,mock_id,section,position,data,updated_at,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)');
    for (const q of db.prepare('SELECT section, position, data FROM questions WHERE mock_id=?').all(from)) { const d = JSON.parse(q.data); const keep = Object.fromEntries(Object.entries(d).filter(([k]) => Q_FIELDS.includes(k))); ins.run(newId(), to, q.section, q.position, JSON.stringify(keep), now(), now(), by); }
  }
  r.get('/mocks/:id', (req, res) => {
    const m = parseMock(mockRow(db, req.params.id)); if (!m) return bad(res, 'Mock not found', 404);
    const qs = loadQuestions(db, m.id); const v = validateDbMock(m, qs);
    res.json({ mock: mockSummary(m), questions: qs.map((q) => ({ ...q, ...addedOf(q.id), stat: qStat(q.id) })), validation: { errors: v.errors, warnings: v.warnings } });
  });
  r.patch('/mocks/:id', (req, res) => {
    const m = parseMock(mockRow(db, req.params.id)); if (!m) return bad(res, 'Mock not found', 404);
    const b = req.body || {}; const next = { ...m };
    if (b.name !== undefined) { next.name = String(b.name).trim().slice(0, 80); if (!next.name) return bad(res, 'Name cannot be empty'); }
    if (b.difficulty !== undefined) { if (!examConfig.difficulties.includes(b.difficulty)) return bad(res, 'Invalid difficulty'); next.difficulty = b.difficulty; }
    if (b.description !== undefined) next.description = String(b.description).slice(0, 400);
    if (b.tags !== undefined) next.tags = cleanTags(b.tags);
    if (b.number !== undefined) { const n = Number(b.number); if (!Number.isInteger(n) || n < 1) return bad(res, 'Order number must be a positive whole number'); next.number = n; }
    if (b.doubtChat !== undefined) next.doubt_chat = b.doubtChat ? 1 : 0;
    next.ref_locked = b.refLocked !== undefined ? (b.refLocked ? 1 : 0) : m.ref_locked === 1 ? 1 : 0;
    if (b.availableFrom !== undefined) next.available_from = b.availableFrom ? Date.parse(b.availableFrom) || null : null;
    if (b.status !== undefined && b.status !== m.status) {
      if (!['draft', 'published', 'archived'].includes(b.status)) return bad(res, 'Invalid status');
      if (b.status === 'published') { const v = validateDbMock(next, loadQuestions(db, m.id)); if (v.errors.length) return bad(res, 'Fix these problems before publishing', 422, { errors: v.errors }); }
      next.status = b.status;
    }
    db.prepare('UPDATE mocks SET name=?, difficulty=?, description=?, tags=?, number=?, available_from=?, status=?, doubt_chat=?, ref_locked=?, updated_at=? WHERE id=?').run(next.name, next.difficulty, next.description, JSON.stringify(next.tags), next.number, next.available_from ?? null, next.status, next.doubt_chat === 0 ? 0 : 1, next.ref_locked, now(), m.id);
    if ((next.doubt_chat === 0 ? 0 : 1) !== (m.doubt_chat === 0 ? 0 : 1)) audit(req, next.doubt_chat === 0 ? 'doubt_chat_off' : 'doubt_chat_on', next.name, m.id);
    if (next.status !== m.status) audit(req, `mock_${next.status}`, next.name, m.id); else audit(req, 'mock_edit', next.name, m.id);
    bust(); res.json({ mock: mockSummary(parseMock(mockRow(db, m.id))) });
  });
  r.delete('/mocks/:id', (req, res) => {
    const m = mockRow(db, req.params.id); if (!m) return bad(res, 'Mock not found', 404);
    if (db.prepare('SELECT COUNT(*) c FROM attempts WHERE mock_id=?').get(m.id).c) { db.prepare("UPDATE mocks SET status='archived', updated_at=? WHERE id=?").run(now(), m.id); audit(req, 'mock_archive', m.name, 'has attempts'); bust(); return res.json({ archived: true }); }
    db.prepare('DELETE FROM questions WHERE mock_id=?').run(m.id); db.prepare('DELETE FROM mocks WHERE id=?').run(m.id); audit(req, 'mock_delete', m.name, m.id); bust(); res.json({ deleted: true });
  });
  r.post('/mocks/:id/clone', (req, res) => {
    const m = parseMock(mockRow(db, req.params.id)); if (!m) return bad(res, 'Mock not found', 404);
    const id = newId('m'); const t = now(); const number = (db.prepare('SELECT MAX(number) n FROM mocks').get().n || 0) + 1;
    db.prepare("INSERT INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,'admin',?,?)").run(id, number, `${m.name} (copy)`.slice(0, 80), m.difficulty, m.description, JSON.stringify(m.tags), t, t);
    copyQuestions(m.id, id, req.user.name); audit(req, 'mock_clone', m.name, id); bust(); res.status(201).json({ mock: mockSummary(parseMock(mockRow(db, id))) });
  });
  r.post('/mocks/:id/reimport', (req, res) => { const m = mockRow(db, req.params.id); if (!m || m.source !== 'file') return bad(res, 'Only built-in mocks can be re-imported from files'); seedFromFiles(db, { force: true, only: m.id }); audit(req, 'mock_reimport', m.name); bust(); res.json({ ok: true }); });
  r.get('/mocks/:id/leaderboard', (req, res) => {
    const best = new Map(); for (const b of briefs().filter((x) => x.mockId === req.params.id)) if (!best.has(b.userId) || b.score > best.get(b.userId).score) best.set(b.userId, b);
    const names = new Map(db.prepare('SELECT id, name, email FROM users').all().map((u) => [u.id, u]));
    res.json({ board: [...best.values()].sort((a, c) => c.score - a.score || a.timeSec - c.timeSec).slice(0, 25).map((b, i) => ({ rank: i + 1, userId: b.userId, name: names.get(b.userId)?.name, email: names.get(b.userId)?.email, score: b.score, max: b.max, pct: b.pct, accuracy: b.accuracy, timeSec: b.timeSec, attemptId: b.id })) });
  });

  // ---------- questions ----------
  const addedOf = (id) => { const x = db.prepare('SELECT created_at, created_by, updated_at FROM questions WHERE id=?').get(id) || {}; return { addedAt: x.created_at || x.updated_at || null, addedBy: x.created_by || null, updatedAt: x.updated_at || null }; };
  const qOut = (id) => { const q = loadQuestions(db, db.prepare('SELECT mock_id FROM questions WHERE id=?').get(id).mock_id).find((x) => x.id === id); return { ...q, ...addedOf(id), stat: qStat(id) }; };
  const nextPos = (mockId, section) => (db.prepare('SELECT MAX(position) p FROM questions WHERE mock_id=? AND section=?').get(mockId, section).p ?? -1) + 1;
  const dataOf = (q) => JSON.stringify(Object.fromEntries(Object.entries(q).filter(([k, v]) => Q_FIELDS.includes(k) && v !== undefined)));
  r.post('/mocks/:id/questions', (req, res) => {
    const m = mockRow(db, req.params.id); if (!m) return bad(res, 'Mock not found', 404);
    const { section, q, errors } = cleanQuestion(req.body || {}); if (errors.length) return bad(res, errors[0], 400, { errors });
    const id = newId(); db.prepare('INSERT INTO questions(id,mock_id,section,position,data,updated_at,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id, m.id, section, nextPos(m.id, section), dataOf(q), now(), now(), req.user.name);
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), m.id); audit(req, 'question_add', m.name, id); bust(); res.status(201).json({ question: qOut(id) });
  });
  r.put('/questions/:qid', (req, res) => {
    const row = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.qid); if (!row) return bad(res, 'Question not found', 404);
    const { section, q, errors } = cleanQuestion({ ...req.body, section: req.body?.section || row.section }); if (errors.length) return bad(res, errors[0], 400, { errors });
    const pos = section === row.section ? row.position : nextPos(row.mock_id, section);
    db.prepare('UPDATE questions SET section=?, position=?, data=?, updated_at=? WHERE id=?').run(section, pos, dataOf(q), now(), row.id);
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), row.mock_id); audit(req, 'question_edit', row.mock_id, row.id); bust(); res.json({ question: qOut(row.id) });
  });
  r.delete('/questions/:qid', (req, res) => {
    const row = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.qid); if (!row) return bad(res, 'Question not found', 404);
    db.prepare('DELETE FROM questions WHERE id=?').run(row.id);
    db.prepare('SELECT id FROM questions WHERE mock_id=? AND section=? ORDER BY position').all(row.mock_id, row.section).forEach((x, i) => db.prepare('UPDATE questions SET position=? WHERE id=?').run(i, x.id));
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), row.mock_id); audit(req, 'question_delete', row.mock_id, row.id); bust(); res.json({ ok: true });
  });
  r.post('/mocks/:id/reorder', (req, res) => {
    const { section, ids } = req.body || {}; if (!examConfig.sections[section] || !Array.isArray(ids)) return bad(res, 'Invalid order');
    const have = db.prepare('SELECT id FROM questions WHERE mock_id=? AND section=?').all(req.params.id, section).map((x) => x.id);
    if (have.length !== ids.length || !have.every((x) => ids.includes(x))) return bad(res, 'The list changed, reload and try again', 409);
    ids.forEach((id, i) => db.prepare('UPDATE questions SET position=? WHERE id=?').run(i, id));
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), req.params.id); bust(); res.json({ ok: true });
  });
  r.post('/questions/:qid/copy', (req, res) => {
    const row = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.qid); if (!row) return bad(res, 'Question not found', 404);
    const to = mockRow(db, req.body?.toMock || row.mock_id); if (!to) return bad(res, 'Target mock not found', 404);
    const id = newId(); const d = JSON.parse(row.data); const keep = Object.fromEntries(Object.entries(d).filter(([k]) => Q_FIELDS.includes(k)));
    db.prepare('INSERT INTO questions(id,mock_id,section,position,data,updated_at,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id, to.id, row.section, nextPos(to.id, row.section), JSON.stringify(keep), now(), now(), req.user.name);
    audit(req, 'question_copy', `${row.mock_id} → ${to.id}`, id); bust(); res.status(201).json({ question: qOut(id) });
  });
  const moveInto = (to, row, by = 'admin') => { const keep = nextPos(to.id, row.section); if (row.mock_id === 'pool') { db.prepare('UPDATE questions SET mock_id=?, position=?, updated_at=? WHERE id=?').run(to.id, keep, now(), row.id); return row.id; } const id = newId(); const d = JSON.parse(row.data); const data = JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => Q_FIELDS.includes(k)))); db.prepare('INSERT INTO questions(id,mock_id,section,position,data,updated_at,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id, to.id, row.section, keep, data, now(), now(), by); return id; };
  // Pull questions from the question bank into a mock: pool questions move, questions already in another mock are copied.
  r.post('/mocks/:id/pull', (req, res) => {
    const to = mockRow(db, req.params.id); if (!to || to.id === 'pool') return bad(res, 'Mock not found', 404);
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, 200); if (!ids.length) return bad(res, 'Choose at least one question');
    let n = 0; db.exec('BEGIN'); try { for (const id of ids) { const row = db.prepare('SELECT * FROM questions WHERE id=?').get(id); if (row && row.mock_id !== to.id) { moveInto(to, row, req.user.name); n++; } } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), to.id); audit(req, 'question_pull', to.name, `${n} questions`); bust(); res.json({ added: n });
  });
  // Bulk actions from the question bank.
  r.post('/questions/bulk', (req, res) => {
    const { action, ids: raw, value } = req.body || {}; const ids = (Array.isArray(raw) ? raw : []).slice(0, 300); if (!ids.length) return bad(res, 'Choose at least one question');
    let n = 0; db.exec('BEGIN');
    try {
      for (const id of ids) {
        const row = db.prepare('SELECT * FROM questions WHERE id=?').get(id); if (!row) continue; const d = JSON.parse(row.data);
        if (action === 'delete') { db.prepare('DELETE FROM questions WHERE id=?').run(id); n++; }
        else if (action === 'difficulty' && examConfig.difficulties.includes(value)) { d.difficulty = value; db.prepare('UPDATE questions SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(d), now(), id); n++; }
        else if (action === 'tag' && String(value || '').trim()) { const t = String(value).trim().toLowerCase().slice(0, 30); d.tags = [...new Set([...(d.tags || []), t])].slice(0, 12); db.prepare('UPDATE questions SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(d), now(), id); n++; }
        else if (action === 'untag' && String(value || '').trim()) { d.tags = (d.tags || []).filter((x) => x !== String(value).trim().toLowerCase()); db.prepare('UPDATE questions SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(d), now(), id); n++; }
        else if (action === 'topic' && String(value || '').trim()) { d.topic = String(value).trim().slice(0, 60); db.prepare('UPDATE questions SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(d), now(), id); n++; }
      }
      if (action === 'delete') for (const m of db.prepare('SELECT DISTINCT mock_id, section FROM questions').all()) db.prepare('SELECT id FROM questions WHERE mock_id=? AND section=? ORDER BY position').all(m.mock_id, m.section).forEach((x, i) => db.prepare('UPDATE questions SET position=? WHERE id=?').run(i, x.id));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(req, `question_bulk_${action}`, `${n} questions`, String(value || '')); bust(); res.json({ changed: n });
  });
  r.post('/mocks/:id/import', (req, res) => {
    const m = mockRow(db, req.params.id); if (!m) return bad(res, 'Mock not found', 404);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 500) : []; if (!rows.length) return bad(res, 'No rows to import');
    const problems = [], good = [];
    rows.forEach((raw, i) => { const { section, q, errors } = cleanQuestion(raw, { strictOptions: true }); if (errors.length) problems.push({ row: i + 1, error: errors.join('; ') }); else good.push({ section, q }); });
    if (req.body?.dryRun || (problems.length && !req.body?.skipBad)) return res.json({ added: 0, ready: good.length, problems });
    const ins = db.prepare('INSERT INTO questions(id,mock_id,section,position,data,updated_at,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)');
    db.exec('BEGIN'); try { for (const { section, q } of good) ins.run(newId(), m.id, section, nextPos(m.id, section), dataOf(q), now(), now(), req.user.name); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.prepare('UPDATE mocks SET updated_at=? WHERE id=?').run(now(), m.id); audit(req, 'question_import', m.name, `${good.length} questions`); bust(); res.status(201).json({ added: good.length, problems });
  });
  r.get('/questions', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase(); const mocks = new Map(db.prepare('SELECT id, name, status FROM mocks').all().map((m) => [m.id, m]));
    let rows = db.prepare('SELECT id, mock_id, section, position, data, created_at, created_by, updated_at FROM questions').all().map((x) => { const d = JSON.parse(x.data); return { addedAt: x.created_at || x.updated_at, addedBy: x.created_by || null, id: x.id, mockId: x.mock_id, mockName: x.mock_id === 'pool' ? 'Question pool' : mocks.get(x.mock_id)?.name, mockStatus: x.mock_id === 'pool' ? 'pool' : mocks.get(x.mock_id)?.status, section: x.section, position: x.position, topic: d.topic, subtopic: d.subtopic || '', difficulty: d.difficulty, tags: d.tags || [], text: d.text, hasImage: !!(d.image || d.figure || d.optionImages), ...qStat(x.id) }; });
    if (q) rows = rows.filter((x) => (x.text + ' ' + x.topic + ' ' + x.subtopic + ' ' + x.tags.join(' ')).toLowerCase().includes(q));
    for (const k of ['section', 'difficulty', 'topic']) if (req.query[k]) rows = rows.filter((x) => x[k] === req.query[k]);
    if (req.query.mock) rows = rows.filter((x) => x.mockId === req.query.mock);
    if (req.query.from) rows = rows.filter((x) => x.addedAt >= Date.parse(req.query.from)); if (req.query.to) rows = rows.filter((x) => x.addedAt < Date.parse(req.query.to) + DAY);
    if (req.query.tag) rows = rows.filter((x) => x.tags.includes(req.query.tag));
    if (req.query.flag === 'hard') rows = rows.filter((x) => x.attempts >= 3 && x.pctCorrect <= 30); if (req.query.flag === 'easy') rows = rows.filter((x) => x.attempts >= 3 && x.pctCorrect >= 85); if (req.query.flag === 'slow') rows = rows.filter((x) => x.avgTimeSec >= 75);
    const key = { correct: 'pctCorrect', time: 'avgTimeSec', attempts: 'attempts', topic: 'topic', added: 'addedAt' }[req.query.sort]; const dir = req.query.dir === 'asc' ? 1 : -1;
    if (key) rows.sort((a, c) => { const x = a[key] ?? (typeof c[key] === 'string' ? '' : -1), y = c[key] ?? (typeof a[key] === 'string' ? '' : -1); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    const { size, off } = page(req, 30); res.json({ total: rows.length, questions: rows.slice(off, off + size) });
  });
  r.get('/questions/:qid', (req, res) => { const row = db.prepare('SELECT id FROM questions WHERE id=?').get(req.params.qid); if (!row) return bad(res, 'Question not found', 404); const q = qOut(row.id); res.json({ question: q, mockId: db.prepare('SELECT mock_id FROM questions WHERE id=?').get(row.id).mock_id }); });

  // ---------- image uploads ----------
  const MAGIC = [['png', [0x89, 0x50, 0x4e, 0x47]], ['jpg', [0xff, 0xd8, 0xff]], ['gif', [0x47, 0x49, 0x46, 0x38]], ['webp', null]];
  const sniff = (b) => { if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp'; for (const [ext, sig] of MAGIC) if (sig && sig.every((x, i) => b[i] === x)) return ext; return null; };
  r.post('/upload', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '4mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Send a PNG, JPG, WebP or GIF image (max 4 MB)');
    const ext = sniff(req.body); if (!ext) return bad(res, 'That file is not a valid image');
    const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`; fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
    audit(req, 'upload', name, `${Math.round(req.body.length / 1024)} KB`); res.status(201).json({ url: `/uploads/${name}` });
  });

  // ---------- analytics ----------
  r.get('/analytics', (req, res) => {
    const mock = req.query.mock || ''; const rs = results().filter(({ row }) => !mock || row.mock_id === mock); const b = rs.map(({ row, res: x }) => ({ pct: x.summary.percentage, auto: !!row.auto_submitted }));
    const topics = {}; const secs = {};
    for (const { res: x } of rs) { for (const t of x.topics) { const o = (topics[t.topic + '|' + t.section] ||= { topic: t.topic, section: t.section, total: 0, correct: 0 }); o.total += t.total; o.correct += t.correct; } for (const s of [...x.sections, ...(x.qualifying || [])]) { const o = (secs[s.key] ||= { key: s.key, short: s.short, pct: [], acc: [], time: [] }); o.pct.push(s.maxMarks ? (Math.max(0, s.score) / s.maxMarks) * 100 : 0); if (s.attempted) o.acc.push(s.accuracy); o.time.push(s.timeSec); } }
    const topicList = Object.values(topics).filter((t) => t.total >= 5).map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) })).sort((a, c) => a.accuracy - c.accuracy);
    const hist = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, n: 0 })); for (const x of b) hist[Math.min(9, Math.max(0, Math.floor(x.pct / 10)))].n++;
    const qs = [...questionStats()].filter(([id, s]) => s.n >= 3 && (!mock || id.startsWith(mock + '-') || db.prepare('SELECT 1 FROM questions WHERE id=? AND mock_id=?').get(id, mock))).map(([id, s]) => ({ id, attempts: s.n, pctCorrect: Math.round((s.correct / s.n) * 100), avgTimeSec: Math.round(s.time / s.n) }));
    const decorate = (x) => { const row = db.prepare('SELECT mock_id, section, data FROM questions WHERE id=?').get(x.id); const d = row ? JSON.parse(row.data) : {}; return { ...x, mockId: row?.mock_id, section: row?.section, topic: d.topic, text: (d.text || '').slice(0, 110) }; };
    const users = db.prepare("SELECT id, created_at FROM users WHERE COALESCE(role,'student')='student'").all(); const first = new Set(db.prepare('SELECT DISTINCT user_id FROM attempts').all().map((x) => x.user_id)); const done = new Map(); for (const x of briefs()) done.set(x.userId, (done.get(x.userId) || 0) + 1);
    res.json({
      sample: b.length, avgPct: avg(b.map((x) => x.pct)), autoSubmitted: b.filter((x) => x.auto).length, histogram: hist,
      weakestTopics: topicList.slice(0, 10), strongestTopics: topicList.slice(-10).reverse(), sections: Object.values(secs).map((s) => ({ key: s.key, short: s.short, avgPct: avg(s.pct), avgAccuracy: avg(s.acc), avgTimeSec: Math.round(avg(s.time)) })),
      hardest: qs.sort((a, c) => a.pctCorrect - c.pctCorrect).slice(0, 8).map(decorate), easiest: [...qs].sort((a, c) => c.pctCorrect - a.pctCorrect).slice(0, 8).map(decorate), slowest: [...qs].sort((a, c) => c.avgTimeSec - a.avgTimeSec).slice(0, 8).map(decorate),
      funnel: [{ label: 'Signed up', n: users.length }, { label: 'Started a test', n: users.filter((u) => first.has(u.id)).length }, { label: 'Finished a test', n: users.filter((u) => done.get(u.id) >= 1).length }, { label: 'Finished 3+ tests', n: users.filter((u) => done.get(u.id) >= 3).length }],
      perMock: db.prepare("SELECT id, name FROM mocks WHERE id NOT IN ('pool','practice') ORDER BY number").all().map((m) => { const started = db.prepare('SELECT COUNT(*) c FROM attempts WHERE mock_id=?').get(m.id).c; const fin = briefs().filter((x) => x.mockId === m.id); return { id: m.id, name: m.name, started, finished: fin.length, completion: started ? Math.round((fin.length / started) * 100) : 0 }; }),
      signups: series(users.map((u) => Date.parse(u.created_at)), 60), attemptsDaily: series(db.prepare("SELECT started_at FROM attempts WHERE mock_id!='practice'").all().map((x) => x.started_at), 60),
    });
  });

  // ---------- reports from students ----------
  r.get('/reports', (req, res) => {
    const status = req.query.status || 'open';
    const rows = db.prepare('SELECT r.*, u.name uname, u.email FROM reports r LEFT JOIN users u ON u.id=r.user_id WHERE (?=\'all\' OR r.status=?) ORDER BY r.created_at DESC LIMIT 300').all(status, status);
    res.json({ reports: rows.map((x) => { const q = db.prepare('SELECT section, data FROM questions WHERE id=?').get(x.question_id); const m = db.prepare('SELECT name FROM mocks WHERE id=?').get(x.mock_id); return { id: x.id, questionId: x.question_id, mockId: x.mock_id, mockName: m?.name, section: q?.section, text: q ? JSON.parse(q.data).text.slice(0, 160) : '(question deleted)', reason: x.reason, note: x.note, status: x.status, adminNote: x.admin_note, createdAt: x.created_at, resolvedAt: x.resolved_at, student: req.user.role === 'editor' ? 'Student' : x.uname, email: req.user.role === 'editor' ? null : x.email }; }), open: db.prepare("SELECT COUNT(*) c FROM reports WHERE status='open'").get().c });
  });
  r.patch('/reports/:id', (req, res) => {
    const x = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id); if (!x) return bad(res, 'Report not found', 404);
    const status = ['open', 'resolved', 'dismissed'].includes(req.body?.status) ? req.body.status : x.status;
    db.prepare('UPDATE reports SET status=?, admin_note=?, resolved_at=? WHERE id=?').run(status, req.body?.adminNote !== undefined ? String(req.body.adminNote).slice(0, 400) : x.admin_note, status === 'open' ? null : now(), x.id);
    audit(req, `report_${status}`, x.question_id); res.json({ ok: true });
  });

  // ---------- announcements ----------

  // ---------- global search, live tests, backup ----------
  r.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase(); if (q.length < 2) return res.json({ users: [], mocks: [], questions: [] });
    const has = (...xs) => xs.some((x) => x && String(x).toLowerCase().includes(q));
    const users = req.user.role === 'editor' ? [] : db.prepare('SELECT id, name, email, phone, role FROM users').all().filter((u) => has(u.name, u.email, u.phone)).slice(0, 5);
    const mocks = db.prepare("SELECT id, name, status, difficulty FROM mocks WHERE id NOT IN ('pool','practice')").all().filter((m) => has(m.name, m.id)).slice(0, 5);
    const questions = []; for (const x of db.prepare('SELECT id, mock_id, section, data FROM questions').all()) { const d = JSON.parse(x.data); if (has(d.text, d.topic, (d.tags || []).join(' '))) { questions.push({ id: x.id, mockId: x.mock_id, section: x.section, text: d.text.slice(0, 110), topic: d.topic }); if (questions.length >= 6) break; } }
    res.json({ users, mocks, questions });
  });
  r.get('/live', (req, res) => {
    const t = now(); const names = new Map(db.prepare('SELECT id, name FROM mocks').all().map((m) => [m.id, m.name]));
    const rows = db.prepare("SELECT a.id, a.user_id, a.mock_id, a.started_at, a.segment_index, a.segment_started_at, a.responses, u.name, u.email, u.phone FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.status='in_progress' AND a.started_at > ? ORDER BY a.started_at DESC").all(t - 4 * 3600000);
    const total = examConfig.segments.length; const totalQ = Object.values(examConfig.sections).reduce((a, x) => a + (x.questions || 0), 0);
    const live = rows.map((a) => {
      let answered = 0; try { answered = Object.values(JSON.parse(a.responses || '{}')).filter((x) => x && x.selected != null).length; } catch { /* ignore */ }
      const seg = examConfig.segments[a.segment_index]; const left = seg ? Math.max(0, seg.minutes * 60 - (t - a.segment_started_at) / 1000) : null;
      return { id: a.id, userId: a.user_id, user: a.name, contact: a.email || a.phone, mockId: a.mock_id, mockName: names.get(a.mock_id) || a.mock_id, startedAt: a.started_at, segment: Math.min(a.segment_index + 1, total), segments: total, segmentLabel: seg ? seg.sections.map((x) => examConfig.sections[x].short).join(' + ') : 'Finishing', segmentStartedAt: a.segment_started_at, minutes: seg?.minutes ?? null, answeredSoFar: answered, overtime: seg ? left === 0 : false };
    });
    const dayStart = new Date(t); dayStart.setHours(0, 0, 0, 0); const d0 = dayStart.getTime();
    const todayAtt = db.prepare('SELECT status, started_at FROM attempts WHERE started_at >= ?').all(d0);
    const fin = briefs().filter((x) => x.submittedAt >= d0);
    const hourly = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, n: 0 }));
    for (const a of db.prepare('SELECT started_at FROM attempts WHERE started_at > ?').all(t - DAY)) hourly[new Date(a.started_at).getHours()].n++;
    const um = new Map(db.prepare('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));
    const recent = briefs().filter((x) => um.has(x.userId)).sort((a, c) => (c.submittedAt || 0) - (a.submittedAt || 0)).slice(0, 8).map((x) => ({ id: x.id, userId: x.userId, user: um.get(x.userId), mockName: names.get(x.mockId) || x.mockId, score: x.score, max: x.max, pct: x.pct, qualified: x.qualified, auto: x.auto, submittedAt: x.submittedAt }));
    const byMock = {}; for (const a of live) byMock[a.mockName] = (byMock[a.mockName] || 0) + 1;
    res.json({
      at: t, live, totalQ, recent, hourly,
      today: { started: todayAtt.length, finished: fin.length, avgPct: avg(fin.map((x) => x.pct)), best: fin.length ? Math.max(...fin.map((x) => x.score)) : null },
      byMock: Object.entries(byMock).map(([name, n]) => ({ name, n })).sort((a, c) => c.n - a.n),
      stale: db.prepare("SELECT COUNT(*) c FROM attempts WHERE status='in_progress' AND started_at <= ? AND started_at > ?").get(t - 4 * 3600000, t - DAY).c,
    });
  });
  r.get('/backup', (req, res) => {
    const f = path.join(os.tmpdir(), `mockdesk-backup-${Date.now()}.db`);
    try { db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { return bad(res, 'Could not create a backup: ' + e.message, 500); }
    audit(req, 'backup_download');
    res.download(f, `mockdesk-backup-${new Date(now()).toISOString().slice(0, 10)}.db`, () => fs.rm(f, () => {}));
  });

  // ---------- audit + settings ----------
  r.get('/audit', (req, res) => { const { size, off } = page(req, 40); res.json({ total: db.prepare('SELECT COUNT(*) c FROM audit').get().c, entries: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(size, off).map((e) => ({ id: e.id, at: e.at, admin: e.admin_name, action: e.action, target: e.target, detail: e.detail })) }); });
  r.get('/pattern', (req, res) => res.json({ exam: examConfig.exam, sections: examConfig.sections, segments: examConfig.segments, difficulties: examConfig.difficulties, optionsPerQuestion: examConfig.optionsPerQuestion, admins: db.prepare("SELECT name, email, role FROM users WHERE role IN ('admin','editor') ORDER BY role, name").all(), uploads: fs.readdirSync(UPLOAD_DIR).length, adminsFile: adminsFile(), adminEntries: (({ emails, phones, ignored, editorEmails, editorPhones }) => ({ emails: [...emails], phones: [...phones], ignored, editorEmails: [...editorEmails], editorPhones: [...editorPhones] }))(readAdmins()) }));

  // ---------- integrity: attempts that look unusual ----------
  const LEVEL = { high: 3, medium: 2, low: 1 };
  r.get('/integrity', (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30)); const since = now() - days * DAY; const minLevel = LEVEL[req.query.level] || 2; const showReviewed = req.query.reviewed === '1';
    const names = new Map(db.prepare('SELECT id, name FROM mocks').all().map((m) => [m.id, m.name]));
    const summ = new Map(results().map(({ row, res: rr }) => [row.id, rr.summary]));
    const rows = db.prepare("SELECT a.id, a.user_id, a.mock_id, a.status, a.started_at, a.submitted_at, a.auto_submitted, a.integrity, a.ip, u.name, u.email, u.phone FROM attempts a JOIN users u ON u.id=a.user_id WHERE COALESCE(u.role,'student')='student' AND a.started_at >= ?").all(since);
    const byIp = new Map(); for (const a of rows) if (a.ip) { const m = byIp.get(a.ip) || new Map(); m.set(a.user_id, a.name); byIp.set(a.ip, m); }
    const sharedIps = [...byIp].filter(([, m]) => m.size >= 3).map(([ip, m]) => ({ ip, users: [...m].map(([id, name]) => ({ id, name })) })).sort((a, b) => b.users.length - a.users.length);
    const sharedSet = new Map(sharedIps.map((x) => [x.ip, x.users.length]));
    const out = []; let totalChecked = 0; const count = { high: 0, medium: 0, low: 0 };
    for (const a of rows) {
      totalChecked++;
      let ig = {}; try { ig = JSON.parse(a.integrity || '{}'); } catch { /* none */ }
      const flags = []; const add = (code, level, label) => flags.push({ code, level, label });
      const leaves = ig.leaves || 0, fsExits = ig.fsExits || 0;
      if (leaves >= 10) add('leaves', 'high', `Left the test ${leaves} times`); else if (leaves >= 4) add('leaves', 'medium', `Left the test ${leaves} times`);
      if (fsExits >= 3) add('fullscreen', 'medium', `Exited fullscreen ${fsExits} times`);
      const sm = summ.get(a.id);
      if (sm && a.submitted_at && sm.attempted >= 30) {
        const per = (a.submitted_at - a.started_at) / 1000 / sm.attempted; const acc = sm.attempted ? (sm.correct / sm.attempted) * 100 : 0;
        if (per < 6) add('speed', 'high', `Answered a question every ${Math.max(1, Math.round(per))}s`); else if (per < 10) add('speed', 'medium', `Answered a question every ${Math.round(per)}s`);
        if (acc >= 90 && per < 20) add('accuracy', 'high', `${Math.round(acc)}% accuracy at ${Math.round(per)}s per question`);
      }
      if (a.ip && sharedSet.get(a.ip)) add('ip', 'medium', `Same network address as ${sharedSet.get(a.ip) - 1} other accounts`);
      if (!flags.length) continue;
      const top = Math.max(...flags.map((f) => LEVEL[f.level])); const level = top === 3 ? 'high' : top === 2 ? 'medium' : 'low';
      if (ig.reviewed && !showReviewed) continue;
      count[level]++;
      if (top >= minLevel) out.push({ id: a.id, userId: a.user_id, user: a.name, contact: a.email || a.phone, mockName: names.get(a.mock_id) || a.mock_id, status: a.status, startedAt: a.started_at, submittedAt: a.submitted_at, score: sm?.score ?? null, max: sm?.maxMarks ?? null, pct: sm?.percentage ?? null, leaves, fsExits, ip: a.ip || null, flags, level, reviewed: !!ig.reviewed });
    }
    out.sort((x, y) => LEVEL[y.level] - LEVEL[x.level] || y.flags.length - x.flags.length || (y.startedAt - x.startedAt));
    const { size, off } = page(req, 30);
    res.json({ summary: { ...count, checked: totalChecked, days }, total: out.length, attempts: out.slice(off, off + size), sharedIps: sharedIps.slice(0, 10) });
  });
  r.patch('/integrity/:id', (req, res) => {
    const a = db.prepare('SELECT id, integrity FROM attempts WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Attempt not found', 404);
    let ig = {}; try { ig = JSON.parse(a.integrity || '{}'); } catch { /* none */ }
    ig.reviewed = !!req.body?.reviewed; db.prepare('UPDATE attempts SET integrity=? WHERE id=?').run(JSON.stringify(ig), a.id);
    audit(req, ig.reviewed ? 'integrity_reviewed' : 'integrity_reopened', a.id); res.json({ ok: true });
  });

  // ---------- mock builder: assemble a draft mock from the question bank ----------
  r.post('/mocks/build', (req, res) => {
    const b = req.body || {}; const dry = !!b.dryRun; const includeMocks = b.include === 'all';
    const n = String(b.name || '').trim().slice(0, 80); if (!dry && !n) return bad(res, 'Give the mock a name');
    const difficulty = b.difficulty || 'moderate'; if (!examConfig.difficulties.includes(difficulty)) return bad(res, 'Choose easy, moderate or hard');
    const plan = (Array.isArray(b.plan) ? b.plan : []).filter((p) => SECTIONS.includes(p.section));
    const cnt = (v) => Math.max(0, Math.min(150, Math.floor(Number(v) || 0)));
    const wants = []; for (const p of plan) for (const d of examConfig.difficulties) if (cnt(p[d])) wants.push({ section: p.section, difficulty: d, count: cnt(p[d]) });
    if (!wants.length) return bad(res, 'Say how many questions you want from at least one section');
    if (wants.reduce((a, w) => a + w.count, 0) > 300) return bad(res, 'That is too many questions for one mock');
    const mockNames = new Map(db.prepare("SELECT id, name, status FROM mocks").all().map((m) => [m.id, m]));
    const rows = db.prepare('SELECT id, mock_id, section, position, data FROM questions').all().map((x) => ({ ...x, d: JSON.parse(x.data) }))
      .filter((x) => x.mock_id === 'pool' || (includeMocks && mockNames.get(x.mock_id)?.status !== 'archived'));
    const taken = new Set(); const seenText = new Set(); const picked = []; const shortages = [];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const topicCount = new Map();
    for (const w of wants) {
      let need = w.count;
      for (const tier of ['pool', 'mocks']) {
        if (!need) break;
        const pool = shuffle(rows.filter((x) => (tier === 'pool' ? x.mock_id === 'pool' : x.mock_id !== 'pool') && x.section === w.section && (x.d.difficulty || 'moderate') === w.difficulty && !taken.has(x.id) && !seenText.has(x.d.text)));
        while (need && pool.length) {
          let bi = 0, bc = Infinity; for (let i = 0; i < pool.length; i++) { const c = topicCount.get(w.section + '|' + pool[i].d.topic) || 0; if (c < bc) { bc = c; bi = i; } }
          const x = pool.splice(bi, 1)[0]; if (taken.has(x.id) || seenText.has(x.d.text)) continue;
          taken.add(x.id); seenText.add(x.d.text); topicCount.set(w.section + '|' + x.d.topic, (topicCount.get(w.section + '|' + x.d.topic) || 0) + 1); picked.push(x); need--;
        }
      }
      if (need) shortages.push({ section: w.section, difficulty: w.difficulty, wanted: w.count, found: w.count - need });
    }
    const preview = picked.map((x) => ({ id: x.id, section: x.section, difficulty: x.d.difficulty || 'moderate', topic: x.d.topic, text: String(x.d.text).slice(0, 110), from: x.mock_id === 'pool' ? 'Question bank' : mockNames.get(x.mock_id)?.name || x.mock_id }));
    const summary = { wanted: wants.reduce((a, w) => a + w.count, 0), picked: picked.length, topics: topicCount.size, fromBank: picked.filter((x) => x.mock_id === 'pool').length, fromMocks: picked.filter((x) => x.mock_id !== 'pool').length };
    if (dry) return res.json({ summary, shortages, preview });
    if (shortages.length && !b.allowPartial) return bad(res, 'The bank does not have enough questions for this plan', 409, { code: 'SHORT', summary, shortages });
    if (!picked.length) return bad(res, 'No questions matched the plan');
    const id = newId('m'); const t = now(); const number = (db.prepare('SELECT MAX(number) n FROM mocks').get().n || 0) + 1;
    db.exec('BEGIN'); try {
      db.prepare("INSERT INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,'admin',?,?)").run(id, number, n, difficulty, String(b.description || '').slice(0, 400), JSON.stringify(cleanTags([difficulty, 'built'])), t, t);
      const to = mockRow(db, id); for (const x of picked) moveInto(to, db.prepare('SELECT * FROM questions WHERE id=?').get(x.id), req.user.name);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(req, 'mock_build', n, `${picked.length} questions`); bust(); res.status(201).json({ mock: mockSummary(parseMock(mockRow(db, id))), summary, shortages });
  });

  // ---------- coverage: how well do the questions cover the syllabus? ----------
  r.get('/coverage', (req, res) => {
    const mocks = new Map(db.prepare("SELECT id, name, status FROM mocks").all().map((m) => [m.id, m]));
    const live = [...mocks.values()].filter((m) => m.id !== 'pool' && m.status !== 'archived');
    const secs = {}; for (const k of SECTIONS) secs[k] = new Map();
    for (const x of db.prepare('SELECT mock_id, section, data FROM questions').all()) {
      if (!secs[x.section]) continue; const d = JSON.parse(x.data); const topic = d.topic || 'General'; const diff = d.difficulty || 'moderate';
      const t = secs[x.section].get(topic) || { topic, bank: 0, mocks: 0, published: 0, easy: 0, moderate: 0, hard: 0, mockIds: new Set() };
      const m = mocks.get(x.mock_id); if (x.mock_id === 'pool') t.bank++; else if (m && m.status !== 'archived') { t.mocks++; t.mockIds.add(x.mock_id); if (m.status === 'published') t.published++; }
      else continue;
      if (t[diff] !== undefined) t[diff]++; secs[x.section].set(topic, t);
    }
    const sections = SECTIONS.map((k) => {
      const topics = [...secs[k].values()].map((t) => { const total = t.bank + t.mocks; return { topic: t.topic, bank: t.bank, mocks: t.mocks, published: t.published, usedIn: t.mockIds.size, easy: t.easy, moderate: t.moderate, hard: t.hard, total, gap: t.mockIds.size <= 1 && t.bank === 0 ? 'thin' : t.bank === 0 && t.mocks < live.length ? 'low' : null }; }).sort((a, b) => a.total - b.total || a.topic.localeCompare(b.topic));
      const sum = (f) => topics.reduce((a, t) => a + t[f], 0);
      return { key: k, name: examConfig.sections[k].name, short: examConfig.sections[k].short, perMock: examConfig.sections[k].questions, bank: sum('bank'), inMocks: sum('mocks'), easy: sum('easy'), moderate: sum('moderate'), hard: sum('hard'), topics };
    });
    res.json({ mockCount: live.length, sections });
  });

  // ---------- system health ----------
  const dirSize = (dir) => { let bytes = 0, files = 0; try { for (const f of fs.readdirSync(dir)) { try { const st = fs.statSync(path.join(dir, f)); if (st.isFile()) { bytes += st.size; files++; } } catch { /* skip */ } } } catch { /* missing */ } return { bytes, files }; };
  r.get('/system', (req, res) => {
    const t = now(); const dbFile = db.prepare('PRAGMA database_list').get().file || '';
    const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
    let disk = null; try { const st = fs.statfsSync(dbFile ? path.dirname(dbFile) : os.tmpdir()); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch { /* not supported */ }
    const up = dirSize(UPLOAD_DIR); const errs = recentErrors(); const backup = db.prepare("SELECT at FROM audit WHERE action='backup_download' ORDER BY id DESC LIMIT 1").get();
    const prod = process.env.NODE_ENV === 'production'; const smtp = !!process.env.SMTP_HOST; const sms = process.env.SMS_PROVIDER || '';
    const https = !!(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https'));
    const mem = process.memoryUsage();
    const counts = { students: db.prepare("SELECT COUNT(*) c FROM users WHERE COALESCE(role,'student')='student'").get().c, attempts: db.prepare('SELECT COUNT(*) c FROM attempts').get().c, inProgress: db.prepare("SELECT COUNT(*) c FROM attempts WHERE status='in_progress'").get().c, questions: db.prepare('SELECT COUNT(*) c FROM questions').get().c, sessions: db.prepare('SELECT COUNT(*) c FROM sessions WHERE expires_at>?').get(t).c };
    const e1h = errs.filter((e) => t - e.at < 3600000).length, e24 = errs.filter((e) => t - e.at < DAY).length;
    const checks = [];
    const chk = (name, level, detail) => checks.push({ name, level, detail });
    if (disk) { const pct = Math.round((disk.free / disk.total) * 100); chk('Disk space', pct < 10 ? 'bad' : pct < 20 ? 'warn' : 'ok', `${pct}% free`); }
    chk('Backups', !backup ? 'warn' : t - backup.at > 7 * DAY ? 'warn' : 'ok', backup ? `Last download ${Math.floor((t - backup.at) / DAY)} day(s) ago` : 'No backup downloaded yet. Use Settings → Data & backup.');
    chk('Server errors', e1h ? 'bad' : e24 ? 'warn' : 'ok', e1h ? `${e1h} in the last hour` : e24 ? `${e24} in the last 24 hours` : 'None since the server started');
    chk('Sign-in codes', smtp || sms ? 'ok' : prod ? 'bad' : 'warn', smtp || sms ? `Delivery set up (${[smtp && 'email', sms].filter(Boolean).join(' + ')})` : prod ? 'Production mode without email or SMS: students cannot sign in with a code' : 'No email or SMS set up. Codes are printed in the server log (test mode).');
    chk('HTTPS', https || !prod ? (https ? 'ok' : 'warn') : 'warn', https ? 'You are connected over HTTPS' : 'This page was opened over plain HTTP. Fine for testing, not for real students.');
    chk('Memory', mem.rss > 0.85 * os.totalmem() ? 'bad' : 'ok', `${Math.round(mem.rss / 1048576)} MB used by the app`);
    res.json({
      at: t, node: process.version, env: process.env.NODE_ENV || 'development', startedAt, uptimeSec: Math.round(process.uptime()), https, host: os.hostname(),
      disk, db: { file: dbFile ? path.basename(dbFile) : ':memory:', bytes: dbFile ? size(dbFile) : 0, walBytes: dbFile ? size(dbFile + '-wal') : 0 }, uploads: up, memory: { rss: mem.rss, heap: mem.heapUsed, total: os.totalmem(), free: os.freemem() }, load: os.loadavg(),
      counts, lastBackupAt: backup?.at || null, otp: { email: smtp, sms: sms || null }, errors: errs.slice(0, 30), errorCounts: { hour: e1h, day: e24 }, checks,
    });
  });
  r.post('/system/check-db', (req, res) => { const rows = db.prepare('PRAGMA quick_check').all(); const msg = rows.map((x) => Object.values(x)[0]).join('; '); audit(req, 'db_check', '', msg.slice(0, 120)); res.json({ ok: msg === 'ok', message: msg }); });
  r.post('/system/clear-errors', (req, res) => { clearErrors(); audit(req, 'errors_cleared'); res.json({ ok: true }); });
  // ---------- ask your data (free, rule based) ----------
  r.get('/ask/examples', (req, res) => res.json({ examples: EXAMPLES }));
  r.post('/ask', (req, res) => {
    const q = String(req.body?.q || '').trim();
    if (q.length < 3) return bad(res, 'Type a question, for example "How did Mock 3 go?"');
    try { res.json({ q, ...answerAsk(q, { db, now, briefs, results }) }); } catch (e) { recordError('ask', e?.message || String(e)); bad(res, 'Could not answer that. Try rephrasing it.', 500); }
  });

  mountAdminExtras({ r, db, now, audit, bad, results, settings, notifier, features, runReminders, page });
  r.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return r;
}
