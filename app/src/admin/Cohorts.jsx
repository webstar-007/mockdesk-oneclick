import { useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Dialog, Empty, Err, Loading, PageHead, Stat, dOnly, toast, useLoad } from './ui.jsx';

function Nudge({ seg, onClose, onDone }) {
  const [title, setTitle] = useState(seg.title); const [body, setBody] = useState(seg.body); const [link, setLink] = useState('/'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async () => { setBusy(true); setErr(''); try { const r = await api.post('/admin/cohorts/nudge', { segment: seg.key, title, body, link }); toast(`Sent to ${r.sent} of ${r.audience} students`); onDone(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Dialog title={`Message: ${seg.label}`} onClose={onClose}>
      <p className="small muted">Goes to {seg.count} student{seg.count === 1 ? '' : 's'} as an in-app notice and a push if they allowed it. Each student gets at most one of these per day.</p>
      <Err>{err}</Err>
      <label className="ad-field">Title<input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="ad-field">Message<textarea rows={3} maxLength={200} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <label className="ad-field">Opens this page<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/" /></label>
      <div className="ad-actions"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !seg.count} onClick={send}>{busy ? 'Sending…' : `Send to ${seg.count}`}</button></div>
    </Dialog>
  );
}

export default function Cohorts() {
  const { data: d, err, loading, reload } = useLoad('/admin/cohorts');
  const [seg, setSeg] = useState(null);
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const max = Math.max(1, d.funnel[0].n);
  return (
    <>
      <PageHead title="Cohorts" sub="Where new students drop off, and who is worth a nudge."><button className="btn btn-ghost" onClick={reload}>↻ Refresh</button></PageHead>
      <div className="ad-grid g4">
        <Stat icon="👥" label="Students" value={d.total} />
        <Stat icon="🟢" tone="good" label="Started a test in 7 days" value={d.activeLast7} />
        <Stat icon="✎" label="Finished at least one" value={d.funnel[2].n} sub={`${d.funnel[2].pctOfAll}% of all`} />
        <Stat icon="🔁" label="Finished three or more" value={d.funnel[4].n} sub={`${d.funnel[4].pctOfAll}% of all`} />
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Funnel</h3>
        <ol className="co-funnel">{d.funnel.map((s) => <li key={s.label}><span className="co-l">{s.label}</span><span className="co-bar"><i style={{ width: `${Math.max(2, (s.n / max) * 100)}%` }} /></span><b>{s.n}</b><small>{s.pctOfPrev}% of previous</small></li>)}</ol>
      </section>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Win-back groups</h3>
        <div className="co-segs">{d.segments.map((s) => (
          <div key={s.key} className="co-seg"><div><b>{s.label}</b> <Badge tone={s.count ? 'warn' : 'mute'}>{s.count}</Badge><p className="small muted">{s.hint}</p>{s.sample.length > 0 && <p className="small">{s.sample.join(', ')}{s.count > s.sample.length ? '…' : ''}</p>}</div>
            <button className="btn btn-primary btn-sm" disabled={!s.count} onClick={() => setSeg(s)}>Send a nudge</button></div>
        ))}</div>
      </section>
      <section className="card nopad" style={{ marginTop: 14 }}>
        <div style={{ padding: '14px 16px 0' }}><h3>Weekly signup cohorts</h3><p className="small muted">Share of each cohort that started a test in week 1, 2, 3… after joining. Blank means too few students have been around that long.</p></div>
        {d.weeks.some((w) => w.size) ? <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>Joined week ending</th><th>Students</th><th>Finished one</th><th>Week 1</th><th>Week 2</th><th>Week 3</th><th>Week 4</th><th>Week 5</th></tr></thead>
          <tbody>{d.weeks.map((w) => <tr key={w.to}><td>{dOnly(w.to)}</td><td>{w.size}</td><td>{w.size ? `${w.finished}%` : '–'}</td>{w.active.map((a, i) => <td key={i}>{a == null ? '–' : <span className="co-cell" style={{ '--v': a }}>{a}%</span>}</td>)}</tr>)}</tbody></table></div> : <Empty>No signups in the last 8 weeks.</Empty>}
      </section>
      {seg && <Nudge seg={seg} onClose={() => setSeg(null)} onDone={reload} />}
    </>
  );
}
