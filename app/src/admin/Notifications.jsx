import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Err, Loading, PageHead, Stat, dt, toast, useLoad } from './ui.jsx';

const hr = (h) => `${String(h).padStart(2, '0')}:00`;
export default function Notifications() {
  const { data, err, loading, reload } = useLoad('/admin/notifications'); const [c, setC] = useState(null); const [busy, setBusy] = useState(false); const [run, setRun] = useState(null);
  useEffect(() => { if (data && !c) setC(JSON.parse(JSON.stringify(data.config))); }, [data]); // eslint-disable-line
  if ((loading && !data) || !c) return <><Err>{err}</Err><Loading /></>;
  const up = (path, v) => setC((x) => { const n = JSON.parse(JSON.stringify(x)); let o = n; const ks = path.split('.'); ks.slice(0, -1).forEach((k) => { o = o[k]; }); o[ks.at(-1)] = v; return n; });
  const save = async () => { setBusy(true); try { await api.put('/admin/notifications/config', c); toast('Saved'); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const runNow = async () => { if (!window.confirm('Send reminders now to everyone who is due one? Quiet hours are ignored.')) return; setBusy(true); try { const r = await api.post('/admin/notifications/run'); setRun(r); toast('Reminders sent'); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const test = async () => { try { const r = await api.post('/admin/notifications/test'); toast(`Test sent to you: ${Object.entries(r.result).map(([k, v]) => `${k} ${v}`).join(', ')}`); } catch (e) { toast(e.message, 'bad'); } };
  const f = data.flags; const st = data.stats; const pv = data.preview?.rules || {};
  const rules = [
    ['inactive', 'Haven’t practised', `“It has been N days since you practised”`, <span>Send after <input className="num" type="number" min="2" max="60" value={c.inactive.days} onChange={(e) => up('inactive.days', Number(e.target.value))} /> days without a test, then at most every <input className="num" type="number" min="2" max="60" value={c.inactive.repeatDays} onChange={(e) => up('inactive.repeatDays', Number(e.target.value))} /> days.</span>],
    ['welcome', 'New student nudge', '“Ready for your first mock?”', <span>Send <input className="num" type="number" min="1" max="14" value={c.welcome.days} onChange={(e) => up('welcome.days', Number(e.target.value))} /> days after sign-up if they have not started a mock. Once only.</span>],
    ['mockSoon', 'Live mock reminder', '“Mock 6 opens tomorrow at 10:00 AM”', <span>Send <input className="num wide" value={c.mockSoon.hours.join(', ')} onChange={(e) => up('mockSoon.hours', e.target.value.split(/[ ,]+/).map(Number).filter(Boolean))} /> hours before a mock’s release time. Uses the “Available from” time of each mock.</span>],
  ];
  return (
    <>
      <PageHead title="Notifications" sub="Automatic reminders by push and email. Push is free. Email costs about $0.10 per 1,000."><button className="btn btn-ghost" onClick={test}>Send me a test</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save settings</button></PageHead>
      <Err>{err}</Err>
      <div className="ad-grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Push subscribers" value={data.subscribers.push} sub={`of ${data.subscribers.students} students`} icon="🔔" />
        <Stat label="Emails sent, 30 days" value={st.email.sent} sub={`about $${st.emailCostUsd.toFixed(2)}`} icon="✉" />
        <Stat label="Push sent, 30 days" value={st.push.sent} sub={st.push.failed ? `${st.push.failed} failed` : 'free'} icon="📲" tone={st.push.failed ? 'warn' : ''} />
        <Stat label="Turned email off" value={data.subscribers.emailOff} icon="🚫" />
      </div>
      <div className="ad-grid g2">
        <section className="card"><h3>Channels</h3>
          <ul className="ntf-flags">
            <li><Badge tone={f.pushReady ? 'good' : 'warn'}>{f.pushReady ? 'ready' : 'unavailable'}</Badge> Push notifications. Students can turn them on from their profile, and only over https.</li>
            <li><Badge tone={f.emailReady ? 'good' : 'warn'}>{f.emailReady ? 'ready' : 'not set up'}</Badge> Email. {f.emailReady ? `Capped at ${f.emailDailyCap} a day.` : 'Add the SMTP settings (SMTP_HOST, SMTP_USER and so on) to the server settings file, the same ones used for email sign-in codes.'}</li>
            <li><Badge tone={f.publicUrl ? 'good' : 'warn'}>{f.publicUrl ? 'set' : 'missing'}</Badge> Site address (MOCKDESK_PUBLIC_URL) so email buttons link to the right place.</li>
          </ul>
          <label className="check"><input type="checkbox" checked={c.channels.push} onChange={(e) => up('channels.push', e.target.checked)} /><span>Send reminders by push</span></label>
          <label className="check"><input type="checkbox" checked={c.channels.email} onChange={(e) => up('channels.email', e.target.checked)} /><span>Send reminders by email</span></label>
          <div className="ad-row" style={{ marginTop: 10 }}>
            <label className="ad-field">Most reminders per student per week<input type="number" min="1" max="20" value={c.weeklyCap} onChange={(e) => up('weeklyCap', Number(e.target.value))} /></label>
            <label className="ad-field">Quiet hours ({f.tz})<span className="ntf-quiet"><select value={c.quietFrom} onChange={(e) => up('quietFrom', Number(e.target.value))} aria-label="Quiet from">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hr(h)}</option>)}</select> to <select value={c.quietTo} onChange={(e) => up('quietTo', Number(e.target.value))} aria-label="Quiet until">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hr(h)}</option>)}</select></span></label>
          </div>
          <p className="small muted">In-app messages are always saved to the student’s bell. The limits above apply to push and email only.</p>
        </section>
        <section className="card"><h3>Automatic reminders</h3>
          {rules.map(([k, name, ex, ctl]) => (
            <div className="ntf-rule" key={k}>
              <label className="check"><input type="checkbox" checked={c[k].enabled} onChange={(e) => up(`${k}.enabled`, e.target.checked)} /><span><b>{name}</b><small className="muted" style={{ display: 'block' }}>{ex}</small></span></label>
              <div className="small">{ctl}</div>
              <p className="small muted">{pv[k] ? `${pv[k].eligible} student${pv[k].eligible === 1 ? '' : 's'} would get this on the next run.` : 'Nobody is due right now.'}</p>
            </div>))}
          <p className="small muted">The server checks every 10 minutes. Nobody gets the same reminder twice.</p>
          <button className="btn btn-ghost" onClick={runNow} disabled={busy}>Run reminders now</button>
          {run && <p className="small" role="status">Sent: {Object.entries(run.rules).map(([k, v]) => `${k} ${v.sent}/${v.eligible}`).join(' · ') || 'nothing was due'}.</p>}
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}><h3>Recent failures</h3>
        {!data.failures.length ? <p className="muted small">No failed sends.</p> : <div className="tbl-wrap"><table className="dtable"><thead><tr><th>When</th><th>Student</th><th>Channel</th><th>Reason</th></tr></thead><tbody>{data.failures.map((x, i) => <tr key={i}><td>{dt(x.at)}</td><td>{x.name || '–'}</td><td>{x.channel}</td><td>{x.error}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
