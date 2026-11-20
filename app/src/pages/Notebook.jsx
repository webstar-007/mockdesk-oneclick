import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate } from '../lib/format.js';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';
import Rich from '../components/Rich.jsx';

/** Bookmarks and mistakes from every finished test, in one place, with a one-tap redo set. */
export default function Notebook() {
  const { config } = useAuth(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'bookmarks' ? 'bookmarks' : 'mistakes'; const section = sp.get('section') || ''; const topic = sp.get('topic') || '';
  const [d, setD] = useState(null); const [items, setItems] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [size, setSize] = useState(10);
  const load = useCallback(async (offset) => {
    const q = new URLSearchParams({ tab, offset: String(offset) }); if (section) q.set('section', section); if (topic) q.set('topic', topic);
    try { const r = await api.get(`/notebook?${q}`); setD(r); setItems((prev) => (offset ? [...prev, ...r.items] : r.items)); setErr(''); } catch (e) { setErr(e.message); }
  }, [tab, section, topic]);
  useEffect(() => { load(0); }, [load]);
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'tab' || k === 'section') n.delete('topic'); setSp(n, { replace: true }); };
  const redo = async () => { setBusy(true); setErr(''); try { const r = await api.post('/practice', { source: tab, size }); nav(`/exam/${r.attemptId}`); } catch (e) { setErr(e.message); setBusy(false); } };
  const remove = async (q) => { try { await api.del(`/bookmarks/${encodeURIComponent(q.id)}`); setItems((x) => x.filter((y) => y.id !== q.id)); setD((x) => ({ ...x, total: x.total - 1, counts: { ...x.counts, bookmarks: x.counts.bookmarks - 1 } })); } catch (e) { setErr(e.message); } };
  const saveNote = async (q, note) => { try { await api.put(`/bookmarks/${encodeURIComponent(q.id)}`, { attemptId: q.attemptId, note }); setItems((x) => x.map((y) => (y.id === q.id ? { ...y, note, bookmarked: true } : y))); } catch (e) { setErr(e.message); } };
  const star = async (q) => { try { await api.put(`/bookmarks/${encodeURIComponent(q.id)}`, { attemptId: q.attemptId }); setItems((x) => x.map((y) => (y.id === q.id ? { ...y, bookmarked: true } : y))); setD((x) => ({ ...x, counts: { ...x.counts, bookmarks: x.counts.bookmarks + 1 } })); } catch (e) { setErr(e.message); } };
  const [why, setWhy] = useState(null); useEffect(() => { api.get('/errors/summary').then(setWhy).catch(() => {}); }, []);
  const counts = d?.counts || { bookmarks: 0, mistakes: 0 };
  return (
    <div className="nb">
      <div className="pagehead"><div><h1>My notebook</h1><p className="muted small">Questions you got wrong and questions you saved, from every test you have finished. <Link to="/fixes">See recent answer-key corrections</Link>.</p></div></div>
      <div className="chips" role="tablist" aria-label="Notebook">
        {[['mistakes', 'My mistakes'], ['bookmarks', 'Bookmarks']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => set('tab', k)}>{l} <span>{counts[k]}</span></button>)}
      </div>
      {err && <div className="alert" role="alert">{err}</div>}
      {tab === 'mistakes' && why && <section className="card nb-why" aria-label="Why you lose marks"><h2>Why you lose marks</h2>{why.tagged ? <><ul className="ai-bars">{why.reasons.filter((x) => x.count).map((x) => <li key={x.key}><span>{x.label}</span><i style={{ width: `${Math.max(4, x.pct)}%` }} /><b>{x.count}</b></li>)}</ul><p className="small muted">Based on {why.tagged} of {why.mistakes} recent mistakes you tagged. Tag more in the review pages to sharpen this.</p></> : <p className="muted">When you review a test, tag each mistake as a concept gap, silly mistake, time pressure or guess. Your pattern shows up here.</p>}</section>}
      {!d ? <p className="muted" role="status">Loading…</p> : (
        <>
          <div className="nb-bar">
            <select aria-label="Section" value={section} onChange={(e) => set('section', e.target.value)}><option value="">All sections</option>{d.sections.map((k) => <option key={k} value={k}>{config?.sections?.[k]?.name || k}</option>)}</select>
            <select aria-label="Topic" value={topic} onChange={(e) => set('topic', e.target.value)}><option value="">All topics</option>{d.topics.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <span className="grow" />
            {counts[tab] >= 3 && <div className="nb-redo"><label className="sr-only" htmlFor="nb-size">Questions</label><select id="nb-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[5, 10, 20, 30].filter((n) => n <= Math.max(5, counts[tab])).map((n) => <option key={n} value={n}>{n} questions</option>)}</select><button className="btn btn-primary" disabled={busy} onClick={redo}>{busy ? 'Building…' : tab === 'mistakes' ? 'Redo my mistakes' : 'Practise my bookmarks'}</button></div>}
          </div>
          {d.total === 0 ? (
            <div className="card empty">{tab === 'mistakes' ? <><h2>No mistakes to redo</h2><p className="muted">{counts.mistakes === 0 ? 'Finish a mock and every question you got wrong will appear here until you answer it correctly.' : 'Nothing matches these filters.'}</p></> : <><h2>No bookmarks yet</h2><p className="muted">Tap “Bookmark” while reviewing a test to keep a question and add your own note.</p></>}<Link className="btn btn-ghost" to="/">Back to dashboard</Link></div>
          ) : (
            <>
              <p className="muted small">{d.total} question{d.total === 1 ? '' : 's'}{tab === 'mistakes' ? '. A question leaves this list once you answer it correctly in a later test.' : ''}</p>
              <ul className="nb-list">
                {items.map((q) => (
                  <li key={q.id} className="card nb-item">
                    <div className="nb-meta"><span className="secname">{config?.sections?.[q.section]?.name || q.section}</span><span className="muted small">{q.topic} · {q.mock}{q.at ? ` · ${fmtDate(q.at)}` : ''}</span></div>
                    <QuestionView q={q} number={null}>
                      <OptionList mode="review" options={q.options} selected={q.selected} correct={q.correct} />
                    </QuestionView>
                    <details className="nb-sol"><summary>Show solution</summary>
                      <div className="box"><p><Rich text={q.explanation} /></p>{q.steps?.length > 0 && <ol className="steps">{q.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>}</div>
                      {q.shortcut && <div className="box tip"><h4>Faster method</h4><p><Rich text={q.shortcut} /></p></div>}
                      {q.trap && <div className="box"><h4>Common mistake</h4><p><Rich text={q.trap} /></p></div>}
                    </details>
                    {q.bookmarked ? <div className="rv-note"><label htmlFor={`n-${q.id}`}>Your note</label><textarea id={`n-${q.id}`} rows={2} maxLength={500} defaultValue={q.note} placeholder="Write the rule or trick you want to remember" onBlur={(e) => e.target.value !== q.note && saveNote(q, e.target.value)} /></div> : null}
                    <div className="nb-actions">
                      <Link className="btn btn-ghost btn-sm" to={`/review/${q.attemptId}?qid=${encodeURIComponent(q.id)}`}>Open in review</Link>
                      {q.bookmarked ? <button className="btn btn-ghost btn-sm" onClick={() => remove(q)}>Remove bookmark</button> : <button className="btn btn-ghost btn-sm" onClick={() => star(q)}>☆ Bookmark</button>}
                    </div>
                  </li>))}
              </ul>
              {items.length < d.total && <button className="btn btn-ghost" onClick={() => load(items.length)}>Show more ({d.total - items.length} left)</button>}
            </>)}
        </>)}
    </div>
  );
}
