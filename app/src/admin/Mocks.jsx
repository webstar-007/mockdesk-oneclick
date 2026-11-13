import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Dialog, Empty, Err, Loading, PageHead, TagInput, diffTone, statusTone, toast, useLoad } from './ui.jsx';
import { tip } from '../components/Tip.jsx';

export default function Mocks() {
  const nav = useNavigate(); const { data, err, loading } = useLoad('/admin/mocks'); const meta = useLoad('/admin/meta');
  const [dlg, setDlg] = useState(false); const [f, setF] = useState({ name: '', difficulty: 'moderate', description: '', tags: [], cloneFrom: '' }); const [e2, setE2] = useState(''); const [busy, setBusy] = useState(false); const [flt, setFlt] = useState('');
  const create = async () => { setBusy(true); setE2(''); try { const r = await api.post('/admin/mocks', { ...f, tags: [...new Set([f.difficulty, ...f.tags])], cloneFrom: f.cloneFrom || undefined }); toast('Mock created as a draft'); nav(`/admin/mocks/${r.mock.id}`); } catch (e) { setE2(e.message); setBusy(false); } };
  if (loading && !data) return <Loading />; if (err) return <Err>{err}</Err>;
  const list = data.mocks.filter((m) => !flt || m.status === flt); const secs = meta.data?.sections || {};
  return (
    <>
      <PageHead title="Mocks" sub="Build, tag and publish mock tests. Students only see published mocks."><button className="btn btn-primary" onClick={() => setDlg(true)}>＋ New mock</button></PageHead>
      <div className="ad-pill-row" style={{ marginBottom: 14 }}>{[['', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['archived', 'Archived']].map(([k, n]) => <button key={k} className={`ad-pill ${flt === k ? 'on' : ''}`} onClick={() => setFlt(k)}>{n}{k ? ` (${data.mocks.filter((m) => m.status === k).length})` : ` (${data.mocks.length})`}</button>)}</div>
      {!list.length ? <div className="card"><Empty>No mocks here yet.</Empty></div> : (
        <div className="ad-grid g3">{list.map((m) => (
          <article key={m.id} className="card ad-mockcard">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3><Link to={`/admin/mocks/${m.id}`}>{m.name}</Link></h3><Badge tone={statusTone[m.status]}>{m.status}</Badge></div>
            <div className="meta"><Badge tone={diffTone[m.difficulty]}>{m.difficulty}</Badge>{m.tags.filter((t) => t !== m.difficulty).map((t) => <Badge key={t} tone="brand">{t}</Badge>)}{m.source === 'file' && <Badge>built-in</Badge>}</div>
            {m.description && <p className="muted small" style={{ margin: 0 }}>{m.description}</p>}
            <div className="ad-sec-bars">{Object.entries(secs).map(([k, s]) => { const n = m.perSection[k] || 0; return <div key={k} {...tip({ t: s.name, v: `${n} of ${s.questions} questions`, tone: n === s.questions ? 'good' : n > s.questions ? 'bad' : 'warn' })} tabIndex={0}><b>{s.short}</b><span className={`ad-prog ${n === s.questions ? '' : 'warn'}`}><i style={{ width: `${Math.min(100, (n / s.questions) * 100)}%` }} /></span><span>{n}/{s.questions}</span></div>; })}</div>
            <div className="small muted">{m.attempts} started · {m.completed} finished{m.completed ? ` · avg ${m.avgPct}%` : ''}</div>
            {(m.errors > 0 || m.warnings > 0) && <div className="small" style={{ color: m.errors ? 'var(--bad)' : 'var(--warn)' }}>{m.errors ? `${m.errors} problem${m.errors > 1 ? 's' : ''} to fix before publishing` : `${m.warnings} warning${m.warnings > 1 ? 's' : ''}`}</div>}
            <Link className="btn btn-ghost btn-sm" to={`/admin/mocks/${m.id}`} style={{ justifySelf: 'start' }}>Open builder →</Link>
          </article>))}</div>)}
      {dlg && <Dialog title="New mock" onClose={() => setDlg(false)}>
        <label className="ad-field">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus maxLength={80} placeholder="e.g. Mock 6 · Full length" /></label>
        <div className="ad-field">Difficulty tag<div className="ad-pill-row">{(meta.data?.difficulties || ['easy', 'moderate', 'hard']).map((d) => <button key={d} type="button" className={`ad-pill ${f.difficulty === d ? 'on' : ''}`} onClick={() => setF({ ...f, difficulty: d })}>{d}</button>)}</div></div>
        <label className="ad-field">Description <small>Shown to students on the home page</small><textarea rows={2} maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="ad-field">Extra tags<TagInput id="nm-tags" value={f.tags} onChange={(v) => setF({ ...f, tags: v })} suggestions={meta.data?.tags} placeholder="e.g. pyq-style, new-pattern" /></div>
        <label className="ad-field">Start from<select value={f.cloneFrom} onChange={(e) => setF({ ...f, cloneFrom: e.target.value })}><option value="">An empty mock</option>{data.mocks.map((m) => <option key={m.id} value={m.id}>Copy of {m.name} ({m.questions} questions)</option>)}</select></label>
        <Err>{e2}</Err><div className="modal-act"><button className="btn btn-ghost" onClick={() => setDlg(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={create}>Create draft</button></div>
      </Dialog>}
    </>
  );
}
