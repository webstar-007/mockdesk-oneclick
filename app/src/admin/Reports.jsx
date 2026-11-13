import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, ago, statusTone, toast, useLoad } from './ui.jsx';

const WHY = { wrong_answer: 'Wrong answer key', unclear: 'Unclear or ambiguous', typo: 'Typo or formatting', other: 'Something else' };
export default function Reports() {
  const [status, setStatus] = useState('open'); const { data, err, loading, reload } = useLoad(`/admin/reports?status=${status}`, [status]); const [notes, setNotes] = useState({});
  const set = async (r, s) => { try { await api.patch(`/admin/reports/${r.id}`, { status: s, adminNote: notes[r.id] ?? r.adminNote ?? '' }); toast(s === 'open' ? 'Reopened' : `Marked ${s}`); window.dispatchEvent(new Event('ad-reports')); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHead title="Reports" sub="Questions students flagged from the review screen." />
      <div className="ad-pill-row" style={{ marginBottom: 14 }}>{[['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']].map(([k, n]) => <button key={k} className={`ad-pill ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{n}</button>)}</div>
      <Err>{err}</Err>{loading && !data ? <Loading /> : !data?.reports.length ? <div className="card"><Empty>{status === 'open' ? 'Nothing waiting. Great.' : 'No reports here.'}</Empty></div> : (
        <div className="ad-qlist">{data.reports.map((r) => (
          <article key={r.id} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><Badge tone="warn">{WHY[r.reason] || r.reason}</Badge> <Badge tone={statusTone[r.status]}>{r.status}</Badge> <small className="muted">{r.mockName} · {r.section} · {ago(r.createdAt)}</small></div><small className="muted">from {r.student || 'a student'}{r.email ? ` (${r.email})` : ''}</small></div>
            <p style={{ margin: 0, fontWeight: 600 }}>{r.text}</p>
            {r.note && <blockquote style={{ margin: 0, padding: '6px 12px', borderLeft: '4px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 6 }}>{r.note}</blockquote>}
            <input placeholder="Your note (optional)" value={notes[r.id] ?? r.adminNote ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} aria-label="Admin note" />
            <div className="ad-q-act" style={{ justifyContent: 'flex-start' }}>
              {r.text !== '(question deleted)' && <Link className="btn btn-primary btn-sm" to={`/admin/mocks/${r.mockId}?q=${r.questionId}`}>Open question to fix</Link>}
              {r.status === 'open' ? <><button className="btn btn-ghost btn-sm" onClick={() => set(r, 'resolved')}>Mark resolved</button><button className="btn btn-ghost btn-sm" onClick={() => set(r, 'dismissed')}>Dismiss</button></> : <button className="btn btn-ghost btn-sm" onClick={() => set(r, 'open')}>Reopen</button>}
            </div>
          </article>))}</div>)}
    </>
  );
}
