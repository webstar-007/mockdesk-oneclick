import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const ago = (ms) => { if (!ms) return 'never'; const d = Math.floor((Date.now() - ms) / 86400000); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const useGet = (url) => { const [s, set] = useState({ data: null, err: '' }); useEffect(() => { set({ data: null, err: '' }); api.get(url).then((data) => set({ data, err: '' })).catch((e) => set({ data: null, err: e.message })); }, [url]); return s; };
const Bar = ({ v, tone }) => <span className="tc-bar" role="img" aria-label={`${v}%`}><i className={tone} style={{ width: `${Math.max(2, Math.min(100, v))}%` }} /></span>;
const tone = (p) => (p >= 70 ? 'good' : p >= 45 ? 'mid' : 'low');

function Batches() {
  const { data, err } = useGet('/teacher/batches');
  return (<>
    <h1>Your batches</h1>
    {err && <p className="alert" role="alert">{err}</p>}
    {!data ? <p className="muted" role="status">Loading…</p> : !data.batches.length ? <p className="card">You have not been given a batch yet. Ask the MockDesk administrator to add you to one.</p> : (
      <div className="tc-cards">{data.batches.map((b) => (
        <Link key={b.id} className="card tc-card" to={`/teacher/${b.id}`}><h2>{b.name}</h2><dl><div><dt>Students</dt><dd>{b.students}</dd></div><div><dt>Average score</dt><dd>{b.avgPct}%</dd></div><div><dt>Active this week</dt><dd>{b.active7}</dd></div></dl><small className="muted">Join code <code>{b.code}</code></small></Link>))}</div>)}
  </>);
}

function Batch() {
  const { id } = useParams(); const { data, err } = useGet(`/teacher/batches/${id}`); const [q, setQ] = useState(''); const [sort, setSort] = useState('name');
  if (err) return <><Link to="/teacher" className="back">← Batches</Link><p className="alert" role="alert">{err}</p></>;
  if (!data) return <p className="muted" role="status">Loading…</p>;
  const rows = data.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'avg' ? b.avgPct - a.avgPct : sort === 'low' ? a.avgPct - b.avgPct : (b.lastActive || 0) - (a.lastActive || 0)));
  const idle = data.students.filter((s) => s.inactive);
  return (<>
    <Link to="/teacher" className="back">← Batches</Link>
    <div className="pagehead"><div><h1>{data.batch.name}</h1><p className="muted">{data.students.length} students · join code <code>{data.batch.code}</code></p></div><a className="btn btn-ghost" href={`/api/teacher/batches/${id}/export.csv`}>Download CSV</a></div>
    <div className="tc-grid">
      <section className="card"><h2>Mock averages</h2>{!data.perMock.length ? <p className="muted">No one has finished a mock yet.</p> : <ul className="tc-list">{data.perMock.map((m) => <li key={m.mockId}><span>{m.name}<small className="muted"> · {m.finished} finished</small></span><Bar v={m.avgPct} tone={tone(m.avgPct)} /><b>{m.avgPct}%</b></li>)}</ul>}</section>
      <section className="card"><h2>Weakest topics in this batch</h2>{!data.weakTopics.length ? <p className="muted">Shows up once students have answered enough questions.</p> : <ul className="tc-list">{data.weakTopics.map((t) => <li key={t.section + t.topic}><span>{t.topic}<small className="muted"> · {t.total} answers</small></span><Bar v={t.pct} tone={tone(t.pct)} /><b>{t.pct}%</b></li>)}</ul>}</section>
    </div>
    {idle.length > 0 && <p className="card tc-idle"><b>{idle.length} student{idle.length > 1 ? 's' : ''} inactive for 7 days:</b> {idle.map((s) => s.name).join(', ')}</p>}
    <div className="tc-tools"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search students" /><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by"><option value="name">Name</option><option value="avg">Highest average</option><option value="low">Lowest average</option><option value="active">Most recently active</option></select></div>
    <div className="tbl-wrap card nopad"><table className="dtable"><thead><tr><th>Student</th><th>Mocks done</th><th>Average</th><th>Latest</th><th>Since first</th><th>Last active</th></tr></thead>
      <tbody>{rows.map((s) => <tr key={s.id}><th scope="row"><Link to={`/teacher/${id}/${s.id}`}>{s.name}</Link></th><td>{s.mocks}</td><td>{s.mocks ? `${s.avgPct}%` : '–'}</td><td>{s.lastPct != null ? `${s.lastPct}%` : '–'}</td><td className={s.trend > 0 ? 'c-good' : s.trend < 0 ? 'c-bad' : ''}>{s.trend == null ? '–' : `${s.trend > 0 ? '+' : ''}${s.trend}%`}</td><td>{ago(s.lastActive)}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="muted">No students match.</p>}
  </>);
}

function Student() {
  const { id, uid } = useParams(); const { data, err } = useGet(`/teacher/batches/${id}/students/${uid}`);
  if (err) return <><Link to={`/teacher/${id}`} className="back">← Batch</Link><p className="alert" role="alert">{err}</p></>;
  if (!data) return <p className="muted" role="status">Loading…</p>;
  return (<>
    <Link to={`/teacher/${id}`} className="back">← Batch</Link>
    <div className="pagehead"><div><h1>{data.student.name}</h1><p className="muted">{data.student.contact}</p></div></div>
    {data.plain && <section className="plainsum card"><h2>Latest result in plain words</h2><p className="ps-head">{data.plain.headline}</p><ul>{data.plain.points.map((p, i) => <li key={i}>{p}</li>)}</ul></section>}
    <div className="tc-grid">
      <section className="card"><h2>Mocks finished</h2>{!data.attempts.length ? <p className="muted">None yet.</p> : <div className="tbl-wrap"><table className="dtable"><thead><tr><th>Mock</th><th>Score</th><th>Accuracy</th></tr></thead><tbody>{data.attempts.map((a) => <tr key={a.id}><th scope="row">{a.mock}<small className="muted" style={{ display: 'block' }}>{new Date(a.at).toLocaleDateString()}</small></th><td>{a.score}/{a.max} ({a.pct}%)</td><td>{a.accuracy}%</td></tr>)}</tbody></table></div>}</section>
      <section className="card"><h2>Topics, weakest first</h2>{!data.topics.length ? <p className="muted">No topic data yet.</p> : <ul className="tc-list">{data.topics.slice(0, 10).map((t) => <li key={t.section + t.topic}><span>{t.topic}<small className="muted"> · {t.correct}/{t.total}</small></span><Bar v={t.pct} tone={tone(t.pct)} /><b>{t.pct}%</b></li>)}</ul>}</section>
    </div>
  </>);
}

export default function TeacherApp() {
  const { user, logout } = useAuth();
  if (user?.role !== 'teacher') return <Navigate to="/" replace />;
  return (
    <div className="tc">
      <header className="topbar"><div className="topbar-in"><Link to="/teacher" className="brand"><span className="brand-mark" aria-hidden="true">✓</span><span>MockDesk <small className="muted">Teacher</small></span></Link><div className="topbar-user"><ThemeToggle /><span className="who">{user.name}</span><button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button></div></div></header>
      <main className="shell" id="main"><Routes><Route index element={<Batches />} /><Route path=":id" element={<Batch />} /><Route path=":id/:uid" element={<Student />} /><Route path="*" element={<Navigate to="/teacher" replace />} /></Routes></main>
    </div>
  );
}
