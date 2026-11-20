import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, Dialog, Empty, Err, Loading, PageHead, toast, useLoad } from './ui.jsx';

const blankSec = () => ({ key: '', name: '', short: '', questions: 25, marks: 1, negative: 0.25, minutes: 20, qualifying: false, qualifyingMarks: 0 });
const total = (d) => d.sections.filter((s) => !s.qualifying).reduce((a, s) => a + s.questions * s.marks, 0);

function Editor({ item, templates, subjects, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...item, sections: item.sections.map((s) => ({ ...blankSec(), ...s })) } : { name: '', short: '', description: '', timing: 'sectional', minutes: 60, interface: { style: 'ssc', calculator: false }, sections: [blankSec()] });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const up = (k, v) => setF((x) => ({ ...x, [k]: v })); const upS = (i, k, v) => setF((x) => ({ ...x, sections: x.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const use = (t) => setF({ interface: { style: 'ssc', calculator: false }, ...t, sections: t.sections.map((s) => ({ ...blankSec(), ...s })) });
  const pickSubject = (i, key) => { const sub = subjects.find((x) => x.key === key); setF((x) => ({ ...x, sections: x.sections.map((s, j) => (j === i ? { ...s, key, name: sub ? sub.name : s.name, short: sub ? sub.short : s.short } : s)) })); };
  const save = async () => {
    setBusy(true); setErr('');
    const body = { ...f, minutes: Number(f.minutes) || 0, sections: f.sections.map((s) => ({ ...s, key: s.key || undefined, questions: Number(s.questions), marks: Number(s.marks), negative: Number(s.negative), minutes: Number(s.minutes), qualifyingMarks: Number(s.qualifyingMarks) })) };
    try { if (item) await api.put(`/admin/exams/${item.id}`, body); else await api.post('/admin/exams', body); toast(item ? 'Exam saved' : 'Exam created'); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const locked = item && item.mocks > 0;
  return (
    <Dialog title={item ? `Edit ${item.name}` : 'New exam'} onClose={onClose} wide>
      {!item && <div className="ex-tpl"><span className="small muted">Start from a template</span>{templates.map((t) => <button key={t.id} type="button" className="btn btn-ghost btn-sm" onClick={() => use(t)}>{t.name}</button>)}</div>}
      <div className="ad-row"><label className="ad-field">Exam name<input value={f.name} maxLength={80} onChange={(e) => up('name', e.target.value)} autoFocus placeholder="e.g. SSC CHSL Tier-I" /></label><label className="ad-field">Short name <small>Shown on tabs</small><input value={f.short || ''} maxLength={24} onChange={(e) => up('short', e.target.value)} /></label></div>
      <label className="ad-field">Description<textarea rows={2} maxLength={300} value={f.description || ''} onChange={(e) => up('description', e.target.value)} /></label>
      <div className="ad-row">
        <label className="ad-field">Timing<select value={f.timing} onChange={(e) => up('timing', e.target.value)}><option value="sectional">Each section has its own timer</option><option value="overall">One timer for the whole paper</option></select></label>
        {f.timing === 'overall' && <label className="ad-field">Total minutes<input type="number" min="5" max="600" value={f.minutes} onChange={(e) => up('minutes', e.target.value)} /></label>}
      </div>
      <div className="ad-row"><label className="ad-field">Test screen style <small>How the exam page looks to students</small><select value={f.interface?.style || 'ssc'} onChange={(e) => up('interface', { ...(f.interface || {}), style: e.target.value })}><option value="ssc">SSC style (navy)</option><option value="bank">Banking style (teal)</option><option value="railway">Railway style (amber)</option><option value="default">Plain (follows app theme)</option></select></label><label className="ad-field">Calculator<span className="ad-chk"><input type="checkbox" checked={!!f.interface?.calculator} onChange={(e) => up('interface', { ...(f.interface || {}), calculator: e.target.checked })} /> Allow an on-screen calculator</span></label></div>
      {locked && <p className="small muted">Students have attempted mocks of this exam, so marks, question counts and timings are locked. You can still rename it and edit its description.</p>}
      <div className="tbl-wrap"><table className="ad-table ex-secs"><thead><tr><th>Subject <small>(reuses that question bank)</small></th><th>Name shown</th><th className="num">Questions</th><th className="num">Marks</th><th className="num">Negative</th>{f.timing === 'sectional' && <th className="num">Minutes</th>}<th>Qualifying</th><th /></tr></thead>
        <tbody>{f.sections.map((s, i) => (
          <tr key={i}>
            <td><select aria-label="Subject" value={subjects.some((x) => x.key === s.key) ? s.key : ''} onChange={(e) => pickSubject(i, e.target.value)}><option value="">New subject…</option>{subjects.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>{!subjects.some((x) => x.key === s.key) && <input aria-label="Subject key" placeholder="key e.g. hindi" value={s.key} onChange={(e) => upS(i, 'key', e.target.value)} />}</td>
            <td><input aria-label="Name" value={s.name} maxLength={80} onChange={(e) => upS(i, 'name', e.target.value)} /><input aria-label="Short name" value={s.short} maxLength={16} onChange={(e) => upS(i, 'short', e.target.value)} placeholder="Short" /></td>
            <td><input type="number" min="1" max="300" aria-label="Questions" value={s.questions} disabled={locked} onChange={(e) => upS(i, 'questions', e.target.value)} /></td>
            <td><input type="number" step="0.25" min="0.25" aria-label="Marks per question" value={s.marks} disabled={locked} onChange={(e) => upS(i, 'marks', e.target.value)} /></td>
            <td><input type="number" step="0.25" min="0" aria-label="Negative marks" value={s.negative} disabled={locked} onChange={(e) => upS(i, 'negative', e.target.value)} /></td>
            {f.timing === 'sectional' && <td><input type="number" min="1" aria-label="Minutes" value={s.minutes} disabled={locked} onChange={(e) => upS(i, 'minutes', e.target.value)} /></td>}
            <td><label className="ad-chk"><input type="checkbox" checked={!!s.qualifying} disabled={locked} onChange={(e) => upS(i, 'qualifying', e.target.checked)} />Yes</label>{s.qualifying && <input type="number" min="0" aria-label="Qualifying marks" title="Marks needed to qualify" value={s.qualifyingMarks} disabled={locked} onChange={(e) => upS(i, 'qualifyingMarks', e.target.value)} />}</td>
            <td>{!locked && f.sections.length > 1 && <button className="btn btn-ghost btn-sm" aria-label="Remove section" onClick={() => setF((x) => ({ ...x, sections: x.sections.filter((_, j) => j !== i) }))}>✕</button>}</td>
          </tr>))}</tbody></table></div>
      {!locked && f.sections.length < 8 && <p><button className="btn btn-ghost btn-sm" onClick={() => setF((x) => ({ ...x, sections: [...x.sections, blankSec()] }))}>+ Add section</button></p>}
      <p className="small muted">{f.sections.reduce((a, s) => a + (Number(s.questions) || 0), 0)} questions · {total({ sections: f.sections.map((s) => ({ ...s, questions: Number(s.questions) || 0, marks: Number(s.marks) || 0 })) })} scored marks · {f.timing === 'overall' ? f.minutes : f.sections.reduce((a, s) => a + (Number(s.minutes) || 0), 0)} minutes. Check these against the official notice before you publish mocks.</p>
      <Err>{err}</Err>
      <div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{item ? 'Save changes' : 'Create exam'}</button></div>
    </Dialog>
  );
}

export default function Exams() {
  const { data, err, loading, reload } = useLoad('/admin/exams'); const [ed, setEd] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />; if (err) return <Err>{err}</Err>;
  const toggle = async (x) => { try { await api.patch(`/admin/exams/${x.id}`, { active: x.active === 0 }); toast(x.active === 0 ? 'Exam shown to students' : 'Exam hidden from students'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHead title="Exams" sub="Each exam has its own marking, timing and sections. A mock follows the exam you choose for it. Subjects share one question bank, so a Maths question can be used in any exam."><button className="btn btn-primary" onClick={() => setEd('new')}>+ New exam</button></PageHead>
      <div className="ad-grid g3">
        {data.exams.map((x) => (
          <article key={x.id} className="card ex-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3>{x.name}</h3>{x.builtin ? <Badge>built-in</Badge> : x.active === 0 ? <Badge tone="warn">hidden</Badge> : <Badge tone="good">visible</Badge>}</div>
            {x.description && <p className="muted small" style={{ margin: 0 }}>{x.description}</p>}
            <ul className="ex-facts"><li><b>{x.sections.reduce((a, s) => a + s.questions, 0)}</b> questions</li><li><b>{total(x)}</b> marks</li><li><b>{x.minutes || x.sections.reduce((a, s) => a + (s.minutes || 0), 0)}</b> min</li></ul>
            <p className="small muted" style={{ margin: 0 }}>{x.timing === 'overall' ? 'One timer' : 'Sectional timers'} · {x.sections.map((s) => `${s.short} ${s.questions}${s.qualifying ? ' (qual.)' : ''}`).join(' · ')}<br />+{x.sections[0].marks} / −{x.sections[0].negative} per question</p>
            <p className="small" style={{ margin: 0 }}><Link to="/admin/mocks">{x.mocks} mock{x.mocks === 1 ? '' : 's'}</Link> · {x.published} published</p>
            {x.builtin ? <p className="small muted" style={{ margin: 0 }}>Edit config/exam.config.js to change this pattern.</p> : <div className="ex-act"><button className="btn btn-ghost btn-sm" onClick={() => setEd(x)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => toggle(x)}>{x.active === 0 ? 'Show to students' : 'Hide'}</button><button className="btn btn-ghost btn-sm dng" disabled={x.mocks > 0} title={x.mocks ? 'Delete its mocks first' : ''} onClick={() => setDel(x)}>Delete</button></div>}
          </article>))}
      </div>
      {!data.exams.length && <div className="card"><Empty>No exams yet.</Empty></div>}
      {ed && <Editor item={ed === 'new' ? null : ed} templates={data.templates} subjects={data.subjects} onClose={() => setEd(null)} onSaved={() => { setEd(null); reload(); }} />}
      {del && <ConfirmModal title="Delete this exam?" word={del.name} label="Delete forever" danger busy={busy} onClose={() => setDel(null)} onConfirm={async () => { setBusy(true); try { await api.del(`/admin/exams/${del.id}`); toast('Exam deleted'); setDel(null); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } }}><p>This removes the exam pattern. It has no mocks, so no student data is affected.</p></ConfirmModal>}
    </>
  );
}
