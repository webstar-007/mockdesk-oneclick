// Notifications: in-app inbox, web push (free) and email. One place decides who may be contacted, how often and how it is logged.
import crypto from 'node:crypto';

export const defaultPrefs = { inapp: true, push: true, email: true };
export const prefsOf = (u) => { try { return { ...defaultPrefs, ...JSON.parse(u?.notify_prefs || '{}') }; } catch { return { ...defaultPrefs }; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Email sender built from the same SMTP settings as sign-in codes. Returns null when no SMTP is set up. */
export function makeMailer(env = process.env) {
  if (!env.SMTP_HOST) return null;
  let t;
  return {
    async send({ to, subject, text, html, headers }) {
      if (!t) { const { default: nodemailer } = await import('nodemailer'); t = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === '1' || Number(env.SMTP_PORT) === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined }); }
      await t.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text, html, headers });
    },
  };
}

/** Web push sender. Needs HTTPS in the browser; keys are created once and kept in settings. */
export function makePusher(settings, env = process.env) {
  let wp; let ready = false;
  async function init() {
    if (ready) return wp;
    wp = (await import('web-push')).default;
    let keys = env.MOCKDESK_VAPID_PUBLIC && env.MOCKDESK_VAPID_PRIVATE ? { publicKey: env.MOCKDESK_VAPID_PUBLIC, privateKey: env.MOCKDESK_VAPID_PRIVATE } : settings.get('vapid');
    if (!keys) keys = settings.set('vapid', wp.generateVAPIDKeys());
    wp.setVapidDetails(env.MOCKDESK_VAPID_SUBJECT || `mailto:${env.MAIL_FROM || 'admin@example.com'}`.replace(/^mailto:.*<(.+)>$/, 'mailto:$1'), keys.publicKey, keys.privateKey);
    ready = keys.publicKey; return wp;
  }
  return {
    async publicKey() { await init(); return ready; },
    async send(sub, payload) { const w = await init(); return w.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 86400 }); },
  };
}

export function createNotifier({ db, now, settings, mailer = null, pusher = null, publicUrl = process.env.MOCKDESK_PUBLIC_URL || '' }) {
  const DAY = 86400000; const base = publicUrl.replace(/\/$/, '');
  const emailDailyCap = () => Number(process.env.MOCKDESK_EMAIL_DAILY_CAP) || 2000;
  const token = (uid) => crypto.createHmac('sha256', settings.secret()).update(`unsub:${uid}`).digest('hex').slice(0, 24);
  const unsubUrl = (uid) => `${base}/api/unsubscribe?u=${uid}&t=${token(uid)}`;
  const tokenOk = (uid, t) => { const a = Buffer.from(token(uid)); const b = Buffer.from(String(t || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const log = (userId, channel, kind, ref, status, error = null) => { try { db.prepare('INSERT OR IGNORE INTO deliveries(user_id,channel,kind,ref,status,error,at) VALUES (?,?,?,?,?,?,?)').run(userId, channel, kind, ref || null, status, error && String(error).slice(0, 200), now()); } catch { /* logging must never break sending */ } };
  const weeklyUsed = (uid) => db.prepare("SELECT COUNT(*) c FROM deliveries WHERE user_id=? AND status='sent' AND channel IN ('push','email') AND kind!='announcement' AND at>?").get(uid, now() - 7 * DAY).c;
  const emailsToday = () => db.prepare("SELECT COUNT(*) c FROM deliveries WHERE channel='email' AND status='sent' AND at>?").get(now() - DAY).c;

  /**
   * Send one notification to one person. `channels` says which routes are allowed; their own preferences and limits still apply.
   * Returns what happened per channel. A repeat with the same `ref` does nothing.
   */
  async function notify(userId, { kind, title, body = '', link = '/', ref = null, channels = {}, capped = true }) {
    const ch = { inapp: true, push: true, email: true, ...channels };
    const u = db.prepare('SELECT id, name, email, status, notify_prefs FROM users WHERE id=?').get(userId);
    if (!u || u.status === 'suspended') return { skipped: 'no such active user' };
    const prefs = prefsOf(u); const out = {};
    if (ch.inapp && prefs.inapp) {
      const r = db.prepare('INSERT OR IGNORE INTO notifications(user_id,kind,title,body,link,created_at,ref) VALUES (?,?,?,?,?,?,?)').run(userId, kind, title, body, link, now(), ref);
      if (!r.changes) return { duplicate: true };
      out.inapp = 'sent';
    } else if (ref && db.prepare('SELECT 1 FROM deliveries WHERE user_id=? AND ref=?').get(userId, ref)) return { duplicate: true };
    const overCap = capped && weeklyUsed(userId) >= (settings.get('reminders', {}).weeklyCap ?? 4);
    if (ch.push && prefs.push) {
      const subs = pusher ? db.prepare('SELECT * FROM push_subs WHERE user_id=?').all(userId) : [];
      if (!subs.length) out.push = 'none';
      else if (overCap) { out.push = 'skipped'; log(userId, 'push', kind, ref, 'skipped', 'weekly limit'); }
      else {
        let ok = 0; let last = '';
        for (const s of subs) {
          try { await pusher.send(s, { title, body, url: link || '/', tag: ref || kind }); ok++; } catch (e) { last = e?.message || String(e); if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(s.endpoint); }
        }
        out.push = ok ? 'sent' : 'failed'; log(userId, 'push', kind, ref, ok ? 'sent' : 'failed', ok ? null : last);
      }
    }
    if (ch.email && prefs.email && u.email) {
      if (!mailer) { out.email = 'not configured'; log(userId, 'email', kind, ref, 'skipped', 'email not set up'); }
      else if (overCap) { out.email = 'skipped'; log(userId, 'email', kind, ref, 'skipped', 'weekly limit'); }
      else if (emailsToday() >= emailDailyCap()) { out.email = 'skipped'; log(userId, 'email', kind, ref, 'skipped', 'daily email cap'); }
      else {
        const url = `${base}${link || '/'}`; const un = unsubUrl(userId);
        try {
          await mailer.send({ to: u.email, subject: title, text: `${body}\n\n${base ? url : ''}\n\nStop these emails: ${un}`, headers: { 'List-Unsubscribe': `<${un}>` },
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2 style="margin:0 0 8px">${esc(title)}</h2><p style="font-size:16px;line-height:1.5">${esc(body)}</p>${base ? `<p><a href="${esc(url)}" style="background:#1e3a8a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open MockDesk</a></p>` : ''}<p style="color:#64748b;font-size:12px">You get this because you have a MockDesk account. <a href="${esc(un)}">Stop these emails</a>.</p></div>` });
          out.email = 'sent'; log(userId, 'email', kind, ref, 'sent');
        } catch (e) { out.email = 'failed'; log(userId, 'email', kind, ref, 'failed', e?.message); }
      }
    }
    return out;
  }
  /** Run `fn` over items a few at a time so one slow mail server does not stall everything. */
  async function pool(items, size, fn) { let i = 0; const run = async () => { while (i < items.length) { const k = items[i++]; await fn(k); } }; await Promise.all(Array.from({ length: Math.min(size, items.length) }, run)); }
  return { notify, pool, token, tokenOk, unsubUrl, hasMailer: !!mailer, hasPush: !!pusher, emailDailyCap };
}
