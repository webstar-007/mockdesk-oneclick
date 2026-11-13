import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Dialog, Err, ImageField, TagInput, toast } from './ui.jsx';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';

const L = 'ABCD';
const blank = (section, meta) => ({ section: section || Object.keys(meta.sections)[0], text: '', options: ['', '', '', ''], answer: -1, difficulty: 'moderate', topic: '', subtopic: '', tags: [], explanation: '', steps: [], shortcut: '', trap: '', revise: '', approach: '', wrongReasons: [null, null, null, null], passage: '', table: null, figure: '', image: null, solutionImage: null, optionImages: [null, null, null, null], currentAffairs: false });
const tableToText = (t) => (t ? t.rows.map((r) => r.join(' | ')).join('\n') : '');

/** Create or edit one question. Left: the form. Right: exactly what a student will see. */
export default function QuestionForm({ meta, mockId, mockChoices, question, defaultSection, onClose, onSaved }) {
  const [target, setTarget] = useState(mockChoices?.[0]?.id || mockId);
  const [f, setF] = useState(() => (question ? { ...blank(null, meta), ...question, optionImages: question.optionImages || [null, null, null, null], wrongReasons: question.wrongReasons || [null, null, null, null], passage: question.passage || '', figure: question.figure || '' } : blank(defaultSection, meta)));
  const [tab, setTab] = useState('q'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [tbl, setTbl] = useState(() => ({ on: !!question?.table, caption: question?.table?.caption || '', headers: (question?.table?.headers || []).join(' | '), rows: tableToText(question?.table) }));
  const [stepsText, setStepsText] = useState((question?.steps || []).join('\n'));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setOpt = (k, i, v) => setF((x) => ({ ...x, [k]: x[k].map((o, j) => (j === i ? v : o)) }));
  const cfg = meta.sections[f.section] || {};
  const payload = () => {
    const table = tbl.on && tbl.headers.trim() ? { caption: tbl.caption, headers: tbl.headers.split('|').map((x) => x.trim()), rows: tbl.rows.split('\n').filter((r) => r.trim()).map((r) => r.split('|').map((x) => x.trim())) } : null;
    return { ...f, table, steps: stepsText.split('\n').map((x) => x.trim()).filter(Boolean), figure: f.figure.trim() || undefined, passage: f.passage.trim() || null, optionImages: f.optionImages.some(Boolean) ? f.optionImages : null, wrongReasons: f.wrongReasons.map((x) => (x && x.trim()) || null) };
  };
  const prev = useMemo(() => { const p = payload(); return { ...p, id: 'preview', index: 0, passage: p.passage, marks: p.marks ?? cfg.marksPerQuestion ?? 3, negativeMarks: p.negativeMarks ?? cfg.negativeMarks ?? 1, optionFigures: null, options: p.options.map((o) => o || '…') }; }, [f, tbl, stepsText]); // eslint-disable-line
  const save = async (again) => {
    setBusy(true); setErr('');
    try { const body = payload(); if (!question && !target) throw new Error('Choose where to add this question'); if (!(body.answer >= 0)) { setTab('o'); throw new Error('Choose the correct answer: tick “Correct answer” beside one of the options.'); } const r = question ? await api.put(`/admin/questions/${question.id}`, body) : await api.post(`/admin/mocks/${target}/questions`, body); toast(question ? 'Question saved' : 'Question added'); onSaved(r.question, again); if (again) { setF({ ...blank(f.section, meta), difficulty: f.difficulty, topic: f.topic, tags: f.tags }); setTbl({ on: false, caption: '', headers: '', rows: '' }); setStepsText(''); setTab('q'); } }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const noAns = !(f.answer >= 0);
  const tabs = [['q', 'Question'], ['o', noAns ? 'Options ⚠' : 'Options ✓'], ['s', 'Solution'], ['m', 'Details']];
  return (
    <Dialog title={question ? 'Edit question' : 'Add a question'} onClose={onClose} wide>
      {question?.addedAt && <p className="small muted" style={{ margin: '-4px 0 8px' }}>Added {new Date(question.addedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{question.addedBy ? ` by ${question.addedBy}` : ''}{question.updatedAt && question.updatedAt !== question.addedAt ? ` · last edited ${new Date(question.updatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>}
      <div className="ad-split">
        <div>
          <div className="ad-tabs" role="tablist">{tabs.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
          {tab === 'q' && <>
            {!question && mockChoices && <label className="ad-field">Add to<select value={target} onChange={(e) => setTarget(e.target.value)}>{mockChoices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
            <div className="ad-row"><label className="ad-field">Section<select value={f.section} onChange={(e) => set('section', e.target.value)}>{Object.entries(meta.sections).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}</select></label>
              <label className="ad-field">Difficulty<select value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>{meta.difficulties.map((d) => <option key={d}>{d}</option>)}</select></label></div>
            <label className="ad-field">Passage or directions <small>Optional. Questions with identical passage text share one passage.</small><textarea rows={3} value={f.passage} onChange={(e) => set('passage', e.target.value)} /></label>
            <label className="ad-field">Question text<textarea rows={4} value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="Type the question. Use ^ for powers, e.g. x^2" /></label>
            <div className="ad-field">Question image or diagram <small>Optional</small><ImageField value={f.image} onChange={(v) => set('image', v)} label="question image" /></div>
            <label className="ad-chk"><input type="checkbox" checked={tbl.on} onChange={(e) => setTbl({ ...tbl, on: e.target.checked })} /> Add a data table</label>
            {tbl.on && <div style={{ margin: '8px 0 12px', display: 'grid', gap: 8 }}><input placeholder="Caption (optional)" value={tbl.caption} onChange={(e) => setTbl({ ...tbl, caption: e.target.value })} /><input placeholder="Column headings, separated by |   e.g. Year | Sales | Profit" value={tbl.headers} onChange={(e) => setTbl({ ...tbl, headers: e.target.value })} /><textarea rows={4} placeholder={'One row per line, cells separated by |\n2022 | 120 | 15'} value={tbl.rows} onChange={(e) => setTbl({ ...tbl, rows: e.target.value })} /></div>}
            <details style={{ marginTop: 10 }}><summary className="small"><b>Advanced:</b> SVG figure</summary><label className="ad-field">SVG markup <small>Pasted SVG is checked before saving. Use currentColor for lines.</small><textarea rows={5} value={f.figure} onChange={(e) => set('figure', e.target.value)} spellCheck={false} style={{ fontFamily: 'monospace' }} /></label></details>
          </>}
          {tab === 'o' && <>
            <div className={`ad-check ${noAns ? 'bad' : 'good'}`} style={{ marginBottom: 12 }}><b>{noAns ? 'Choose the correct answer' : `Correct answer: option ${L[f.answer]}`}</b><span className="small">Type the four options, then tick <b>Correct answer</b> beside the right one. Each option can have text, an image, or both.</span></div>
            {f.options.map((o, i) => (
              <div key={i} className={`ad-opt ${f.answer === i ? 'right' : ''}`}>
                <span className="key" aria-hidden="true">{L[i]}</span>
                <div className="ad-opt-in"><label className="ad-correct"><input type="radio" name="correct-opt" checked={f.answer === i} onChange={() => set('answer', i)} /> {f.answer === i ? '✓ Correct answer' : 'Correct answer'}</label><input value={o} onChange={(e) => setOpt('options', i, e.target.value)} placeholder={`Option ${L[i]}`} aria-label={`Option ${L[i]} text`} />
                  <ImageField value={f.optionImages[i]} onChange={(v) => setOpt('optionImages', i, v)} label={`Option ${L[i]} image`} />
                  {f.answer !== i && <input value={f.wrongReasons[i] || ''} onChange={(e) => setOpt('wrongReasons', i, e.target.value)} placeholder="Why a student might pick this and be wrong (shown in review)" aria-label={`Why option ${L[i]} is wrong`} />}
                </div>
              </div>))}
          </>}
          {tab === 's' && <>
            <label className="ad-field">Explanation<textarea rows={4} value={f.explanation} onChange={(e) => set('explanation', e.target.value)} /></label>
            <label className="ad-field">Steps <small>One step per line</small><textarea rows={4} value={stepsText} onChange={(e) => setStepsText(e.target.value)} /></label>
            <label className="ad-field">Shortcut<input value={f.shortcut} onChange={(e) => set('shortcut', e.target.value)} /></label>
            <label className="ad-field">Common trap<input value={f.trap} onChange={(e) => set('trap', e.target.value)} /></label>
            <label className="ad-field">Revise this concept<input value={f.revise} onChange={(e) => set('revise', e.target.value)} /></label>
            <div className="ad-field">Solution image <small>Optional</small><ImageField value={f.solutionImage} onChange={(v) => set('solutionImage', v)} label="solution image" /></div>
          </>}
          {tab === 'm' && <>
            <div className="ad-row"><label className="ad-field">Topic<input list="topics-dl" value={f.topic} onChange={(e) => set('topic', e.target.value)} placeholder="e.g. Percentages" /><datalist id="topics-dl">{meta.topics.map((t) => <option key={t} value={t} />)}</datalist></label><label className="ad-field">Subtopic<input value={f.subtopic} onChange={(e) => set('subtopic', e.target.value)} /></label></div>
            <div className="ad-field">Tags<TagInput id="qtags" value={f.tags} onChange={(v) => set('tags', v)} suggestions={meta.tags} /></div>
            <div className="ad-row"><label className="ad-field">Marks <small>Blank = section default ({cfg.marksPerQuestion})</small><input type="number" min="0" max="10" step="0.5" value={f.marks ?? ''} onChange={(e) => set('marks', e.target.value === '' ? undefined : e.target.value)} /></label><label className="ad-field">Negative marks <small>Blank = default ({cfg.negativeMarks})</small><input type="number" min="0" max="10" step="0.25" value={f.negativeMarks ?? ''} onChange={(e) => set('negativeMarks', e.target.value === '' ? undefined : e.target.value)} /></label></div>
            <label className="ad-chk"><input type="checkbox" checked={!!f.currentAffairs} onChange={(e) => set('currentAffairs', e.target.checked)} /> This is a current-affairs question (needs periodic review)</label>
          </>}
        </div>
        <aside className="prev"><h3>Student preview</h3><div className="ad-qprev"><QuestionView q={prev} number={1}><OptionList mode="review" options={prev.options} images={prev.optionImages} selected={null} correct={prev.answer} />{prev.explanation && <div className="box tip" style={{ marginTop: 10 }}><b>Explanation</b><p>{prev.explanation}</p></div>}</QuestionView></div></aside>
      </div>
      <Err>{err}</Err>
      <div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button>{!question && <button className="btn btn-ghost" disabled={busy} onClick={() => save(true)}>Save and add another</button>}<button className="btn btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : question ? 'Save changes' : 'Add question'}</button></div>
    </Dialog>
  );
}
