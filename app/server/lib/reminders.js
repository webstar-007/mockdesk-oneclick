// Automatic reminders. Runs every few minutes from the server (and on demand from the admin page).
import { DEFAULTS } from './settings.js';
const DAY = 86400000; const HOUR = 3600000;
const tzOf = () => process.env.MOCKDESK_TZ || 'Asia/Kolkata';
export const reminderConfig = (settings) => { const s = settings.get('reminders', {}); const d = DEFAULTS.reminders; return { ...d, ...s, inactive: { ...d.inactive, ...s.inactive }, welcome: { ...d.welcome, ...s.welcome }, mockSoon: { ...d.mockSoon, ...s.mockSoon }, channels: { ...d.channels, ...s.channels } }; };
const localHour = (t) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tzOf(), hour: '2-digit', hour12: false }).format(t)) % 24;
const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: tzOf() }).format(t);
const clock = (t) => new Intl.DateTimeFormat('en-IN', { timeZone: tzOf(), hour: 'numeric', minute: '2-digit', hour12: true }).format(t).replace(/\s/g, ' ').toUpperCase();
const dateLabel = (t, now) => { const a = dayKey(t); if (a === dayKey(now)) return 'today'; if (a === dayKey(now + DAY)) return 'tomorrow'; return `on ${new Intl.DateTimeFormat('en-IN', { timeZone: tzOf(), day: 'numeric', month: 'short' }).format(t)}`; };
export const isQuiet = (cfg, t) => { const h = localHour(t); return cfg.quietFrom > cfg.quietTo ? h >= cfg.quietFrom || h < cfg.quietTo : h >= cfg.quietFrom && h < cfg.quietTo; };

const activeStudents = "COALESCE(u.role,'student')='student' AND COALESCE(u.status,'active')='active'";

/** Work out who should get which reminder now. With dryRun it only counts. */
export async function runReminders({ db, notifier, settings, now, dryRun = false, force = false }) {
  const t = now(); const cfg = reminderConfig(settings); const out = { ran: true, quiet: false, rules: {} };
  if (!force && !dryRun && isQuiet(cfg, t)) return { ran: false, quiet: true, rules: {} };
  const channels = { inapp: true, push: cfg.channels.push, email: cfg.channels.email };
  const done = (ref) => new Set(db.prepare('SELECT user_id FROM notifications WHERE ref=?').all(ref).map((x) => x.user_id));
  const send = async (rule, kind, list, ref, build) => {
    const have = done(ref); const todo = list.filter((x) => !have.has(x.id));
    out.rules[rule] = (out.rules[rule] || { eligible: 0, sent: 0 }); out.rules[rule].eligible += todo.length;
    if (dryRun) return;
    await notifier.pool(todo, 8, async (u) => { const m = build(u); const r = await notifier.notify(u.id, { kind, ref, channels, ...m }); if (!r.duplicate && !r.skipped) out.rules[rule].sent++; });
  };

  if (cfg.inactive.enabled) {
    const days = Math.max(1, Number(cfg.inactive.days) || 4); const rep = Math.max(1, Number(cfg.inactive.repeatDays) || 7);
    const rows = db.prepare(`SELECT u.id, u.name, MAX(a.started_at) last FROM users u JOIN attempts a ON a.user_id=u.id WHERE ${activeStudents} GROUP BY u.id HAVING last < ? LIMIT 5000`).all(t - days * DAY);
    await send('inactive', 'reminder', rows, `inactive:${Math.floor(t / (rep * DAY))}`, (u) => { const n = Math.floor((t - u.last) / DAY); return { title: `It has been ${n} days since you practised`, body: 'A short practice set on your weak topics keeps you in rhythm. It takes about 20 minutes.', link: '/' }; });
  }
  if (cfg.welcome.enabled) {
    const days = Math.max(1, Number(cfg.welcome.days) || 2);
    const rows = db.prepare(`SELECT u.id, u.name FROM users u WHERE ${activeStudents} AND u.created_at < ? AND u.created_at > ? AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.user_id=u.id) LIMIT 5000`).all(new Date(t - days * DAY).toISOString(), new Date(t - 14 * DAY).toISOString());
    await send('welcome', 'reminder', rows, 'welcome', () => ({ title: 'Ready for your first mock?', body: 'One full paper shows you exactly which topics to fix. Pick one when you have a quiet stretch of time.', link: '/' }));
  }
  if (cfg.mockSoon.enabled) {
    for (const h of cfg.mockSoon.hours || []) {
      const mocks = db.prepare("SELECT id, name, available_from FROM mocks WHERE status='published' AND available_from>? AND available_from<=?").all(t, t + h * HOUR);
      if (!mocks.length) continue;
      const rows = db.prepare(`SELECT u.id FROM users u WHERE ${activeStudents} LIMIT 50000`).all();
      for (const m of mocks) await send('mockSoon', 'reminder', rows, `mock_soon:${m.id}:${h}`, () => ({ title: `${m.name} opens ${dateLabel(m.available_from, t)} at ${clock(m.available_from)}`, body: 'Be ready ten minutes early with a charged phone and a steady connection.', link: '/' }));
    }
  }
  return out;
}
