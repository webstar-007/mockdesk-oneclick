import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, Stat, ago, dt, toast, useLoad } from './ui.jsx';

const mb = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const dot = { ok: '✅', warn: '🟠', bad: '🔴' };
export default function System() {
  const { data: d, err, loading, reload } = useLoad('/admin/system'); const [busy, setBusy] = useState(false); const [dbmsg, setDbmsg] = useState('');
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const act = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const used = d.disk ? Math.round(((d.disk.total - d.disk.free) / d.disk.total) * 100) : null;
  const worst = d.checks.some((c) => c.level === 'bad') ? 'bad' : d.checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  return (
    <>
      <PageHead title="System" sub="Is the server healthy? Updates every 30 seconds.">
        <button className="btn btn-ghost" onClick={reload}>↻ Refresh</button>
        <a className="btn btn-primary" href="/api/admin/backup">⬇ Download backup</a>
      </PageHead>
      <div className={`ad-banner ${worst}`} role="status">{worst === 'ok' ? '✅ Everything looks fine.' : worst === 'warn' ? '🟠 A few things need attention.' : '🔴 Something needs fixing now.'}</div>
      <div className="ad-grid g4">
        <Stat icon="⏱" label="Uptime" value={dur(d.uptimeSec)} sub={`Started ${dt(d.startedAt)}`} />
        <Stat icon="🗄" label="Database" value={mb(d.db.bytes + d.db.walBytes)} sub={`${d.counts.students} students · ${d.counts.attempts} attempts`} />
        <Stat icon="💽" tone={used > 85 ? 'bad' : used > 70 ? 'warn' : ''} label="Disk used" value={used == null ? '–' : `${used}%`} sub={d.disk ? `${mb(d.disk.free)} free of ${mb(d.disk.total)}` : 'Not available here'} />
        <Stat icon="🖼" label="Uploaded images" value={d.uploads.files} sub={mb(d.uploads.bytes)} />
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Checks</h3>
          <ul className="ad-checks">{d.checks.map((c) => <li key={c.name}><span aria-hidden="true">{dot[c.level]}</span><div><b>{c.name}</b><br /><small className="muted">{c.detail}</small></div></li>)}</ul></section>
        <section className="card"><h3>Server</h3>
          <dl className="ad-dl"><dt>Mode</dt><dd>{d.env} {d.https ? <Badge tone="good">HTTPS</Badge> : <Badge tone="warn">HTTP</Badge>}</dd><dt>Node.js</dt><dd>{d.node}</dd><dt>App memory</dt><dd>{mb(d.memory.rss)} of {mb(d.memory.total)} ({mb(d.memory.free)} free)</dd><dt>CPU load</dt><dd>{d.load.map((x) => x.toFixed(2)).join(' · ')} <small className="muted">(1, 5, 15 min)</small></dd><dt>Active sessions</dt><dd>{d.counts.sessions}</dd><dt>Tests running</dt><dd>{d.counts.inProgress}</dd><dt>Last backup download</dt><dd>{d.lastBackupAt ? ago(d.lastBackupAt) : 'never'}</dd><dt>Sign-in codes</dt><dd>{d.otp.email || d.otp.sms ? [d.otp.email && 'Email', d.otp.sms].filter(Boolean).join(' + ') : 'Printed in the log (test mode)'}</dd></dl>
          <div className="ad-pill-row"><button className="btn btn-ghost" disabled={busy} onClick={() => act(async () => { const r = await api.post('/admin/system/check-db'); setDbmsg(r.ok ? '✅ Database is healthy' : '🔴 ' + r.message); })}>Run database check</button>{dbmsg && <span className="small">{dbmsg}</span>}</div></section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="ad-sec-head"><h3 style={{ margin: 0 }}>Recent server problems</h3><span className="small muted">{d.errorCounts.hour} in the last hour · {d.errorCounts.day} in 24 h · kept until the server restarts</span>{d.errors.length > 0 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api.post('/admin/system/clear-errors'), 'Cleared')}>Clear</button>}</div>
        {d.errors.length ? <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>When</th><th>Where</th><th>What happened</th></tr></thead><tbody>{d.errors.map((e, i) => <tr key={i}><td><small>{ago(e.at)}</small></td><td><Badge tone={e.source === 'server' ? 'bad' : 'warn'}>{e.source}</Badge></td><td><small>{e.message}</small></td></tr>)}</tbody></table></div> : <Empty>No problems since the server started. 🎉</Empty>}
        <p className="small muted" style={{ marginBottom: 0 }}>Full history: the server log. On the AWS setup run the Jenkins <code>logs</code> action.</p>
      </section>
    </>
  );
}
