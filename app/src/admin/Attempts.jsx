import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Empty, Err, Loading, PageHead, Pager, SortTh, dt, mmss, statusTone, useLoad, useSort } from './ui.jsx';

export default function Attempts() {
  const nav = useNavigate(); const mocks = useLoad('/admin/mocks');
  const [f, setF] = useState({ q: '', mock: '', status: '', from: '', to: '', min: '', max: '' }); const [dq, setDq] = useState(''); const [page, setPage] = useState(1); const [{ sort, dir }, setSort] = useSort('started');
  useEffect(() => { const t = setTimeout(() => { setDq(f.q); setPage(1); }, 250); return () => clearTimeout(t); }, [f.q]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const size = 25; const base = { ...f, q: dq, sort, dir };
  const qs = new URLSearchParams(Object.entries({ ...base, page, size }).filter(([, v]) => v !== '')).toString();
  const csv = new URLSearchParams(Object.entries(base).filter(([, v]) => v !== '')).toString();
  const { data, err, loading } = useLoad(`/admin/attempts?${qs}`, [qs]);
  const sp = (k, c, cls) => <SortTh k={k} sort={sort} dir={dir} onSort={(a, b) => { setSort(a, b); setPage(1); }} className={cls}>{c}</SortTh>;
  return (
    <>
      <PageHead title="Attempts" sub="Every test taken on the platform. Open one to see each answer."><a className="btn btn-ghost" href={`/api/admin/attempts.csv?${csv}`} download>⬇ Export CSV</a></PageHead>
      <div className="ad-toolbar">
        <input className="grow" type="search" placeholder="Search student name or email…" value={f.q} onChange={set('q')} aria-label="Search" />
        <select value={f.mock} onChange={set('mock')} aria-label="Mock"><option value="">All mocks</option>{mocks.data?.mocks.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select value={f.status} onChange={set('status')} aria-label="Status"><option value="">Any status</option><option value="submitted">Finished</option><option value="in_progress">In progress</option></select>
      </div>
      <div className="ad-toolbar"><label className="small muted">From <input type="date" value={f.from} onChange={set('from')} /></label><label className="small muted">To <input type="date" value={f.to} onChange={set('to')} /></label><label className="small muted">Score from <input type="number" style={{ width: 90 }} value={f.min} onChange={set('min')} /></label><label className="small muted">to <input type="number" style={{ width: 90 }} value={f.max} onChange={set('max')} /></label>{Object.entries(f).some(([k, v]) => v && k !== 'q') && <button className="btn btn-ghost btn-sm" onClick={() => { setF({ ...f, mock: '', status: '', from: '', to: '', min: '', max: '' }); setPage(1); }}>Clear filters</button>}</div>
      <Err>{err}</Err>
      <div className="card nopad">
        {loading && !data ? <Loading /> : !data?.attempts.length ? <Empty>No attempts match.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr>{sp('user', 'Student')}{sp('mock', 'Mock')}<th>Status</th>{sp('started', 'Started')}{sp('score', 'Score', 'num')}{sp('accuracy', 'Accuracy', 'num')}{sp('time', 'Time', 'num')}</tr></thead>
            <tbody>{data.attempts.map((a) => <tr key={a.id} className="click" onClick={() => nav(`/admin/attempts/${a.id}`)}>
              <td className="nm"><b>{a.user}</b><small>{a.email}</small></td><td>{a.mockName}</td><td><Badge tone={statusTone[a.status]}>{a.status === 'in_progress' ? 'in progress' : 'finished'}</Badge>{a.auto && <> <Badge tone="warn">auto</Badge></>}</td><td>{dt(a.startedAt)}</td>
              <td className="num">{a.score == null ? '–' : <b>{a.score}<small className="muted">/{a.max}</small></b>}</td><td className="num">{a.accuracy == null ? '–' : `${a.accuracy}%`}</td><td className="num">{mmss(a.timeSec)}</td></tr>)}</tbody></table></div>
        )}
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} />}
      </div>
    </>
  );
}
