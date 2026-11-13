import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, Pager, SortTh, ago, dOnly, statusTone, useLoad, useSort } from './ui.jsx';

export default function Users() {
  const nav = useNavigate(); const [urlq] = useSearchParams();
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState(urlq.get('status') || ''); const [seg, setSeg] = useState(urlq.get('segment') || ''); const [page, setPage] = useState(1); const [{ sort, dir }, setSort] = useSort('joined');
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const size = 25;
  const qs = new URLSearchParams({ q: dq, role, status, segment: seg, sort, dir, page, size }).toString();
  const { data, err, loading } = useLoad(`/admin/users?${qs}`, [qs]);
  const sp = (k, children, cls) => <SortTh k={k} sort={sort} dir={dir} onSort={(a, b) => { setSort(a, b); setPage(1); }} className={cls}>{children}</SortTh>;
  return (
    <>
      <PageHead title="Users" sub="Every student and admin on the platform."><a className="btn btn-ghost" href={`/api/admin/users.csv`} download>⬇ Export CSV</a></PageHead>
      <div className="ad-toolbar">
        <input className="grow" type="search" placeholder="Search name, email or mobile…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Role"><option value="">All roles</option><option value="student">Students</option><option value="admin">Admins</option></select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      </div>
      <div className="ad-pill-row" style={{ marginBottom: 12 }} role="group" aria-label="Student segments">{[['', 'Everyone'], ['new', 'New this week'], ['never', 'Never took a test'], ['inactive', 'Inactive 7+ days'], ['top', 'Top performers (70%+)'], ['struggling', 'Struggling (under 35%)']].map(([k, n]) => <button key={k} className={`ad-pill ${seg === k ? 'on' : ''}`} onClick={() => { setSeg(k); setPage(1); }}>{n}</button>)}</div>
      <Err>{err}</Err>
      <div className="card nopad">
        {loading && !data ? <Loading /> : !data?.users.length ? <Empty>No users match.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="ad-table">
            <thead><tr>{sp('name', 'User')}<th>Role</th><th>Status</th>{sp('joined', 'Joined')}{sp('active', 'Last active')}{sp('attempts', 'Tests', 'num')}{sp('avg', 'Avg %', 'num')}{sp('best', 'Best', 'num')}</tr></thead>
            <tbody>{data.users.map((u) => (
              <tr key={u.id} className="click" onClick={() => nav(`/admin/users/${u.id}`)}>
                <td className="nm"><b>{u.name}</b><small>{u.email || u.phone}</small></td><td><Badge tone={statusTone[u.role]}>{u.role}</Badge></td><td><Badge tone={statusTone[u.status]}>{u.status}</Badge></td>
                <td>{dOnly(Date.parse(u.createdAt))}</td><td>{ago(u.lastSeen)}</td><td className="num">{u.completed}<small className="muted"> / {u.started}</small></td>
                <td className="num">{u.avgPct == null ? '–' : <><span className="ad-meter"><i className={u.avgPct < 40 ? 'low' : u.avgPct < 65 ? 'mid' : ''} style={{ width: `${u.avgPct}%` }} /></span>{u.avgPct}</>}</td><td className="num">{u.best ?? '–'}</td>
              </tr>))}</tbody></table></div>
        )}
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} />}
      </div>
    </>
  );
}
