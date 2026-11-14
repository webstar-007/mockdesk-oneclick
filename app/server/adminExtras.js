// Admin routes added in v7: announcements, notifications, referrals, batches and the question quality report.
import crypto from 'node:crypto';
import { AUDIENCES, audienceCount, audienceIds } from './lib/audience.js';
import { DEFAULTS } from './lib/settings.js';
import { reminderConfig } from './lib/reminders.js';
import { normEmail, normPhone } from './lib/otp.js';

const DAY = 86400000;
const LEVELS = ['info', 'good', 'warn', 'urgent'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
const round1 = (n) => Math.round(n * 10) / 10;

/** Send push/email for announcements that have just gone live. Safe to call often; each announcement goes out once. */
export async function broadcastDue({ db, notifier, now }) {
  const t = now(); let sent = 0;
  const due = db.prepare("SELECT * FROM announcements WHERE active=1 AND broadcast_at IS NULL AND COALESCE(notify,'')!='' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?)").all(t, t);
  for (const a of due) {
    db.prepare('UPDATE announcements SET broadcast_at=? WHERE id=?').run(t, a.id);
    const ways = String(a.notify).split(',');
    const ids = audienceIds(db, a.audience || 'all', a.batch_id, t);
    await notifier.pool(ids, 8, async (id) => { await notifier.notify(id, { kind: 'announcement', title: a.title || 'MockDesk', body: a.text, link: a.link_url || '/', ref: `ann:${a.id}`, channels: { inapp: false, push: ways.includes('push'), email: ways.includes('email') }, capped: false }); sent++; });
  }
  return sent;
}

export function mountAdminExtras({ r, db, now, audit, bad, results, settings, notifier, features, runReminders, page }) {
  // ---------- announcements ----------
  const statusOf = (a, t) => (!a.active ? 'draft' : a.ends_at && a.ends_at <= t ? 'ended' : a.starts_at && a.starts_at > t ? 'scheduled' : 'live');
  const annOut = (a, t) => {
    const st = db.prepare('SELECT COUNT(seen_at) seen, COUNT(dismissed_at) dismissed, COUNT(clicked_at) clicked FROM announcement_state WHERE announcement_id=?').get(a.id);
    const batch = a.batch_id ? db.prepare('SELECT name FROM batches WHERE id=?').get(a.batch_id) : null;
    return { id: a.id, title: a.title || '', text: a.text, level: a.level, active: !!a.active, status: statusOf(a, t), pinned: a.pinned === 1, dismissible: a.dismissible !== 0, linkUrl: a.link_url || '', linkLabel: a.link_label || '', audience: a.audience || 'all', batchId: a.batch_id || null, batchName: batch?.name || null, startsAt: a.starts_at || null, endsAt: a.ends_at || null, notify: String(a.notify || '').split(',').filter(Boolean), broadcastAt: a.broadcast_at || null, createdAt: a.created_at, createdBy: a.created_by || null, stats: { seen: st.seen, dismissed: st.dismissed, clicked: st.clicked }, reach: statusOf(a, t) === 'live' || statusOf(a, t) === 'ended' ? undefined : audienceCount(db, a.audience || 'all', a.batch_id, t) };
  };
  const readAnn = (b, base = {}) => {
    const text = b.text !== undefined ? String(b.text).trim().slice(0, 400) : base.text; if (!text) return { error: 'Write the message' };
    const level = b.level !== undefined ? b.level : base.level || 'info'; if (!LEVELS.includes(level)) return { error: 'Choose info, good, warn or urgent' };
    const audience = b.audience !== undefined ? b.audience : base.audience || 'all'; if (!AUDIENCES.some(([k]) => k === audience)) return { error: 'Choose who should see it' };
    const batchId = audience === 'batch' ? Number(b.batchId ?? base.batch_id) || null : null;
    if (audience === 'batch' && !db.prepare('SELECT 1 FROM batches WHERE id=?').get(batchId)) return { error: 'Choose a batch' };
    let link = b.linkUrl !== undefined ? String(b.linkUrl).trim().slice(0, 300) : base.link_url || ''; if (link && !/^(\/(?!\/)|https?:\/\/)/.test(link)) return { error: 'The link must start with / (a page on this site) or https://' };
    const ts = (v, fallback) => (v === undefined ? fallback : v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);
    const startsAt = ts(b.startsAt, base.starts_at ?? null), endsAt = ts(b.endsAt, base.ends_at ?? null);
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return { error: 'Check the dates' };
    if (startsAt && endsAt && endsAt <= startsAt) return { error: 'The end must be after the start' };
    const notifyArr = b.notify !== undefined ? (Array.isArray(b.notify) ? b.notify : []).filter((x) => ['push', 'email'].includes(x)) : String(base.notify || '').split(',').filter(Boolean);
    return { v: { text, title: b.title !== undefined ? String(b.title).trim().slice(0, 80) : base.title || '', level, audience, batch_id: batchId, link_url: link || null, link_label: link ? String(b.linkLabel !== undefined ? b.linkLabel : base.link_label || 'Open').trim().slice(0, 30) || 'Open' : null, starts_at: startsAt, ends_at: endsAt, pinned: b.pinned !== undefined ? (b.pinned ? 1 : 0) : base.pinned || 0, dismissible: b.dismissible !== undefined ? (b.dismissible ? 1 : 0) : base.dismissible ?? 1, notify: notifyArr.join(','), active: b.active !== undefined ? (b.active ? 1 : 0) : base.active ?? 1 } };
  };
  r.get('/announcements', (req, res) => { const t = now(); res.json({ audiences: AUDIENCES.map(([key, label]) => ({ key, label })), batches: db.prepare('SELECT id, name FROM batches WHERE archived=0 ORDER BY name').all(), pushReady: notifier.hasPush, emailReady: notifier.hasMailer, announcements: db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT 100').all().map((a) => annOut(a, t)) }); });
  r.get('/announcements/audience', (req, res) => res.json({ count: audienceCount(db, String(req.query.audience || 'all'), req.query.batchId, now()) }));
  r.post('/announcements', async (req, res) => {
    const x = readAnn(req.body || {}); if (x.error) return bad(res, x.error); const v = x.v;
    const id = Number(db.prepare('INSERT INTO announcements(text,level,active,created_at,title,link_url,link_label,audience,batch_id,starts_at,ends_at,pinned,dismissible,notify,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(v.text, v.level, v.active, now(), v.title, v.link_url, v.link_label, v.audience, v.batch_id, v.starts_at, v.ends_at, v.pinned, v.dismissible, v.notify, req.user.name, now()).lastInsertRowid);
    audit(req, 'announcement_add', v.title || v.text.slice(0, 60));
    let sent = 0; try { sent = await broadcastDue({ db, notifier, now }); } catch { /* sends are best effort */ }
    res.status(201).json({ ok: true, id, notified: sent });
  });
  r.patch('/announcements/:id', async (req, res) => {
    const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Not found', 404);
    const x = readAnn(req.body || {}, a); if (x.error) return bad(res, x.error); const v = x.v;
    db.prepare('UPDATE announcements SET text=?,level=?,active=?,title=?,link_url=?,link_label=?,audience=?,batch_id=?,starts_at=?,ends_at=?,pinned=?,dismissible=?,notify=?,updated_at=? WHERE id=?').run(v.text, v.level, v.active, v.title, v.link_url, v.link_label, v.audience, v.batch_id, v.starts_at, v.ends_at, v.pinned, v.dismissible, a.broadcast_at ? a.notify : v.notify, now(), a.id);
    audit(req, 'announcement_edit', String(a.id)); try { await broadcastDue({ db, notifier, now }); } catch { /* best effort */ } res.json({ ok: true });
  });
  r.post('/announcements/:id/end', (req, res) => { const a = db.prepare('SELECT id FROM announcements WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Not found', 404); db.prepare('UPDATE announcements SET ends_at=?, updated_at=? WHERE id=?').run(now(), now(), a.id); audit(req, 'announcement_end', String(a.id)); res.json({ ok: true }); });
  r.post('/announcements/:id/duplicate', (req, res) => {
    const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Not found', 404);
    const id = Number(db.prepare('INSERT INTO announcements(text,level,active,created_at,title,link_url,link_label,audience,batch_id,pinned,dismissible,notify,created_by,updated_at) VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?,?)').run(a.text, a.level, now(), a.title, a.link_url, a.link_label, a.audience, a.batch_id, a.pinned, a.dismissible, a.notify, req.user.name, now()).lastInsertRowid);
    audit(req, 'announcement_duplicate', String(a.id)); res.status(201).json({ ok: true, id });
  });
  r.delete('/announcements/:id', (req, res) => { db.prepare('DELETE FROM announcement_state WHERE announcement_id=?').run(req.params.id); db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id); audit(req, 'announcement_delete', req.params.id); res.json({ ok: true }); });

  // ---------- notifications and reminders ----------
  r.get('/notifications', async (req, res) => {
    const t = now(); const since = t - 30 * DAY;
    const rows = db.prepare('SELECT channel, status, COUNT(*) c FROM deliveries WHERE at>? GROUP BY channel, status').all(since);
    const by = (ch, st) => rows.find((x) => x.channel === ch && x.status === st)?.c || 0;
    const emailSent = by('email', 'sent');
    const daily = db.prepare("SELECT strftime('%Y-%m-%d', at/1000, 'unixepoch') d, channel, COUNT(*) c FROM deliveries WHERE at>? AND status='sent' GROUP BY d, channel ORDER BY d").all(t - 14 * DAY);
    res.json({
      config: reminderConfig(settings), defaults: DEFAULTS.reminders,
      flags: { emailReady: notifier.hasMailer, pushReady: notifier.hasPush, publicUrl: !!process.env.MOCKDESK_PUBLIC_URL, emailDailyCap: notifier.emailDailyCap(), tz: process.env.MOCKDESK_TZ || 'Asia/Kolkata' },
      subscribers: { push: db.prepare('SELECT COUNT(DISTINCT user_id) c FROM push_subs').get().c, emailOff: db.prepare("SELECT COUNT(*) c FROM users WHERE notify_prefs LIKE '%\"email\":false%'").get().c, students: db.prepare("SELECT COUNT(*) c FROM users WHERE COALESCE(role,'student')='student'").get().c },
      stats: { push: { sent: by('push', 'sent'), failed: by('push', 'failed'), skipped: by('push', 'skipped') }, email: { sent: emailSent, failed: by('email', 'failed'), skipped: by('email', 'skipped') }, emailCostUsd: round1(emailSent * 0.1 / 1000 * 100) / 100 },
      daily, failures: db.prepare("SELECT d.channel, d.kind, d.error, d.at, u.name FROM deliveries d LEFT JOIN users u ON u.id=d.user_id WHERE d.status='failed' ORDER BY d.at DESC LIMIT 15").all(),
      preview: await runReminders({ dryRun: true }),
    });
  });
  r.put('/notifications/config', (req, res) => {
    const b = req.body || {}; const cur = reminderConfig(settings); const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
    const next = { ...cur,
      inactive: { enabled: b.inactive?.enabled ?? cur.inactive.enabled, days: num(b.inactive?.days, 2, 60, cur.inactive.days), repeatDays: num(b.inactive?.repeatDays, 2, 60, cur.inactive.repeatDays) },
      welcome: { enabled: b.welcome?.enabled ?? cur.welcome.enabled, days: num(b.welcome?.days, 1, 14, cur.welcome.days) },
      mockSoon: { enabled: b.mockSoon?.enabled ?? cur.mockSoon.enabled, hours: (Array.isArray(b.mockSoon?.hours) ? b.mockSoon.hours : cur.mockSoon.hours).map((h) => num(h, 1, 168, 24)).filter((h, i, a) => a.indexOf(h) === i).slice(0, 3) },
      weeklyCap: num(b.weeklyCap, 1, 20, cur.weeklyCap), quietFrom: num(b.quietFrom, 0, 23, cur.quietFrom), quietTo: num(b.quietTo, 0, 23, cur.quietTo),
      channels: { push: b.channels?.push ?? cur.channels.push, email: b.channels?.email ?? cur.channels.email } };
    settings.set('reminders', next); audit(req, 'reminders_config', 'reminders'); res.json({ config: next });
  });
  r.post('/notifications/run', async (req, res) => { const out = await runReminders({ force: true }); audit(req, 'reminders_run', 'manual', JSON.stringify(out.rules).slice(0, 200)); res.json(out); });
  r.post('/notifications/test', async (req, res) => {
    const out = await notifier.notify(req.user.id, { kind: 'test', title: 'Test notification', body: 'If you can read this, notifications work.', link: '/', ref: `test:${req.user.id}:${now()}`, capped: false });
    res.json({ result: out });
  });

  // ---------- referrals ----------
  r.get('/referrals', (req, res) => {
    const cfg = features.refCfg();
    const c = (sql, ...p) => db.prepare(sql).get(...p).c;
    res.json({
      settings: cfg, stats: { joined: c('SELECT COUNT(*) c FROM referrals'), qualified: c("SELECT COUNT(*) c FROM referrals WHERE status='qualified'"), rewards: c('SELECT COUNT(*) c FROM unlocks'), referrers: c('SELECT COUNT(DISTINCT referrer_id) c FROM referrals') },
      rewardMocks: db.prepare("SELECT id, name, number, status, available_from FROM mocks WHERE ref_locked=1 ORDER BY number").all().map((m) => ({ id: m.id, name: m.name, status: m.status, availableFrom: m.available_from, unlocked: c('SELECT COUNT(*) c FROM unlocks WHERE mock_id=?', m.id) })),
      top: db.prepare("SELECT u.id, u.name, u.email, u.phone, COUNT(*) joined, SUM(r.status='qualified') qualified FROM referrals r JOIN users u ON u.id=r.referrer_id GROUP BY u.id ORDER BY qualified DESC, joined DESC LIMIT 10").all(),
      recent: db.prepare("SELECT r.id, r.status, r.created_at, r.qualified_at, a.name referrer, f.name friend FROM referrals r JOIN users a ON a.id=r.referrer_id JOIN users f ON f.id=r.friend_id ORDER BY r.id DESC LIMIT 20").all(),
    });
  });
  r.put('/referrals/settings', (req, res) => {
    const b = req.body || {}; const cur = features.refCfg(); const n = Math.max(1, Math.min(10, Math.round(Number(b.friendsNeeded) || cur.friendsNeeded)));
    const next = { enabled: b.enabled === undefined ? cur.enabled : !!b.enabled, friendsNeeded: n }; settings.set('referral', next); audit(req, 'referral_settings', JSON.stringify(next)); res.json({ settings: next });
  });

  // ---------- batches ----------
  const batchRow = (id) => db.prepare('SELECT * FROM batches WHERE id=?').get(id);
  const teachersOf = (id) => db.prepare('SELECT u.id, u.name, u.email, u.phone FROM batch_teachers bt JOIN users u ON u.id=bt.user_id WHERE bt.batch_id=? ORDER BY u.name').all(id);
  r.get('/batches', (req, res) => res.json({ batches: db.prepare('SELECT * FROM batches ORDER BY archived, name').all().map((b) => ({ id: b.id, name: b.name, code: b.code, archived: !!b.archived, createdAt: b.created_at, students: db.prepare('SELECT COUNT(*) c FROM batch_members WHERE batch_id=?').get(b.id).c, teachers: teachersOf(b.id) })) }));
  r.post('/batches', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80); if (!name) return bad(res, 'Give the batch a name');
    let code = newCode(); while (db.prepare('SELECT 1 FROM batches WHERE code=?').get(code)) code = newCode();
    const id = Number(db.prepare('INSERT INTO batches(name,code,created_at,created_by,archived) VALUES (?,?,?,?,0)').run(name, code, now(), req.user.name).lastInsertRowid);
    audit(req, 'batch_create', name); res.status(201).json({ id, code });
  });
  r.patch('/batches/:id', (req, res) => {
    const b = batchRow(req.params.id); if (!b) return bad(res, 'Batch not found', 404);
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : b.name; if (!name) return bad(res, 'Name cannot be empty');
    let code = b.code; if (req.body?.regenerate) { code = newCode(); while (db.prepare('SELECT 1 FROM batches WHERE code=?').get(code)) code = newCode(); }
    db.prepare('UPDATE batches SET name=?, code=?, archived=? WHERE id=?').run(name, code, req.body?.archived === undefined ? b.archived : req.body.archived ? 1 : 0, b.id);
    audit(req, 'batch_edit', name); res.json({ ok: true, code });
  });
  r.get('/batches/:id', (req, res) => {
    const b = batchRow(req.params.id); if (!b) return bad(res, 'Batch not found', 404);
    const students = db.prepare('SELECT u.id, u.name, u.email, u.phone, u.last_seen, bm.joined_at, (SELECT COUNT(*) FROM attempts a WHERE a.user_id=u.id AND a.status=\'submitted\' AND a.mock_id!=\'practice\') mocks FROM batch_members bm JOIN users u ON u.id=bm.user_id WHERE bm.batch_id=? ORDER BY u.name').all(b.id);
    res.json({ batch: { id: b.id, name: b.name, code: b.code, archived: !!b.archived }, teachers: teachersOf(b.id), students });
  });
  r.post('/batches/:id/teachers', (req, res) => {
    const b = batchRow(req.params.id); if (!b) return bad(res, 'Batch not found', 404);
    const raw = String(req.body?.identifier || '').trim(); const em = normEmail(raw), ph = em ? null : normPhone(raw);
    if (!em && !ph) return bad(res, 'Enter the teacher’s email or mobile number');
    let u = db.prepare(`SELECT * FROM users WHERE ${em ? 'email' : 'phone'}=?`).get(em || ph);
    if (u && ['admin', 'editor'].includes(u.role)) return bad(res, 'That person is an admin or editor. Use a separate account for teaching.');
    if (!u) {
      const name = String(req.body?.name || '').trim().slice(0, 80) || (em ? em.split('@')[0] : 'Teacher');
      const id = Number(db.prepare(`INSERT INTO users(name,${em ? 'email' : 'phone'},role,created_at) VALUES (?,?,?,?)`).run(name, em || ph, 'teacher', new Date(now()).toISOString()).lastInsertRowid);
      u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    } else if (u.role !== 'teacher') db.prepare("UPDATE users SET role='teacher' WHERE id=?").run(u.id);
    db.prepare('INSERT OR IGNORE INTO batch_teachers(batch_id,user_id) VALUES (?,?)').run(b.id, u.id);
    db.prepare('DELETE FROM batch_members WHERE user_id=?').run(u.id);
    audit(req, 'batch_teacher_add', `${b.name}: ${u.email || u.phone}`); res.json({ ok: true, teachers: teachersOf(b.id) });
  });
  r.delete('/batches/:id/teachers/:uid', (req, res) => { db.prepare('DELETE FROM batch_teachers WHERE batch_id=? AND user_id=?').run(req.params.id, req.params.uid); audit(req, 'batch_teacher_remove', req.params.id); res.json({ ok: true }); });
  r.post('/batches/:id/students', (req, res) => {
    const b = batchRow(req.params.id); if (!b) return bad(res, 'Batch not found', 404);
    const items = String(req.body?.list || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 500);
    if (!items.length) return bad(res, 'Paste at least one email or mobile number');
    let added = 0, already = 0; const notFound = [];
    for (const it of items) {
      const em = normEmail(it), ph = em ? null : normPhone(it); if (!em && !ph) { notFound.push(it); continue; }
      const u = db.prepare(`SELECT id, role FROM users WHERE ${em ? 'email' : 'phone'}=?`).get(em || ph);
      if (!u || (u.role && u.role !== 'student')) { notFound.push(it); continue; }
      const x = db.prepare('INSERT OR IGNORE INTO batch_members(batch_id,user_id,joined_at) VALUES (?,?,?)').run(b.id, u.id, now()); x.changes ? added++ : already++;
    }
    audit(req, 'batch_students_add', `${b.name}: +${added}`); res.json({ added, already, notFound });
  });
  r.delete('/batches/:id/students/:uid', (req, res) => { db.prepare('DELETE FROM batch_members WHERE batch_id=? AND user_id=?').run(req.params.id, req.params.uid); audit(req, 'batch_student_remove', req.params.id); res.json({ ok: true }); });

  // ---------- question quality ----------
  r.get('/quality', (req, res) => {
    const agg = new Map(); const secTime = new Map();
    for (const { row, res: rs } of results()) for (const q of rs.questions || []) {
      if (q.qualifying || !Array.isArray(q.options)) continue;
      const s = agg.get(q.id) || { id: q.id, n: 0, correct: 0, wrong: 0, skipped: 0, time: 0, dist: q.options.map(() => 0), key: q.correct, section: q.section, topic: q.topic, difficulty: q.difficulty || 'moderate', text: q.text, mockIds: new Set(), noExp: !q.explanation };
      s.n++; s.time += q.timeSec || 0; s.mockIds.add(row.mock_id);
      if (q.status === 'correct') s.correct++; else if (q.status === 'incorrect') s.wrong++; else s.skipped++;
      if (Number.isInteger(q.selected) && q.selected < s.dist.length) s.dist[q.selected]++;
      agg.set(q.id, s);
      const st = secTime.get(q.section) || { n: 0, t: 0 }; st.n++; st.t += q.timeSec || 0; secTime.set(q.section, st);
    }
    const reportsBy = new Map(db.prepare("SELECT question_id, COUNT(*) c, SUM(reason='wrong_answer') wa, SUM(reason='unclear') un FROM reports WHERE status='open' GROUP BY question_id").all().map((x) => [x.question_id, x]));
    const current = new Map(db.prepare('SELECT id, mock_id FROM questions').all().map((x) => [x.id, x.mock_id]));
    const mockName = new Map(db.prepare('SELECT id, name FROM mocks').all().map((m) => [m.id, m.name]));
    const minN = Math.max(1, Math.min(200, Number(req.query.min) || 5));
    const list = [];
    for (const s of agg.values()) {
      if (s.n < minN) continue;
      const pc = (x) => Math.round((x / s.n) * 100); const attempted = s.correct + s.wrong; const pctRight = pc(s.correct);
      const avgTime = Math.round(s.time / s.n); const sec = secTime.get(s.section); const secAvg = sec ? sec.t / sec.n : 0;
      const dist = s.dist.map((d) => pc(d)); const topWrong = s.dist.reduce((best, d, i) => (i !== s.key && d > (s.dist[best] ?? -1) ? i : best), s.key === 0 ? 1 : 0);
      const rep = reportsBy.get(s.id); const flags = [];
      if (attempted >= 10 && s.dist[topWrong] > s.dist[s.key] && dist[topWrong] >= 40) flags.push({ key: 'wrong_key', label: 'Answer key may be wrong', detail: `${dist[topWrong]}% chose option ${'ABCD'[topWrong]} but the key says ${'ABCD'[s.key]} (${dist[s.key]}%).`, severity: 3 });
      if (attempted >= 10) { const hi = s.dist.map((d, i) => [d, i]).filter(([d]) => pc(d) >= 30).map(([, i]) => i); if (hi.length >= 2 && !flags.some((f) => f.key === 'wrong_key')) flags.push({ key: 'ambiguous', label: 'May be ambiguous', detail: `Options ${hi.map((i) => 'ABCD'[i]).join(' and ')} each drew 30% or more.`, severity: 2 }); }
      if (rep?.wa >= 2 || rep?.un >= 2 || rep?.c >= 3) flags.push({ key: 'reported', label: 'Students reported it', detail: `${rep.c} open report${rep.c > 1 ? 's' : ''}.`, severity: 3 });
      if (s.difficulty === 'easy' && pctRight < 35 && s.n >= 10) flags.push({ key: 'harder_than_tag', label: 'Harder than its tag', detail: `Tagged easy but only ${pctRight}% got it right.`, severity: 1 });
      if (s.difficulty === 'hard' && pctRight > 85 && s.n >= 10) flags.push({ key: 'easier_than_tag', label: 'Easier than its tag', detail: `Tagged hard but ${pctRight}% got it right.`, severity: 1 });
      if (pc(s.skipped) >= 50 && s.n >= 10) flags.push({ key: 'skipped', label: 'Often skipped', detail: `${pc(s.skipped)}% left it blank.`, severity: 1 });
      if (secAvg && avgTime >= Math.max(60, secAvg * 2) && s.n >= 10) flags.push({ key: 'slow', label: 'Takes too long', detail: `${avgTime}s on average, against ${Math.round(secAvg)}s for its section.`, severity: 1 });
      if (s.noExp) flags.push({ key: 'no_explanation', label: 'No explanation', detail: 'Students see no solution for this question.', severity: 1 });
      const mockId = current.get(s.id); const liveIn = mockId || [...s.mockIds][0];
      list.push({ id: s.id, text: String(s.text || '').slice(0, 140), section: s.section, topic: s.topic, difficulty: s.difficulty, mockId: mockId || null, mockName: mockName.get(liveIn) || liveIn, attempts: s.n, pctRight, pctWrong: pc(s.wrong), pctSkipped: pc(s.skipped), avgTimeSec: avgTime, sectionAvgSec: Math.round(secAvg), options: dist, keyIndex: s.key, reports: rep?.c || 0, flags, worst: Math.max(0, ...flags.map((f) => f.severity)) });
    }
    const flag = String(req.query.flag || ''); const mock = String(req.query.mock || ''); const section = String(req.query.section || '');
    let out = list.filter((x) => (!flag || (flag === 'any' ? x.flags.length : x.flags.some((f) => f.key === flag))) && (!mock || x.mockId === mock) && (!section || x.section === section));
    out.sort((a, b) => b.worst - a.worst || b.flags.length - a.flags.length || a.pctRight - b.pctRight);
    const counts = {}; for (const x of list) for (const f of x.flags) counts[f.key] = (counts[f.key] || 0) + 1;
    res.json({ total: list.length, flagged: list.filter((x) => x.worst >= 2).length, counts, minAttempts: minN, mocks: [...new Set(list.map((x) => x.mockId).filter(Boolean))].map((id) => ({ id, name: mockName.get(id) || id })), questions: out.slice(0, 200) });
  });
}
