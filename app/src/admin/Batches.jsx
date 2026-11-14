import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Dialog, Empty, Err, Loading, PageHead, ago, toast, useLoad } from './ui.jsx';

export function BatchList() {
  const { data, err, loading, reload } = useLoad('/admin/batches'); const [name, setName] = useState(''); const nav = useNavigate();
  const add = async (e) => { e.preventDefault(); try { const r = await api.post('/admin/batches', { name }); setName(''); toast('Batch created'); nav(`/admin/batches/${r.id}`); } catch (x) { toast(x.message, 'bad'); } };
  return (
    <>
      <PageHead title="Batches" sub="Group students by coaching centre or class. A teacher sees only the students in their own batches." />
      <Err>{err}</Err>
      <form className="card inv-row" onSubmit={add}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New batch name, e.g. Sharma Classes, Evening 2026" maxLength={80} aria-label="Batch name" /><button className="btn btn-primary" disabled={!name.trim()}>Create batch</button></form>
      {loading && !data ? <Loading /> : !data?.batches.length ? <div className="card" style={{ marginTop: 14 }}><Empty>No batches yet. Create one, add a teacher, then give students the join code.</Empty></div> : (
        <div className="tbl-wrap card nopad" style={{ marginTop: 14 }}><table className="dtable"><thead><tr><th>Batch</th><th>Join code</th><th>Teachers</th><th>Students</th><th /></tr></thead>
          <tbody>{data.batches.map((b) => <tr key={b.id}><th scope="row"><Link to={`/admin/batches/${b.id}`}>{b.name}</Link> {b.archived && <Badge tone="mute">archived</Badge>}</th><td><code>{b.code}</code></td><td>{b.teachers.map((t) => t.name).join(', ') || <span className="muted">none yet</span>}</td><td>{b.students}</td><td><Link className="btn btn-ghost btn-sm" to={`/admin/batches/${b.id}`}>Manage</Link></td></tr>)}</tbody></table></div>)}
      <button hidden onClick={reload} />
    </>
  );
}

export function BatchDetail() {
  const { id } = useParams(); const { data, err, loading, reload } = useLoad(`/admin/batches/${id}`); const [tf, setTf] = useState({ identifier: '', name: '' }); const [list, setList] = useState(''); const [res, setRes] = useState(null); const [rn, setRn] = useState(null);
  if (loading && !data) return <Loading />; if (err) return <Err>{err}</Err>;
  const b = data.batch; const link = `${window.location.origin}/?batch=${b.code}`;
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); reload(); return r; } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHead title={b.name} sub={`Join code ${b.code}. Students enter it in their profile, or open the link below.`}>
        <button className="btn btn-ghost" onClick={() => setRn(b.name)}>Rename</button>
        <button className="btn btn-ghost" onClick={() => { if (window.confirm('Make a new join code? The old code stops working. Students already in the batch stay.')) act(() => api.patch(`/admin/batches/${id}`, { regenerate: true }), 'New code made'); }}>New code</button>
        <button className="btn btn-ghost" onClick={() => act(() => api.patch(`/admin/batches/${id}`, { archived: !b.archived }), b.archived ? 'Restored' : 'Archived')}>{b.archived ? 'Restore' : 'Archive'}</button>
      </PageHead>
      <section className="card"><label className="ad-field">Join link<input readOnly value={link} onFocus={(e) => e.target.select()} /></label><p className="small muted">A student who opens this link and signs up or signs in joins the batch automatically, after agreeing that the teacher can see their results. Archived batches cannot be joined.</p></section>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Teachers</h3>
          {!data.teachers.length ? <p className="muted small">No teacher yet. A teacher signs in with their email or mobile number and sees only this batch.</p> : <ul className="inv-rw">{data.teachers.map((t) => <li key={t.id}><span>{t.name}<small className="muted"> · {t.email || t.phone}</small></span><button className="btn btn-ghost btn-sm" onClick={() => act(() => api.del(`/admin/batches/${id}/teachers/${t.id}`), 'Removed')}>Remove</button></li>)}</ul>}
          <form onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/admin/batches/${id}/teachers`, tf), 'Teacher added').then(() => setTf({ identifier: '', name: '' })); }}>
            <div className="ad-row"><label className="ad-field">Email or mobile<input value={tf.identifier} onChange={(e) => setTf({ ...tf, identifier: e.target.value })} placeholder="teacher@example.com" /></label><label className="ad-field">Name <small>For new accounts</small><input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} /></label></div>
            <button className="btn btn-primary btn-sm" disabled={!tf.identifier.trim()}>Add teacher</button>
          </form>
          <p className="small muted">Teachers get a separate teacher view. Their account cannot take mocks, so use a different email from any student account.</p>
        </section>
        <section className="card"><h3>Add students in bulk</h3>
          <label className="ad-field">Emails or mobile numbers<textarea rows={4} value={list} onChange={(e) => setList(e.target.value)} placeholder={'one per line, or separated by commas'} /></label>
          <button className="btn btn-primary btn-sm" disabled={!list.trim()} onClick={async () => { const r = await act(() => api.post(`/admin/batches/${id}/students`, { list })); if (r) { setRes(r); setList(''); } }}>Add to batch</button>
          {res && <p className="small" role="status">{res.added} added{res.already ? `, ${res.already} already in` : ''}.{res.notFound.length > 0 && <> No student account found for: {res.notFound.join(', ')}. They need to sign up first, or use the join link.</>}</p>}
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}><h3>Students ({data.students.length})</h3>
        {!data.students.length ? <Empty>No students yet.</Empty> : <div className="tbl-wrap"><table className="dtable"><thead><tr><th>Name</th><th>Contact</th><th>Mocks finished</th><th>Last seen</th><th>Joined</th><th /></tr></thead><tbody>{data.students.map((s) => <tr key={s.id}><th scope="row"><Link to={`/admin/users/${s.id}`}>{s.name}</Link></th><td>{s.email || s.phone}</td><td>{s.mocks}</td><td>{ago(s.last_seen)}</td><td>{ago(s.joined_at)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Remove ${s.name} from this batch?`)) act(() => api.del(`/admin/batches/${id}/students/${s.id}`), 'Removed'); }}>Remove</button></td></tr>)}</tbody></table></div>}
      </section>
      {rn !== null && <Dialog title="Rename batch" onClose={() => setRn(null)}><label className="ad-field">Name<input value={rn} onChange={(e) => setRn(e.target.value)} maxLength={80} /></label><div className="ad-modal-act"><button className="btn btn-ghost" onClick={() => setRn(null)}>Cancel</button><button className="btn btn-primary" disabled={!rn.trim()} onClick={() => act(() => api.patch(`/admin/batches/${id}`, { name: rn }), 'Renamed').then(() => setRn(null))}>Save</button></div></Dialog>}
    </>
  );
}
