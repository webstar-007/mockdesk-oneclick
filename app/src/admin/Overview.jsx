import { Link } from 'react-router-dom';
import { Badge, Bars, Empty, Err, Loading, PageHead, Stat, ago, dayLabel, statusTone, useLoad } from './ui.jsx';

export default function Overview() {
  const { data: d, err, loading, reload } = useLoad('/admin/overview');
  if (loading && !d) return <Loading />;
  if (err) return <Err>{err}</Err>;
  const t = d.totals;
  const Delta = ({ c, what = 'yesterday' }) => { const diff = c.today - c.yesterday; if (!c.today && !c.yesterday) return null; return <span className={`ad-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`} title={`${c.today} today, ${c.yesterday} ${what}`}>{diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} vs {what}</span>; };
  const hrs = d.hours.map((n, h) => ({ label: `${String(h).padStart(2, '0')}:00`, short: String(h).padStart(2, '0'), n }));
  const peak = d.hours.indexOf(Math.max(...d.hours));
  const todo = [t.openReports > 0 && { tone: 'warn', to: '/admin/reports', text: `${t.openReports} student report${t.openReports > 1 ? 's' : ''} to review` }, d.flagged.length > 0 && { tone: 'bad', to: '/admin/bank', text: `${d.flagged.length} question${d.flagged.length > 1 ? 's' : ''} almost nobody answers correctly` }, t.mocksDraft > 0 && { tone: 'warn', to: '/admin/mocks', text: `${t.mocksDraft} draft mock${t.mocksDraft > 1 ? 's' : ''} not yet published` }, t.suspended > 0 && { tone: 'mute', to: '/admin/users', text: `${t.suspended} suspended account${t.suspended > 1 ? 's' : ''}` }, t.liveNow > 0 && { tone: 'good', to: '/admin/live', text: `${t.liveNow} student${t.liveNow > 1 ? 's are' : ' is'} taking a test right now` }].filter(Boolean);
  return (
    <>
      <PageHead title="Overview" sub="Everything happening on the platform, at a glance."><button className="btn btn-ghost" onClick={reload}>↻ Refresh</button><Link className="btn btn-primary" to="/admin/mocks">＋ New mock</Link></PageHead>
      <div className="ad-grid g-main" style={{ marginBottom: 14 }}>
        <section className="card"><h3>Needs your attention</h3>{todo.length ? <ul className="plain" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>{todo.map((x) => <li key={x.text}><Link to={x.to} style={{ textDecoration: 'none' }}><span className={`ad-badge b-${x.tone}`}>{x.tone === 'good' ? 'live' : x.tone === 'mute' ? 'info' : 'action'}</span> {x.text} →</Link></li>)}</ul> : <p className="muted" style={{ margin: 0 }}>✓ All clear. Nothing needs you right now.</p>}</section>
        <section className="card"><h3>Quick actions</h3><div className="ad-pill-row"><Link className="btn btn-primary btn-sm" to="/admin/mocks">＋ New mock</Link><Link className="btn btn-ghost btn-sm" to="/admin/bank">＋ Add question</Link><Link className="btn btn-ghost btn-sm" to="/admin/live">Live tests</Link><Link className="btn btn-ghost btn-sm" to="/admin/settings">Announcement</Link></div></section>
      </div>
      <div className="ad-grid g4">
        <Stat icon="👥" label="Total students" value={t.users} sub={<>{`+${t.newWeek} this week · +${t.newToday} today`}<Delta c={d.compare.signups} /></>} />
        <Stat icon="🟢" tone="good" label="Active in 24 h" value={t.active24h} sub={`${t.liveNow} in a test right now`} />
        <Stat icon="✎" label="Tests started" value={t.attempts} sub={<>{`${t.completed} finished · ${t.today} today`}<Delta c={d.compare.attempts} /></>} />
        <Stat icon="🎯" label="Average score" value={`${t.avgPct}%`} sub={`Accuracy ${t.avgAccuracy}%`} />
      </div>
      <div className="ad-grid g4" style={{ marginTop: 14 }}>
        <Stat icon="🗂" label="Mocks published" value={t.mocksPublished} sub={`${t.mocksDraft} in draft`} />
        <Stat icon="⚑" tone={t.openReports ? 'warn' : ''} label="Open reports" value={t.openReports} sub={t.openReports ? 'Students flagged questions' : 'Nothing waiting'} />
        <Stat icon="⏱" label="Completion rate" value={t.attempts ? `${Math.round((t.completed / t.attempts) * 100)}%` : '–'} sub="Started → finished" />
        <Stat icon="⚠" tone={d.flagged.length ? 'bad' : ''} label="Questions to review" value={d.flagged.length} sub="Almost nobody gets these right" />
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>New students, last 30 days</h3><Bars title="New students" unit="Signups" data={d.signups.map(dayLabel)} /></section>
        <section className="card"><h3>Tests started, last 30 days</h3><Bars title="Tests started" tone="good" unit="Tests" data={d.attempts.map(dayLabel)} /></section>
      </div>
      <div className="ad-grid g-main" style={{ marginTop: 14 }}>
        <section className="card nopad"><div style={{ padding: '14px 16px 0' }}><h3>Mocks by popularity</h3></div>
          <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>Mock</th><th>Status</th><th>Started</th><th>Finished</th><th>Avg score</th></tr></thead>
            <tbody>{d.popular.map((m) => <tr key={m.id} className="click"><td><Link to={`/admin/mocks/${m.id}`}><b>{m.name}</b></Link></td><td><Badge tone={statusTone[m.status]}>{m.status}</Badge></td><td className="num">{m.attempts}</td><td className="num">{m.completed}</td><td className="num">{m.completed ? `${m.avgPct}%` : '–'}</td></tr>)}</tbody></table></div></section>
        <section className="card"><h3>Recent activity</h3>
          {d.recent.length ? <ul className="ad-timeline">{d.recent.map((a) => <li key={a.id}><div><Link to={`/admin/attempts/${a.id}`}><b>{a.name}</b></Link> {a.status === 'submitted' ? 'finished' : 'started'} <b>{a.mockName}</b><br /><small className="muted">{ago(a.started_at)}</small></div></li>)}</ul> : <Empty>No tests yet.</Empty>}</section>
      </div>
      <div className="ad-grid g3" style={{ marginTop: 14 }}>
        <section className="card"><h3>Top students</h3>
          {d.topStudents.length ? <ol className="ad-rank">{d.topStudents.map((u, i) => <li key={u.id}><span className="n">{i + 1}</span><span className="t"><Link to={`/admin/users/${u.id}`}><b>{u.name}</b></Link><small className="muted">Best {u.score}/{u.max}</small></span><Badge tone="good">{u.pct}%</Badge></li>)}</ol> : <Empty>No finished tests yet.</Empty>}
        </section>
        <section className="card"><h3>When students practise</h3><Bars title="Tests started" unit="Starts" data={hrs} every={4} height={96} /><p className="small muted" style={{ marginBottom: 0 }}>{Math.max(...d.hours) ? <>Busiest hour: <b>{String(peak).padStart(2, '0')}:00</b> (last 14 days, your local time)</> : 'Not enough data yet.'}</p></section>
        <section className="card"><h3>Platform health</h3>
          <div className="ad-health">
            <Link to="/admin/users?segment=never"><b>{d.health.neverStarted}</b><span>never took a test</span></Link>
            <Link to="/admin/users?segment=inactive"><b>{d.health.inactive7}</b><span>inactive 7+ days</span></Link>
            <Link to="/admin/users?status=suspended"><b>{d.health.suspended}</b><span>suspended</span></Link>
            <Link to="/admin/attempts"><b>{d.health.autoSubmitted}</b><span>auto-submitted</span></Link>
            <Link to="/admin/bank"><b>{d.health.questions}</b><span>questions in mocks</span></Link>
            <Link to="/admin/bank"><b>{d.health.bank}</b><span>in the bank</span></Link>
          </div>
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}><h3>Questions worth a second look</h3>
        {d.flagged.length ? <ul className="plain" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>{d.flagged.map((f) => <li key={f.id}><b>{f.pctCorrect}% correct</b> over {f.attempts} attempts · <Link to={`/admin/mocks/${f.mockId}?q=${f.id}`}>{f.text}…</Link></li>)}</ul> : <p className="muted" style={{ margin: 0 }}>None yet. Questions appear here once at least 5 students answered them and fewer than 20% got them right, which can mean a wrong key or a badly worded question.</p>}</section>
    </>
  );
}
