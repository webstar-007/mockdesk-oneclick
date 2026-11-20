// Admin routes added in v8: student cohorts and nudges, and proactive weak-question alerts.
const DAY = 86400000;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function mountAdminExtras2({ r, db, now, audit, bad, notifier, computeQuality }) {
  // ---------- cohorts, funnel and win-back ----------
  const SEGMENTS = {
    never_started: { label: 'Signed up, never started', hint: 'Joined at least 3 days ago and has not opened a test.', title: 'Your first mock is waiting', body: 'It takes under 5 minutes to read the instructions and start. Try one section today.' },
    abandoned: { label: 'Started but never finished', hint: 'Began a test, never submitted, and has been quiet for 2+ days.', title: 'Finish what you started', body: 'You have a test in progress. Open it and submit to see your analysis.' },
    one_and_idle: { label: 'Finished one test, then went quiet', hint: 'Exactly one finished test, nothing for 7+ days.', title: 'Your next mock will show real progress', body: 'One more test lets us compare against your first and show what improved.' },
    streak_broken: { label: 'Was active, now inactive', hint: '3+ finished tests but nothing for 10+ days.', title: 'Keep your momentum', body: 'You were doing well. A short practice set today keeps your accuracy up.' },
  };
  const people = () => {
    const t = now();
    const users = db.prepare("SELECT id, name, email, phone, created_at, last_seen FROM users WHERE COALESCE(role,'student')='student' AND COALESCE(status,'active')!='suspended'").all();
    const by = new Map(users.map((u) => [u.id, { u, started: [], done: [] }]));
    for (const a of db.prepare("SELECT user_id, status, started_at, submitted_at FROM attempts WHERE mock_id!='practice'").all()) { const p = by.get(a.user_id); if (!p) continue; p.started.push(a.started_at); if (a.status === 'submitted') p.done.push(a.submitted_at || a.started_at); }
    for (const p of by.values()) { p.created = Date.parse(p.u.created_at) || 0; p.lastStart = Math.max(0, ...p.started); p.lastDone = Math.max(0, ...p.done); }
    return { t, list: [...by.values()] };
  };
  const inSegment = (key, p, t) => {
    if (key === 'never_started') return !p.started.length && t - p.created >= 3 * DAY;
    if (key === 'abandoned') return p.started.length > 0 && !p.done.length && t - p.lastStart >= 2 * DAY;
    if (key === 'one_and_idle') return p.done.length === 1 && t - p.lastDone >= 7 * DAY;
    if (key === 'streak_broken') return p.done.length >= 3 && t - p.lastDone >= 10 * DAY;
    return false;
  };
  r.get('/cohorts', (req, res) => {
    const { t, list } = people();
    const n = (f) => list.filter(f).length;
    const steps = [['Signed up', list.length], ['Started a test', n((p) => p.started.length >= 1)], ['Finished 1 test', n((p) => p.done.length >= 1)], ['Finished 2 tests', n((p) => p.done.length >= 2)], ['Finished 3 tests', n((p) => p.done.length >= 3)], ['Finished 5 tests', n((p) => p.done.length >= 5)]];
    const funnel = steps.map(([label, count], i) => ({ label, n: count, pctOfAll: pct(count, steps[0][1]), pctOfPrev: i ? pct(count, steps[i - 1][1]) : 100 }));
    const weeks = []; // 8 weekly signup cohorts, newest first
    for (let w = 0; w < 8; w++) {
      const to = t - w * 7 * DAY, from = to - 7 * DAY; const members = list.filter((p) => p.created > from && p.created <= to);
      const active = [0, 1, 2, 3, 4].map((k) => {
        if (!members.length) return null; const full = members.filter((p) => t >= p.created + (k + 1) * 7 * DAY); if (full.length < Math.max(1, Math.ceil(members.length / 2))) return null;
        return pct(full.filter((p) => p.started.some((s) => s >= p.created + k * 7 * DAY && s < p.created + (k + 1) * 7 * DAY)).length, full.length);
      });
      weeks.push({ from, to, size: members.length, finished: pct(members.filter((p) => p.done.length >= 1).length, members.length), active });
    }
    const segments = Object.entries(SEGMENTS).map(([key, d]) => { const m = list.filter((p) => inSegment(key, p, t)); return { key, ...d, count: m.length, sample: m.slice(0, 5).map((p) => p.u.name) }; });
    res.json({ total: list.length, funnel, weeks, segments, activeLast7: n((p) => p.lastStart >= t - 7 * DAY) });
  });
  r.post('/cohorts/nudge', async (req, res) => {
    const key = String(req.body?.segment || ''); const d = SEGMENTS[key]; if (!d) return bad(res, 'Choose a group');
    const title = String(req.body?.title || d.title).trim().slice(0, 80); const body = String(req.body?.body || d.body).trim().slice(0, 200); const link = String(req.body?.link || '/').slice(0, 200);
    if (!title) return bad(res, 'Add a title'); if (!link.startsWith('/')) return bad(res, 'The link must start with /');
    const { t, list } = people(); const ids = list.filter((p) => inSegment(key, p, t)).map((p) => p.u.id); if (!ids.length) return res.json({ ok: true, audience: 0, sent: 0 });
    const day = new Date(t).toISOString().slice(0, 10); let sent = 0;
    await notifier.pool(ids, 8, async (id) => { const o = await notifier.notify(id, { kind: 'nudge', title, body, link, ref: `nudge:${key}:${day}`, channels: { email: false } }); if (o.inapp === 'sent' || o.push === 'sent') sent++; });
    audit(req, 'cohort_nudge', key, `${sent} of ${ids.length}`); res.json({ ok: true, audience: ids.length, sent });
  });

  // ---------- weak-question alerts ----------
  let alertCache = { at: 0, items: null };
  const alertList = () => {
    const t = now(); if (alertCache.items && t - alertCache.at < 300000) return alertCache.items.map((x) => ({ ...x })); const list = computeQuality(5).filter((x) => x.worst >= 2);
    const seen = new Map(db.prepare('SELECT * FROM quality_alerts').all().map((x) => [x.question_id, x]));
    for (const x of list) if (!seen.has(x.id)) { db.prepare('INSERT OR IGNORE INTO quality_alerts(question_id, first_seen) VALUES (?,?)').run(x.id, t); seen.set(x.id, { first_seen: t }); }
    const out = list.filter((x) => !seen.get(x.id)?.dismissed_at).map((x) => ({ id: x.id, text: x.text, section: x.section, mockId: x.mockId, mockName: x.mockName, attempts: x.attempts, pctRight: x.pctRight, flags: x.flags.filter((f) => f.severity >= 2), firstSeen: seen.get(x.id).first_seen, isNew: t - seen.get(x.id).first_seen < 2 * DAY, worst: x.worst }));
    alertCache = { at: t, items: out }; return out.map((x) => ({ ...x }));
  };
  r.get('/alerts', (req, res) => { const items = alertList().sort((a, b) => b.worst - a.worst || b.firstSeen - a.firstSeen); res.json({ count: items.length, fresh: items.filter((x) => x.isNew).length, items: items.slice(0, 8) }); });
  r.post('/alerts/:qid/dismiss', (req, res) => { alertCache = { at: 0, items: null }; db.prepare('INSERT INTO quality_alerts(question_id, first_seen, dismissed_at) VALUES (?,?,?) ON CONFLICT(question_id) DO UPDATE SET dismissed_at=excluded.dismissed_at').run(req.params.qid, now(), now()); audit(req, 'alert_dismissed', req.params.qid); res.json({ ok: true }); });
}
