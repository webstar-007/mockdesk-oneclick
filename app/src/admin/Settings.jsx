import { useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, Pager, dt, toast, useLoad } from './ui.jsx';

const LV = { info: 'Information', warn: 'Warning', good: 'Good news' };
export default function Settings() {
  const [tab, setTab] = useState('ann');
  return (<>
    <PageHead title="Settings" sub="Announcements, the exam pattern and the activity log." />
    <div className="ad-tabs" role="tablist">{[['ann', 'Announcements'], ['adm', 'Administrators'], ['pat', 'Exam pattern'], ['dat', 'Data & backup'], ['aud', 'Audit log']].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
    {tab === 'ann' && <Ann />}{tab === 'adm' && <Admins />}{tab === 'dat' && <DataTab />}{tab === 'pat' && <Pattern />}{tab === 'aud' && <Audit />}
  </>);
}
function Ann() {
  const { data, err, loading, reload } = useLoad('/admin/announcements'); const [text, setText] = useState(''); const [level, setLevel] = useState('info');
  const post = async () => { try { await api.post('/admin/announcements', { text, level }); setText(''); toast('Announcement is live'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  const patch = async (a, b, ok) => { try { await api.patch(`/admin/announcements/${a.id}`, b); toast(ok); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <div className="ad-grid g-main">
      <section className="card"><h3>Past and current announcements</h3><Err>{err}</Err>{loading && !data ? <Loading /> : !data?.announcements.length ? <Empty>No announcements yet.</Empty> : <div className="ad-qlist">{data.announcements.map((a) => <div key={a.id} className={`ad-q ${a.active ? '' : 'ad-dim'}`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><div><p>{a.text}</p><small><Badge tone={a.level === 'warn' ? 'warn' : a.level === 'good' ? 'good' : 'brand'}>{LV[a.level]}</Badge> {dt(a.createdAt)} · {a.active ? 'shown to students' : 'hidden'}</small></div><div className="ad-q-act"><button className="btn btn-ghost btn-sm" onClick={() => patch(a, { active: !a.active }, a.active ? 'Hidden' : 'Shown')}>{a.active ? 'Hide' : 'Show'}</button><button className="btn btn-ghost btn-sm dng" onClick={async () => { await api.del(`/admin/announcements/${a.id}`); toast('Deleted'); reload(); }}>Delete</button></div></div>)}</div>}</section>
      <section className="card"><h3>New announcement</h3><p className="small muted">Appears as a banner on every student page. Students can dismiss it.</p>
        <label className="ad-field">Message<textarea rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Mock 6 is live. Good luck!" /><small>{text.length}/300</small></label>
        <div className="ad-pill-row" style={{ marginBottom: 12 }}>{Object.entries(LV).map(([k, n]) => <button key={k} className={`ad-pill ${level === k ? 'on' : ''}`} onClick={() => setLevel(k)}>{n}</button>)}</div>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={post}>Publish announcement</button></section>
    </div>
  );
}
function Pattern() {
  const { data: d, err, loading } = useLoad('/admin/pattern'); if (loading) return <Loading />; if (err) return <Err>{err}</Err>;
  return (
    <div className="ad-grid g2">
      <section className="card"><h3>{d.exam.name}</h3><dl className="ad-kv">{Object.entries(d.sections).map(([k, s]) => <><dt key={k + 'a'}>{s.name}</dt><dd key={k + 'b'}>{s.questions} q · +{s.marksPerQuestion}/−{s.negativeMarks}{s.qualifying ? ` · qualifying ${s.qualifyingMarks}` : ''}</dd></>)}</dl></section>
      <section className="card"><h3>Timing and facts</h3><dl className="ad-kv">{d.segments.map((g) => <><dt key={g.id + 'a'}>{g.sections.map((x) => d.sections[x].short).join(' + ')}</dt><dd key={g.id + 'b'}>{g.minutes} min</dd></>)}<dt>Options per question</dt><dd>{d.optionsPerQuestion}</dd><dt>Uploaded images</dt><dd>{d.uploads}</dd></dl>
        <h4 style={{ marginTop: 16 }}>Admins</h4><ul style={{ margin: 0, paddingLeft: 18 }}>{d.admins.map((a) => <li key={a.email}>{a.name} <small className="muted">{a.email}</small></li>)}</ul>
        <p className="small muted" style={{ marginTop: 14 }}>The pattern itself lives in <code>config/exam.config.js</code> and is applied to every mock, the timer, scoring and results. Edit that file and restart the server when SSC changes the paper.</p></section>
    </div>
  );
}
function Admins() {
  const { data: d, err, loading } = useLoad('/admin/pattern'); if (loading) return <Loading />; if (err) return <Err>{err}</Err>;
  const e = d.adminEntries;
  return (
    <div className="ad-grid g2">
      <section className="card"><h3>Admins and editors</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{d.admins.map((a) => <li key={a.email}>{a.name} <small className="muted">{a.email}</small> <Badge tone={a.role === 'admin' ? 'brand' : 'warn'}>{a.role}</Badge></li>)}</ul><p className="small muted" style={{ marginTop: 12 }}>Change a role from Users → the user → Change role. Admins can do everything. Editors can only manage mocks, questions and reports, and cannot see student data.</p></section>
      <section className="card"><h3>The admins.txt file</h3><p className="small">Open <code>admins.txt</code> in the MockDesk folder and paste emails or mobile numbers, one per line. Those people become admins the next time they sign in or sign up. Add the word <code>editor</code> after a line (for example <code>teacher@gmail.com editor</code>) to give content rights only.</p><p className="small muted">File location: <code>{d.adminsFile}</code></p>
        <h4>Listed in the file now</h4>{e.emails.length + e.phones.length + e.editorEmails.length + e.editorPhones.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{[...e.emails, ...e.phones].map((x) => <li key={x}>{x} <Badge tone="brand">admin</Badge></li>)}{[...e.editorEmails, ...e.editorPhones].map((x) => <li key={x}>{x} <Badge tone="warn">editor</Badge></li>)}</ul> : <p className="small muted">Nothing yet.</p>}
        {e.ignored.length > 0 && <div className="ad-check warn" style={{ marginTop: 10 }}><b>Could not read these lines</b><ul>{e.ignored.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <p className="small muted" style={{ marginTop: 12 }}>Removing a line later does not take rights away. Use Remove admin rights on the user page for that.</p></section>
    </div>
  );
}
function DataTab() {
  return (<div className="ad-grid g2"><section className="card"><h3>Download a backup</h3><p className="small">A complete copy of the database: users, attempts, mocks, questions and reports. Keep it somewhere safe. Uploaded images live in <code>data/uploads</code> and need copying separately.</p><a className="btn btn-primary" href="/api/admin/backup" download>⬇ Download database backup</a></section><section className="card"><h3>Export lists</h3><p className="small">Students, attempts and each mock’s questions can be exported as CSV from their own pages.</p><p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn btn-ghost btn-sm" href="/api/admin/users.csv" download>Users CSV</a><a className="btn btn-ghost btn-sm" href="/api/admin/attempts.csv" download>Attempts CSV</a></p></section></div>);
}
function Audit() {
  const [page, setPage] = useState(1); const { data, err, loading } = useLoad(`/admin/audit?page=${page}&size=40`, [page]);
  return (<><Err>{err}</Err><div className="card nopad">{loading && !data ? <Loading /> : !data?.entries.length ? <Empty>No activity recorded yet.</Empty> : <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>{data.entries.map((e) => <tr key={e.id}><td>{dt(e.at)}</td><td>{e.admin}</td><td><Badge tone="brand">{e.action.replace(/_/g, ' ')}</Badge></td><td>{e.target}</td><td className="muted">{e.detail}</td></tr>)}</tbody></table></div>}{data && <Pager page={page} size={40} total={data.total} onPage={setPage} />}</div></>);
}
