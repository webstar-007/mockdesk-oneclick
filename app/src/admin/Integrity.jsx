import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, Pager, Stat, ago, toast, useLoad } from './ui.jsx';

const tone = { high: 'bad', medium: 'warn', low: 'mute' };
export default function Integrity() {
  const [level, setLevel] = useState('medium'); const [days, setDays] = useState(30); const [rev, setRev] = useState(false); const [page, setPage] = useState(1);
  const { data: d, err, loading, reload } = useLoad(`/admin/integrity?level=${level}&days=${days}&reviewed=${rev ? 1 : 0}&page=${page}&size=25`);
  const mark = async (a) => { try { await api.patch(`/admin/integrity/${a.id}`, { reviewed: !a.reviewed }); toast(a.reviewed ? 'Reopened' : 'Marked as reviewed'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const s = d.summary;
  return (
    <>
      <PageHead title="Integrity" sub="Attempts that look unusual. A flag is a reason to look, not proof of cheating." />
      <div className="ad-grid g4">
        <Stat icon="🔴" tone={s.high ? 'bad' : ''} label="High" value={s.high} sub="Strong signals" />
        <Stat icon="🟠" tone={s.medium ? 'warn' : ''} label="Medium" value={s.medium} sub="Worth a look" />
        <Stat icon="⚪" label="Low" value={s.low} sub="Minor" />
        <Stat icon="🔎" label="Attempts checked" value={s.checked} sub={`Last ${s.days} days`} />
      </div>
      <div className="card nopad" style={{ marginTop: 14 }}>
        <div className="ad-toolbar" style={{ padding: '12px 14px' }}>
          <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} aria-label="Level"><option value="high">High only</option><option value="medium">Medium and above</option><option value="low">Everything</option></select>
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }} aria-label="Period"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select>
          <label className="ad-chk"><input type="checkbox" checked={rev} onChange={(e) => { setRev(e.target.checked); setPage(1); }} /> Include reviewed</label>
        </div>
        {!d.attempts.length ? <Empty>{s.checked ? 'Nothing flagged at this level. 🎉' : 'No attempts in this period yet.'}</Empty> : <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>Student</th><th>Why it was flagged</th><th>Mock</th><th className="num">Score</th><th className="num">Left test</th><th>When</th><th /></tr></thead>
          <tbody>{d.attempts.map((a) => (
            <tr key={a.id} className={a.reviewed ? 'ad-dim' : ''}>
              <td className="nm"><Link to={`/admin/users/${a.userId}`}><b>{a.user}</b></Link><small style={{ display: "block" }}>{a.contact}</small></td>
              <td><div className="ad-flags">{a.flags.map((f) => <Badge key={f.code} tone={tone[f.level]}>{f.label}</Badge>)}</div></td>
              <td>{a.mockName}{a.status === 'in_progress' && <> <Badge tone="brand">in progress</Badge></>}</td>
              <td className="num">{a.score == null ? '–' : `${a.score}/${a.max}`}</td>
              <td className="num">{a.leaves}{a.fsExits ? <small className="muted"> · fs {a.fsExits}</small> : null}</td>
              <td><small>{ago(a.submittedAt || a.startedAt)}</small></td>
              <td style={{ whiteSpace: 'nowrap' }}><Link className="btn btn-ghost btn-sm" to={`/admin/attempts/${a.id}`}>Open</Link> <button className="btn btn-ghost btn-sm" onClick={() => mark(a)}>{a.reviewed ? 'Reopen' : 'Mark reviewed'}</button></td>
            </tr>))}</tbody></table></div>}
        <Pager page={page} size={25} total={d.total} onPage={setPage} />
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Shared network addresses</h3>
          {d.sharedIps.length ? <ul className="ad-timeline">{d.sharedIps.map((g) => <li key={g.ip}><div><b>{g.ip}</b> <small className="muted">{g.users.length} accounts</small><br />{g.users.map((u, i) => <span key={u.id}>{i ? ', ' : ''}<Link to={`/admin/users/${u.id}`}>{u.name}</Link></span>)}</div></li>)}</ul> : <Empty>No address is used by 3 or more accounts.</Empty>}
          <p className="small muted" style={{ marginBottom: 0 }}>Colleges and coaching centres share one address, so this alone proves nothing.</p></section>
        <section className="card"><h3>How flags work</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>Left the test</b>: tab or app switches during the test (4+ medium, 10+ high).</li>
            <li><b>Fullscreen exits</b>: 3 or more.</li>
            <li><b>Speed</b>: 30+ answers at under 10 s each (under 6 s is high).</li>
            <li><b>Accuracy and speed</b>: 90%+ correct at under 20 s per question.</li>
            <li><b>Shared address</b>: 3 or more accounts on one network address.</li>
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>Mark an attempt as reviewed to hide it from this list.</p></section>
      </div>
    </>
  );
}
