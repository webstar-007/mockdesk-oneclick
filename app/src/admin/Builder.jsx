import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Dialog, Err, diffTone, toast } from './ui.jsx';

// Build a draft mock automatically from the question bank: pick how many questions per section and difficulty.
export default function Builder({ sections, difficulties, onClose }) {
  const nav = useNavigate();
  const keys = Object.keys(sections);
  const [name, setName] = useState(''); const [difficulty, setDifficulty] = useState('moderate'); const [include, setInclude] = useState('pool');
  const [plan, setPlan] = useState(() => Object.fromEntries(keys.map((k) => [k, { easy: 0, moderate: 0, hard: 0 }])));
  const [prev, setPrev] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [partial, setPartial] = useState(false); const [show, setShow] = useState(false);
  const set = (k, d, v) => { setPlan((p) => ({ ...p, [k]: { ...p[k], [d]: Math.max(0, Math.min(150, Number(v) || 0)) } })); setPrev(null); };
  const total = keys.reduce((a, k) => a + difficulties.reduce((b, d) => b + (plan[k][d] || 0), 0), 0);
  // Fill the exam pattern: each section's question count split 40 / 40 / 20.
  const preset = () => { setPlan(Object.fromEntries(keys.map((k) => { const n = sections[k].questions; const e = Math.round(n * 0.4), h = Math.round(n * 0.2); return [k, { easy: e, moderate: n - e - h, hard: h }]; }))); setPrev(null); };
  const body = (dryRun) => ({ name, difficulty, include, dryRun, allowPartial: partial, plan: keys.map((k) => ({ section: k, ...plan[k] })) });
  const preview = async () => { setBusy(true); setErr(''); try { setPrev(await api.post('/admin/mocks/build', body(true))); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const create = async () => {
    if (!name.trim()) { setErr('Give the mock a name'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('/admin/mocks/build', body(false)); toast(`Draft created with ${r.summary.picked} questions`); nav(`/admin/mocks/${r.mock.id}`); }
    catch (e) { setErr(e.message); if (e.code === 'SHORT') preview(); } finally { setBusy(false); }
  };
  return (
    <Dialog title="Build a mock from the question bank" onClose={onClose} wide>
      <p className="small muted" style={{ marginTop: 0 }}>Say how many questions you want. MockDesk picks them at random, spreads them over topics, and puts them in a new <b>draft</b> you can edit before publishing. Questions taken from the bank move into the new mock.</p>
      <div className="ad-grid g2">
        <label className="ad-field">Mock name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mock 6 · Mixed" autoFocus /></label>
        <label className="ad-field">Overall difficulty tag<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{difficulties.map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>
      <label className="ad-field">Take questions from<select value={include} onChange={(e) => { setInclude(e.target.value); setPrev(null); }}><option value="pool">The question bank only (not yet in a mock)</option><option value="all">The bank first, then copies from other mocks if short</option></select></label>
      <div className="bd-grid" role="group" aria-label="Questions wanted">
        <span className="h" style={{ textAlign: 'left' }}>Section <button className="btn btn-ghost btn-sm" type="button" onClick={preset}>Use exam pattern</button></span>{difficulties.map((d) => <span className="h" key={d}>{d}</span>)}
        {keys.map((k) => [<span key={k + 'n'}><b>{sections[k].short}</b> <small className="muted">of {sections[k].questions}</small></span>, ...difficulties.map((d) => <input key={k + d} type="number" min="0" max="150" inputMode="numeric" value={plan[k][d] || ''} placeholder="0" aria-label={`${sections[k].short} ${d}`} onChange={(e) => set(k, d, e.target.value)} />)])}
      </div>
      <p className="small" style={{ margin: '10px 0 0' }}><b>{total}</b> questions requested.</p>
      <Err>{err}</Err>
      {prev && (
        <div style={{ marginTop: 10 }}>
          <div className={`ad-check ${prev.shortages.length ? 'warn' : 'good'}`}>
            <b>{prev.summary.picked} of {prev.summary.wanted} found</b> · {prev.summary.topics} topics · {prev.summary.fromBank} from the bank{prev.summary.fromMocks ? `, ${prev.summary.fromMocks} copied from mocks` : ''}
            {prev.shortages.length > 0 && <ul>{prev.shortages.map((s) => <li key={s.section + s.difficulty}>{sections[s.section].short} {s.difficulty}: wanted {s.wanted}, found {s.found}</li>)}</ul>}
          </div>
          {prev.shortages.length > 0 && <label className="ad-chk" style={{ marginTop: 8 }}><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Create the draft anyway with what was found</label>}
          <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 8 }} onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'} the picked questions</button>
          {show && <div className="bd-prev">{prev.preview.map((x) => <div key={x.id}><Badge tone={diffTone[x.difficulty]}>{x.difficulty}</Badge> <b>{sections[x.section].short}</b> · {x.topic} <br /><span className="muted">{x.text}</span> <small className="muted">({x.from})</small></div>)}</div>}
        </div>
      )}
      <div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-ghost" disabled={busy || !total} onClick={preview}>Preview picks</button><button className="btn btn-primary" disabled={busy || !total} onClick={create}>{busy ? 'Working…' : 'Create draft'}</button></div>
    </Dialog>
  );
}
