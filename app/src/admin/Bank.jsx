import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, Dialog, Empty, Err, Loading, PageHead, Pager, SortTh, ago, diffTone, statusTone, toast, useLoad, useSort } from './ui.jsx';
import QuestionForm from './QuestionForm.jsx';
import { CopyDlg, ImportDlg } from './MockEditor.jsx';

const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
function ImportTo({ choices, sections, onClose, done }) {
  const [to, setTo] = useState(choices[0].id);
  return <><Dialog title="Import into…" onClose={onClose}><label className="ad-field">Add the imported questions to<select value={to} onChange={(e) => setTo(e.target.value)}>{choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><p className="small muted">Choose the destination, then pick your CSV file in the next step.</p><div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onClose(to)}>Continue</button></div></Dialog></>;
}
export default function Bank() {
  const meta = useLoad('/admin/meta'); const mocks = useLoad('/admin/mocks');
  const [f, setF] = useState({ q: '', section: '', difficulty: '', topic: '', mock: '', tag: '', flag: '', from: '', to: '' }); const [dq, setDq] = useState(''); const [page, setPage] = useState(1); const [{ sort, dir }, setSort] = useSort('added', 'desc');
  const [sel, setSel] = useState(new Set()); const [bv, setBv] = useState('');
  const [edit, setEdit] = useState(null); const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setDq(f.q); setPage(1); }, 250); return () => clearTimeout(t); }, [f.q]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const size = 30; const qs = new URLSearchParams(Object.entries({ ...f, q: dq, sort, dir, page, size }).filter(([, v]) => v !== '')).toString();
  const { data, err, loading, reload } = useLoad(`/admin/questions?${qs}`, [qs]);
  const M = meta.data; const choices = [{ id: 'pool', name: 'Question pool (not in any mock yet)' }, ...(mocks.data?.mocks || []).map((m) => ({ id: m.id, name: `${m.name}${m.status === 'published' ? ' (published)' : ''}` }))];
  const sp = (k, c, cls) => <SortTh k={k} sort={sort} dir={dir} onSort={(a, b) => { setSort(a, b); setPage(1); }} className={cls}>{c}</SortTh>;
  const open = async (row) => { try { const r = await api.get(`/admin/questions/${row.id}`); setEdit({ q: r.question, mockId: r.mockId }); } catch (e) { toast(e.message, 'bad'); } };
  const del = async () => { setBusy(true); try { await api.del(`/admin/questions/${dlg.del.id}`); toast('Question deleted'); setDlg(null); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const rows = data?.questions || []; const allOn = rows.length > 0 && rows.every((q) => sel.has(q.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulk = async (action, value, ok) => { setBusy(true); try { const r = await api.post('/admin/questions/bulk', { action, ids: [...sel], value }); toast(`${r.changed} question${r.changed === 1 ? '' : 's'} ${ok}`); setSel(new Set()); setDlg(null); setBv(''); reload(); mocks.reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const pull = async (to) => { setBusy(true); try { const r = await api.post(`/admin/mocks/${to}/pull`, { ids: [...sel] }); toast(`${r.added} question${r.added === 1 ? '' : 's'} added to the mock`); setSel(new Set()); setDlg(null); reload(); mocks.reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const filtered = Object.entries(f).some(([k, v]) => v && k !== 'q');
  return (
    <>
      <PageHead title="Question bank" sub="Every question across every mock, with when it was added and how students really perform on it.">
        <button className="btn btn-ghost" onClick={() => setDlg({ importPick: true })}>⬆ Import CSV</button><button className="btn btn-primary" onClick={() => setEdit({ _new: true })}>＋ Add question</button></PageHead>
      <div className="ad-toolbar"><input className="grow" type="search" placeholder="Search question text, topic or tag…" value={f.q} onChange={set('q')} aria-label="Search questions" /></div>
      <div className="ad-toolbar">
        <select value={f.mock} onChange={set('mock')} aria-label="Mock"><option value="">All mocks and pool</option>{choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select value={f.section} onChange={set('section')} aria-label="Section"><option value="">All sections</option>{M && Object.entries(M.sections).map(([k, s]) => <option key={k} value={k}>{s.short}</option>)}</select>
        <select value={f.difficulty} onChange={set('difficulty')} aria-label="Difficulty"><option value="">Any difficulty</option>{M?.difficulties.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={f.topic} onChange={set('topic')} aria-label="Topic"><option value="">All topics</option>{M?.topics.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={f.tag} onChange={set('tag')} aria-label="Tag"><option value="">Any tag</option>{M?.tags.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={f.flag} onChange={set('flag')} aria-label="Insight"><option value="">All performance</option><option value="hard">Too hard (≤30% correct)</option><option value="easy">Too easy (≥85% correct)</option><option value="slow">Slow (75 s+ average)</option></select>
        <label className="small muted ad-date">Added from <input type="date" value={f.from} onChange={set('from')} /></label><label className="small muted ad-date">to <input type="date" value={f.to} onChange={set('to')} /></label>{filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setF({ ...f, section: '', difficulty: '', topic: '', mock: '', tag: '', flag: '', from: '', to: '' }); setPage(1); }}>Clear filters</button>}</div>
      {sel.size > 0 && <div className="ad-bulk" role="region" aria-label="Bulk actions"><b>{sel.size} selected</b><span className="grow" /><button className="btn btn-primary btn-sm" onClick={() => setDlg({ bulk: 'pull' })}>Add to mock…</button><button className="btn btn-ghost btn-sm" onClick={() => setDlg({ bulk: 'tag' })}>Add tag…</button><button className="btn btn-ghost btn-sm" onClick={() => setDlg({ bulk: 'difficulty' })}>Set difficulty…</button><button className="btn btn-ghost btn-sm dng" onClick={() => setDlg({ bulk: 'delete' })}>Delete</button><button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Clear</button></div>}
      <Err>{err}</Err>
      <div className="card nopad">
        {loading && !data ? <Loading /> : !data?.questions.length ? <Empty>No questions match. Use “Add question” to create one.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((q) => q.id)))} /></th><th>Question</th><th>Where</th>{sp('topic', 'Topic')}<th>Level</th>{sp('added', 'Added')}{sp('attempts', 'Answered', 'num')}{sp('correct', '% correct', 'num')}{sp('time', 'Avg time', 'num')}<th /></tr></thead>
            <tbody>{data.questions.map((q) => <tr key={q.id} className="click" onClick={() => open(q)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select question" checked={sel.has(q.id)} onChange={() => toggle(q.id)} /></td>
              <td style={{ maxWidth: 300, minWidth: 200 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q.text}</div><small className="muted">{q.section}{q.hasImage ? ' · 🖼' : ''}{q.tags.length ? ` · ${q.tags.join(', ')}` : ''}</small></td>
              <td>{q.mockName} {q.mockStatus === 'pool' ? <Badge tone="brand">pool</Badge> : <Badge tone={statusTone[q.mockStatus]}>{q.mockStatus}</Badge>}</td><td>{q.topic}</td><td><Badge tone={diffTone[q.difficulty]}>{q.difficulty}</Badge></td>
              <td title={when(q.addedAt)} style={{ whiteSpace: 'nowrap' }}><b>{q.addedAt ? new Date(q.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</b><br /><small className="muted">{q.addedAt ? new Date(q.addedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''} · {ago(q.addedAt)}</small>{q.addedBy && <><br /><small className="muted">by {q.addedBy}</small></>}</td>
              <td className="num">{q.attempts || '–'}</td><td className="num">{q.attempts ? <><span className="ad-meter"><i className={q.pctCorrect < 30 ? 'low' : q.pctCorrect < 60 ? 'mid' : ''} style={{ width: `${q.pctCorrect}%` }} /></span>{q.pctCorrect}%</> : '–'}</td><td className="num">{q.attempts ? `${q.avgTimeSec}s` : '–'}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><button className="btn btn-ghost btn-sm" onClick={() => setDlg({ copy: q })}>Copy to…</button> <button className="btn btn-ghost btn-sm dng" onClick={() => setDlg({ del: q })}>Delete</button></td></tr>)}</tbody></table></div>)}
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} />}
      </div>
      {edit && M && <QuestionForm meta={M} mockChoices={edit._new ? choices : undefined} mockId={edit.mockId} question={edit._new ? null : edit.q} onClose={() => setEdit(null)} onSaved={(q, again) => { reload(); mocks.reload(); if (!again) setEdit(null); }} />}
      {dlg?.bulk === 'pull' && <BulkPick title={`Add ${sel.size} question${sel.size > 1 ? 's' : ''} to a mock`} note="Questions from the pool move into the mock. Questions that already belong to another mock are copied." choices={choices.filter((c) => c.id !== 'pool')} busy={busy} onClose={() => setDlg(null)} onGo={pull} label="Add to mock" />}
      {dlg?.bulk === 'tag' && <Dialog title="Add a tag" onClose={() => setDlg(null)}><label className="ad-field">Tag for {sel.size} question{sel.size > 1 ? 's' : ''}<input value={bv} onChange={(e) => setBv(e.target.value)} autoFocus placeholder="e.g. pyq-style" maxLength={30} /></label><div className="modal-act"><button className="btn btn-ghost" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !bv.trim()} onClick={() => bulk('tag', bv, 'tagged')}>Add tag</button></div></Dialog>}
      {dlg?.bulk === 'difficulty' && <Dialog title="Set difficulty" onClose={() => setDlg(null)}><div className="ad-pill-row">{M?.difficulties.map((x) => <button key={x} className="ad-pill" disabled={busy} onClick={() => bulk('difficulty', x, `set to ${x}`)}>{x}</button>)}</div><div className="modal-act"><button className="btn btn-ghost" onClick={() => setDlg(null)}>Cancel</button></div></Dialog>}
      {dlg?.bulk === 'delete' && <ConfirmModal title={`Delete ${sel.size} question${sel.size > 1 ? 's' : ''}?`} label="Delete" danger busy={busy} onClose={() => setDlg(null)} onConfirm={() => bulk('delete', '', 'deleted')}><p>They are removed from their mocks. Students who already attempted keep their results. This cannot be undone.</p></ConfirmModal>}
      {dlg?.copy && <CopyDlg q={dlg.copy} id={dlg.copy.mockId} onClose={() => setDlg(null)} done={() => { setDlg(null); reload(); mocks.reload(); }} />}
      {dlg?.del && <ConfirmModal title="Delete this question?" label="Delete" danger busy={busy} onClose={() => setDlg(null)} onConfirm={del}><p>“{dlg.del.text.slice(0, 120)}…”</p><p className="small muted">It is removed from {dlg.del.mockName}. Students who already attempted keep their results.</p></ConfirmModal>}
      {dlg?.importPick && <ImportTo choices={choices} onClose={(to) => setDlg(to ? { importTo: to } : null)} />}
      {dlg?.importTo && M && <ImportDlg id={dlg.importTo} sections={Object.keys(M.sections)} onClose={() => setDlg(null)} done={() => { setDlg(null); reload(); mocks.reload(); }} />}
    </>
  );
}

export function BulkPick({ title, note, choices, busy, onClose, onGo, label }) {
  const [to, setTo] = useState(choices[0]?.id || '');
  return <Dialog title={title} onClose={onClose}>{note && <p className="small muted">{note}</p>}<label className="ad-field">Mock<select value={to} onChange={(e) => setTo(e.target.value)}>{choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !to} onClick={() => onGo(to)}>{label}</button></div></Dialog>;
}
