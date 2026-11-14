import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
const pushSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function InviteCard() {
  const [r, setR] = useState(null); const [note, setNote] = useState('');
  useEffect(() => { api.get('/referral').then(setR).catch(() => setR(false)); }, []);
  if (!r || !r.enabled) return null;
  const msg = `Practise the SSC CGL Tier-II paper free on MockDesk. Sign up with my link and we both get a mock unlocked early: ${r.link}`;
  const copy = async () => { try { await navigator.clipboard.writeText(r.link); setNote('Link copied.'); } catch { setNote('Could not copy. Select the link and copy it.'); } };
  const share = async () => { try { if (navigator.share) await navigator.share({ text: msg }); else window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); } catch { /* cancelled */ } };
  return (
    <section className="card pf-wide" id="invite" aria-label="Invite a friend">
      <h2>Invite a friend</h2>
      <p className="muted pf-note">When a friend signs up with your link and finishes their first mock, you both unlock a reward mock early{r.friendsNeeded > 1 ? ` (you need ${r.friendsNeeded} friends each time)` : ''}.</p>
      <div className="inv-row"><code className="inv-code" aria-label="Your invite code">{r.code}</code><input readOnly value={r.link} aria-label="Your invite link" onFocus={(e) => e.target.select()} /></div>
      <div className="pf-actions"><button className="btn btn-primary" onClick={share}>Share invite</button><button className="btn btn-ghost" onClick={copy}>Copy link</button></div>
      <p className="small muted">{r.joined} joined · {r.qualified} finished a mock{r.qualified > 0 || r.joined > 0 ? ` · ${r.toNext} more for your next reward` : ''}</p>
      {r.rewards.length > 0 && <ul className="inv-rw">{r.rewards.map((m) => <li key={m.id}><span>{m.name}</span><b className={m.unlocked ? 'ok' : ''}>{m.unlocked ? 'Unlocked' : 'Locked'}</b></li>)}</ul>}
      {note && <p className="okmsg" role="status">{note}</p>}
    </section>
  );
}

export function NotificationPrefs() {
  const [p, setP] = useState(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => api.get('/notifications/prefs').then(setP).catch(() => setP(false));
  useEffect(() => { load(); }, []);
  if (p === null || p === false) return null;
  const set = async (k, v) => { setMsg(''); try { const r = await api.patch('/notifications/prefs', { [k]: v }); setP((x) => ({ ...x, prefs: r.prefs })); } catch (e) { setMsg(e.message); } };
  const enablePush = async () => {
    setBusy(true); setMsg('');
    try {
      if (!pushSupported()) throw new Error(window.isSecureContext ? 'This browser does not support push notifications.' : 'Push notifications need a secure (https) address.');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings, then try again.');
      const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      const { key } = await api.get('/push/key');
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
      await api.post('/push/subscribe', { subscription: sub.toJSON() }); await set('push', true); load(); setMsg('Push notifications are on for this device.');
    } catch (e) { setMsg(e.message || 'Could not turn on push.'); } finally { setBusy(false); }
  };
  const disablePush = async () => {
    setBusy(true);
    try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); } load(); setMsg('Push notifications are off for this device.'); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const pr = p.prefs;
  return (
    <section className="card" id="notifications" aria-label="Notifications">
      <h2>Reminders and messages</h2>
      <p className="muted pf-note">Choose how MockDesk reaches you about live mocks and practice reminders.</p>
      <label className="check"><input type="checkbox" checked={pr.inapp} onChange={(e) => set('inapp', e.target.checked)} /><span>Show messages inside MockDesk (the bell)</span></label>
      <label className="check"><input type="checkbox" checked={pr.email} disabled={!p.hasEmail} onChange={(e) => set('email', e.target.checked)} /><span>Email reminders{!p.hasEmail && <small className="muted" style={{ display: 'block' }}>Add an email address to your account to get these.</small>}</span></label>
      <div className="ntf-push">
        <span><b>Push notifications on this device</b><small className="muted" style={{ display: 'block' }}>{pushSupported() ? (p.pushSubscribed ? 'On. You will get alerts even when MockDesk is closed.' : 'Get a nudge before a live mock, even when MockDesk is closed.') : window.isSecureContext ? 'This browser does not support push notifications.' : 'Available once the site is opened over https.'}</small></span>
        {pushSupported() && (p.pushSubscribed ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disablePush}>Turn off</button> : <button className="btn btn-primary btn-sm" disabled={busy} onClick={enablePush}>Turn on</button>)}
      </div>
      {msg && <p className="small muted" role="status">{msg}</p>}
    </section>
  );
}

export function MyBatches() {
  const [list, setList] = useState(null); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = () => api.get('/my/batches').then((r) => setList(r.batches)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const join = async (e) => { e.preventDefault(); setErr(''); setOk(''); try { const r = await api.post('/batches/join', { code }); setOk(r.joined ? `You joined ${r.batch.name}.` : `You are already in ${r.batch.name}.`); setCode(''); load(); } catch (x) { setErr(x.message); } };
  const leave = async (b) => { if (!window.confirm(`Leave ${b.name}? Your teacher will stop seeing your results.`)) return; await api.post(`/batches/${b.id}/leave`).catch(() => {}); load(); };
  if (list === null) return null;
  return (
    <section className="card" id="batches" aria-label="Coaching batch">
      <h2>Coaching batch</h2>
      <p className="muted pf-note">If your coaching centre gave you a batch code, enter it here. Your teacher will then see your name, scores and activity. You can leave at any time.</p>
      {list.length > 0 && <ul className="inv-rw">{list.map((b) => <li key={b.id}><span>{b.name}{b.teachers && <small className="muted"> · {b.teachers}</small>}</span><button className="btn btn-ghost btn-sm" onClick={() => leave(b)}>Leave</button></li>)}</ul>}
      <form className="inv-row" onSubmit={join}><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Batch code" maxLength={12} aria-label="Batch code" autoComplete="off" /><button className="btn btn-primary" disabled={code.trim().length < 4}>Join batch</button></form>
      {err && <p className="alert" role="alert">{err}</p>}{ok && <p className="okmsg" role="status">{ok}</p>}
    </section>
  );
}
