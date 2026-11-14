import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, Dialog, Empty, Err, Loading, PageHead, TagInput, diffTone, dt, mmss, statusTone, toast, useLoad } from './ui.jsx';
import QuestionForm from './QuestionForm.jsx';
import { TEMPLATE, parseCsv, rowsToQuestions, toCsvText } from './csv.js';

export default function MockEditor() {
  const { id } = useParams(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const { data: d, err, loading, reload } = useLoad(`/admin/mocks/${id}`, [id]); const meta = useLoad('/admin/meta');
  const [tab, setTab] = useState('q'); const exportCsv = () => { const rows = [TEMPLATE[0], ...d.questions.map((q) => [q.section, q.difficulty, q.topic, q.subtopic || '', (q.tags || []).join(';'), q.text, ...q.options, 'ABCD'[q.answer], q.explanation || '', (q.steps || []).join('|'), q.shortcut || '', q.trap || '', q.revise || '', q.passage || ''])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCsvText(rows)], { type: 'text/csv' })); a.download = `${d.mock.name.replace(/[^\w]+/g, '-')}-questions.csv`; a.click(); }; const [edit, setEdit] = useState(null); const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false); const [e2, setE2] = useState(''); const [secFilter, setSecFilter] = useState('');
  const [form, setForm] = useState(null); const [shut, setShut] = useState({}); const big = (d?.questions.length || 0) > 40; const drag = useRef(null); const [over, setOver] = useState(null);
  useEffect(() => { if (d && !form) setForm({ name: d.mock.name, difficulty: d.mock.difficulty, description: d.mock.description || '', tags: d.mock.tags, number: d.mock.number, doubtChat: d.mock.doubtChat !== false, availableFrom: d.mock.availableFrom ? new Date(d.mock.availableFrom - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' }); }, [d]); // eslint-disable-line
  useEffect(() => { const q = sp.get('q'); if (q && d) { const f = d.questions.find((x) => x.id === q); if (f) setEdit(f); } }, [d]); // eslint-disable-line
  if ((loading && !d) || !meta.data) return <Loading />; if (err) return <Err>{err}</Err>; if (!form) return <Loading />;
  const m = d.mock, M = meta.data, v = d.validation;
  const act = async (fn, ok) => { setBusy(true); setE2(''); try { const r = await fn(); if (ok) toast(ok); reload(); return r; } catch (x) { setE2(x.message + (x.errors ? '' : '')); toast(x.message, 'bad'); } finally { setBusy(false); } };
  const setStatus = (status) => act(() => api.patch(`/admin/mocks/${id}`, { status }), status === 'published' ? 'Published. Students can now take it.' : `Moved to ${status}`);
  const saveSettings = () => act(() => api.patch(`/admin/mocks/${id}`, { ...form, number: Number(form.number), availableFrom: form.availableFrom || null, tags: [...new Set([form.difficulty, ...form.tags.filter((t) => !M.difficulties.includes(t))])] }), 'Settings saved');
  const bySec = (k) => d.questions.filter((q) => q.section === k);
  const drop = async (k, toId) => { const from = drag.current; drag.current = null; setOver(null); if (!from || from === toId) return; const ids = bySec(k).map((q) => q.id); ids.splice(ids.indexOf(from), 1); ids.splice(ids.indexOf(toId), 0, from); await act(() => api.post(`/admin/mocks/${id}/reorder`, { section: k, ids })); };
  const move = (k, qid, dir) => { const ids = bySec(k).map((q) => q.id); const i = ids.indexOf(qid); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; act(() => api.post(`/admin/mocks/${id}/reorder`, { section: k, ids })); };
  const closeEdit = () => { setEdit(null); if (sp.get('q')) { sp.delete('q'); setSp(sp, { replace: true }); } };
  const tabs = [['q', `Questions (${d.questions.length})`], ['s', 'Settings & tags'], ['c', `Checks${v.errors.length ? ` ⚠ ${v.errors.length}` : ''}`], ['l', 'Leaderboard']];
  return (
    <>
      <PageHead title={m.name} sub={<><Link to="/admin/mocks">← All mocks</Link> · updated {dt(m.updatedAt)}</>}>
        <Badge tone={statusTone[m.status]}>{m.status}</Badge><Badge tone={diffTone[m.difficulty]}>{m.difficulty}</Badge>
        <Link className="btn btn-ghost" to={`/admin/mocks/${id}/preview`}>👁 Preview as student</Link>
        {m.status !== 'published' ? <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('published')}>Publish</button> : <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('draft')}>Unpublish</button>}
        <button className="btn btn-ghost" onClick={() => act(async () => { const r = await api.post(`/admin/mocks/${id}/clone`); nav(`/admin/mocks/${r.mock.id}`); }, 'Copy created')}>Clone</button>
        <button className="btn btn-ghost dng" onClick={() => setDlg('delete')}>{m.attempts ? 'Archive' : 'Delete'}</button>
      </PageHead>
      {v.errors.length > 0 && m.status !== 'published' && <div className="ad-check bad" style={{ marginBottom: 14 }}><b>{v.errors.length} problem{v.errors.length > 1 ? 's' : ''} stop this mock from being published</b><button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setTab('c')}>See checks</button></div>}
      <Err>{e2}</Err>
      <div className="ad-tabs" role="tablist">{tabs.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>

      {tab === 'q' && <>
        <div className="ad-toolbar"><select value={secFilter} onChange={(e) => setSecFilter(e.target.value)} aria-label="Section"><option value="">All sections</option>{Object.entries(M.sections).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}</select><span className="grow" /><button className="btn btn-ghost" onClick={exportCsv}>⬇ Export CSV</button><button className="btn btn-ghost" onClick={() => setDlg('bank')}>📚 Add from question bank</button><button className="btn btn-ghost" onClick={() => setDlg('import')}>⬆ Import CSV</button><button className="btn btn-primary" onClick={() => setEdit({ _new: true, section: secFilter || undefined })}>＋ Add question</button></div>
        {Object.entries(M.sections).filter(([k]) => !secFilter || secFilter === k).map(([k, s]) => { const qs = bySec(k); return (
          <section key={k}>
            <div className="ad-sec-head"><h3><button type="button" className="btn btn-ghost btn-sm" aria-expanded={!(shut[k] ?? (big && !secFilter))} onClick={() => setShut({ ...shut, [k]: !(shut[k] ?? (big && !secFilter)) })} style={{ marginRight: 8 }}>{(shut[k] ?? (big && !secFilter)) ? '▸' : '▾'}</button>{s.name} <small className="muted">· {qs.length} of {s.questions}</small>{s.qualifying && <> <Badge tone="warn">qualifying</Badge></>}</h3><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ _new: true, section: k })}>＋ Add to {s.short}</button></div>
            {(shut[k] ?? (big && !secFilter)) ? null : qs.length ? <div className="ad-qlist">{qs.map((q, i) => (
              <div key={q.id} className={`ad-q ${over === q.id ? 'over' : ''}`} draggable onDragStart={() => { drag.current = q.id; }} onDragOver={(e) => { e.preventDefault(); setOver(q.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(k, q.id)} onDragEnd={() => setOver(null)}>
                <span className="no" title="Drag to reorder">{i + 1}</span>
                <div><p>{q.text}</p><small><Badge tone={diffTone[q.difficulty]}>{q.difficulty}</Badge> {q.topic}{q.image || q.figure || q.optionImages ? ' · 🖼' : ''}{q.passage ? ' · passage' : ''}{q.stat ? ` · ${q.stat.pctCorrect}% correct (${q.stat.attempts})` : ''}{q.addedAt ? ` · added ${new Date(q.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</small></div>
                <div className="ad-q-act"><button className="btn btn-ghost btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(k, q.id, -1)}>↑</button><button className="btn btn-ghost btn-sm" aria-label="Move down" disabled={i === qs.length - 1} onClick={() => move(k, q.id, 1)}>↓</button><button className="btn btn-ghost btn-sm" onClick={() => setEdit(q)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => setDlg({ copy: q })}>Copy to…</button><button className="btn btn-ghost btn-sm dng" onClick={() => setDlg({ del: q })}>Delete</button></div>
              </div>))}</div> : <div className="card"><Empty>No questions in this section yet.</Empty></div>}
          </section>); })}
      </>}

      {tab === 's' && <section className="card" style={{ maxWidth: 720 }}>
        <label className="ad-field">Name<input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <div className="ad-field">Difficulty tag<div className="ad-pill-row">{M.difficulties.map((x) => <button key={x} type="button" className={`ad-pill ${form.difficulty === x ? 'on' : ''}`} onClick={() => setForm({ ...form, difficulty: x })}>{x}</button>)}</div></div>
        <label className="ad-field">Description<textarea rows={2} maxLength={400} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="ad-field">Tags<TagInput id="mk-tags" value={form.tags.filter((t) => !M.difficulties.includes(t))} onChange={(t) => setForm({ ...form, tags: t })} suggestions={M.tags} placeholder="Add tags like pyq-style, sectional, new-pattern" /></div>
        <div className="ad-row"><label className="ad-field">Order on home page<input type="number" min="1" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label><label className="ad-field">Available from <small>Optional schedule</small><input type="datetime-local" value={form.availableFrom} onChange={(e) => setForm({ ...form, availableFrom: e.target.value })} /></label></div>
        <label className="check"><input type="checkbox" checked={form.doubtChat} onChange={(e) => setForm({ ...form, doubtChat: e.target.checked })} /><span>Let students use doubt help after they finish this mock<small style={{ display: 'block' }} className="muted">Turn this off while the mock is a live test so answers cannot be shared, then turn it back on. Help is always off for a student who has a test running.</small></span></label>
        <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={saveSettings}>Save settings</button>
        {m.source === 'file' && <p className="small muted" style={{ marginTop: 14 }}>This is a built-in mock. <button className="btn btn-ghost btn-sm" onClick={() => setDlg('reimport')}>Reset questions from files</button></p>}
      </section>}

      {tab === 'c' && <section style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
        <div className={`ad-check ${v.errors.length ? 'bad' : 'good'}`}><b>{v.errors.length ? `${v.errors.length} problem${v.errors.length > 1 ? 's' : ''} to fix` : '✓ Ready to publish'}</b>{v.errors.length > 0 && <ul>{v.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}</div>
        {v.warnings.length > 0 && <div className="ad-check warn"><b>{v.warnings.length} suggestion{v.warnings.length > 1 ? 's' : ''}</b><ul>{v.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
        <p className="small muted">Publishing needs every section filled to the exam pattern, one correct answer per question, and no duplicate questions. Students who already started keep the questions they began with.</p>
      </section>}

      {tab === 'l' && <Board id={id} />}

      {edit && <QuestionForm meta={M} mockId={id} question={edit._new ? null : edit} defaultSection={edit.section} onClose={closeEdit} onSaved={(q, again) => { reload(); if (!again) closeEdit(); }} />}
      {dlg === 'delete' && <ConfirmModal title={m.attempts ? 'Archive this mock?' : 'Delete this mock?'} word={m.attempts ? undefined : m.name} label={m.attempts ? 'Archive' : 'Delete forever'} danger busy={busy} onClose={() => setDlg(null)} onConfirm={async () => { await act(async () => { await api.del(`/admin/mocks/${id}`); nav('/admin/mocks'); }, m.attempts ? 'Mock archived' : 'Mock deleted'); }}><p>{m.attempts ? `${m.attempts} students have attempted it, so it is archived instead of deleted. Their results stay intact.` : 'All its questions are removed. This cannot be undone.'}</p></ConfirmModal>}
      {dlg === 'reimport' && <ConfirmModal title="Reset from files?" label="Reset" danger busy={busy} onClose={() => setDlg(null)} onConfirm={async () => { await act(() => api.post(`/admin/mocks/${id}/reimport`), 'Questions reset'); setDlg(null); }}><p>Replaces this mock’s questions with the original built-in version. Your edits to it are lost.</p></ConfirmModal>}
      {dlg?.del && <ConfirmModal title="Delete this question?" label="Delete" danger busy={busy} onClose={() => setDlg(null)} onConfirm={async () => { await act(() => api.del(`/admin/questions/${dlg.del.id}`), 'Question deleted'); setDlg(null); }}><p>“{dlg.del.text.slice(0, 120)}…”</p></ConfirmModal>}
      {dlg?.copy && <CopyDlg q={dlg.copy} id={id} onClose={() => setDlg(null)} done={() => { setDlg(null); reload(); }} />}
      {dlg === 'bank' && <BankPicker id={id} onClose={() => setDlg(null)} done={() => { setDlg(null); reload(); }} />}
      {dlg === 'import' && <ImportDlg id={id} sections={Object.keys(M.sections)} onClose={() => setDlg(null)} done={() => { setDlg(null); reload(); }} />}
    </>
  );
}

function Board({ id }) {
  const { data, err, loading } = useLoad(`/admin/mocks/${id}/leaderboard`, [id]);
  if (loading) return <Loading />; if (err) return <Err>{err}</Err>;
  return <div className="card nopad">{data.board.length ? <table className="ad-table"><thead><tr><th>#</th><th>Student</th><th className="num">Score</th><th className="num">%</th><th className="num">Accuracy</th><th className="num">Time</th></tr></thead><tbody>{data.board.map((b) => <tr key={b.userId}><td>{b.rank <= 3 ? ['🥇', '🥈', '🥉'][b.rank - 1] : b.rank}</td><td className="nm"><Link to={`/admin/users/${b.userId}`}><b>{b.name}</b></Link><small>{b.email}</small></td><td className="num"><b>{b.score}</b>/{b.max}</td><td className="num">{b.pct}%</td><td className="num">{b.accuracy}%</td><td className="num">{mmss(b.timeSec)}</td></tr>)}</tbody></table> : <Empty>No finished attempts yet.</Empty>}</div>;
}
export function CopyDlg({ q, id, onClose, done }) {
  const { data } = useLoad('/admin/mocks'); const [to, setTo] = useState(id); const [busy, setBusy] = useState(false); const [e, setE] = useState('');
  return <Dialog title="Copy question to a mock" onClose={onClose}><label className="ad-field">Target mock<select value={to} onChange={(x) => setTo(x.target.value)}><option value="pool">Question pool (no mock)</option>{data?.mocks.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === id ? ' (this mock)' : ''}</option>)}</select></label><Err>{e}</Err><div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await api.post(`/admin/questions/${q.id}/copy`, { toMock: to }); toast('Question copied'); done(); } catch (x) { setE(x.message); setBusy(false); } }}>Copy</button></div></Dialog>;
}
export function ImportDlg({ id, sections, onClose, done }) {
  const [rows, setRows] = useState(null); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [e, setE] = useState('');
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCsvText(TEMPLATE)], { type: 'text/csv' })); a.download = 'mockdesk-question-template.csv'; a.click(); };
  const pick = async (ev) => { const f = ev.target.files?.[0]; if (!f) return; setE(''); setRes(null); try { const csv = parseCsv(await f.text()); if (csv.length < 2) throw new Error('The file has no question rows'); const qs = rowsToQuestions(csv, sections); setRows(qs); setBusy(true); setRes(await api.post(`/admin/mocks/${id}/import`, { rows: qs, dryRun: true })); } catch (x) { setE(x.message); setRows(null); } finally { setBusy(false); } };
  const go = async (skipBad) => { setBusy(true); try { const r = await api.post(`/admin/mocks/${id}/import`, { rows, skipBad }); toast(`${r.added} question${r.added === 1 ? '' : 's'} imported`); done(); } catch (x) { setE(x.message); setBusy(false); } };
  return (
    <Dialog title="Import questions from CSV" onClose={onClose}>
      <p className="small muted">Fill the template in Excel or Google Sheets, save as CSV, and upload it. Up to 500 questions at once. Images can be added afterwards by editing a question.</p>
      <p><button className="btn btn-ghost btn-sm" onClick={download}>⬇ Download template</button></p>
      <input type="file" accept=".csv,text/csv" onChange={pick} />
      {res && <div className={`ad-check ${res.problems.length ? 'warn' : 'good'}`} style={{ marginTop: 12 }}><b>{res.ready} ready to import{res.problems.length ? `, ${res.problems.length} with problems` : ''}</b>{res.problems.length > 0 && <ul style={{ maxHeight: 160, overflow: 'auto' }}>{res.problems.map((p) => <li key={p.row}>Row {p.row + 1}: {p.error}</li>)}</ul>}</div>}
      <Err>{e}</Err>
      <div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button>{res && res.ready > 0 && <button className="btn btn-primary" disabled={busy} onClick={() => go(res.problems.length > 0)}>{res.problems.length ? `Import ${res.ready} and skip the rest` : `Import ${res.ready} questions`}</button>}</div>
    </Dialog>
  );
}

function BankPicker({ id, onClose, done }) {
  const [q, setQ] = useState(''); const [pool, setPool] = useState(true); const [sel, setSel] = useState(new Set()); const [busy, setBusy] = useState(false); const [e, setE] = useState('');
  const qs = new URLSearchParams({ q, size: 50, sort: 'added', ...(pool ? { mock: 'pool' } : {}) }).toString();
  const { data, loading } = useLoad(`/admin/questions?${qs}`, [qs]);
  const rows = (data?.questions || []).filter((x) => x.mockId !== id);
  const go = async () => { setBusy(true); try { const r = await api.post(`/admin/mocks/${id}/pull`, { ids: [...sel] }); toast(`${r.added} question${r.added === 1 ? '' : 's'} added`); done(); } catch (x) { setE(x.message); setBusy(false); } };
  return (
    <Dialog title="Add from the question bank" onClose={onClose} wide>
      <div className="ad-toolbar"><input className="grow" type="search" placeholder="Search questions…" value={q} onChange={(x) => setQ(x.target.value)} autoFocus /><label className="ad-chk"><input type="checkbox" checked={pool} onChange={(x) => setPool(x.target.checked)} /> Only unassigned (pool)</label></div>
      <p className="small muted">Pool questions move into this mock. Questions from other mocks are copied.</p>
      <div className="ad-qlist" style={{ maxHeight: '48vh', overflow: 'auto' }}>{loading ? <Loading /> : !rows.length ? <Empty>Nothing to add. Create questions in the Question bank first.</Empty> : rows.map((x) => (
        <label key={x.id} className="ad-q" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto', cursor: 'pointer', flexDirection: 'row' }}><input type="checkbox" checked={sel.has(x.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })} /><div><p>{x.text}</p><small>{x.section} · {x.topic} · {x.mockName}</small></div><Badge tone={diffTone[x.difficulty]}>{x.difficulty}</Badge></label>))}</div>
      <Err>{e}</Err><div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !sel.size} onClick={go}>Add {sel.size || ''} question{sel.size === 1 ? '' : 's'}</button></div>
    </Dialog>
  );
}
