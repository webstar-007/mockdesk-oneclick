import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { duration } from '../lib/format.js';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';
import ReportQuestion from '../components/ReportQuestion.jsx';
import SolutionViewer from '../components/SolutionViewer.jsx';

const FILTERS = [['all', 'All'], ['correct', 'Correct'], ['incorrect', 'Incorrect'], ['unattempted', 'Unattempted'], ['marked', 'Marked for review'], ['slow', 'Took long'], ['saved', 'Bookmarked']];
// Bookmarks and notes live in this browser only (a convenience, not shared data).
const loadLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const saveLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export default function ReviewPage() {
  const { attemptId } = useParams(); const { config } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [pos, setPos] = useState(0); const [palOpen, setPalOpen] = useState(false);
  const [saved, setSaved] = useState(() => loadLocal(`mockdesk-saved-${attemptId}`)); const [notes, setNotes] = useState(() => loadLocal(`mockdesk-notes-${attemptId}`));
  const [search, setSearch] = useState('');
  const filter = sp.get('filter') || 'all'; const section = sp.get('section') || 'all'; const topic = sp.get('topic') || 'all'; const diff = sp.get('difficulty') || 'all'; const qid = sp.get('qid');
  useEffect(() => { api.get(`/attempts/${attemptId}/result`).then(setD).catch((e) => setErr(e.message)); }, [attemptId]);
  useEffect(() => saveLocal(`mockdesk-saved-${attemptId}`, saved), [saved, attemptId]);
  useEffect(() => saveLocal(`mockdesk-notes-${attemptId}`, notes), [notes, attemptId]);
  const secAvg = useMemo(() => { const o = {}; if (d) for (const s of [...d.sections, ...(d.qualifying || [])]) o[s.key] = s.total ? s.timeSec / s.total : 0; return o; }, [d]);
  const isSlow = (q) => q.status !== 'correct' && q.timeSec >= Math.max(75, (secAvg[q.section] || 0) * 2.2);
  const match = (q, f) => f === 'all' || (f === 'marked' ? q.marked : f === 'slow' ? isSlow(q) : f === 'saved' ? !!saved[q.id] : q.status === f);
  const needle = search.trim().toLowerCase();
  const base = (q) => (section === 'all' || q.section === section) && (topic === 'all' || q.topic === topic) && (diff === 'all' || q.difficulty === diff) && (!needle || (q.text + ' ' + q.topic + ' ' + q.subtopic).toLowerCase().includes(needle));
  const list = useMemo(() => (d ? d.questions.filter((q) => base(q) && match(q, filter)) : []), [d, filter, section, topic, diff, needle, saved, secAvg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (qid && list.length) { const i = list.findIndex((x) => x.id === qid); if (i >= 0) setPos(i); } else setPos(0); }, [filter, section, topic, diff, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (qid && list.length) { const i = list.findIndex((x) => x.id === qid); if (i >= 0) setPos(i); } }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [pos]);
  useEffect(() => {
    const k = (e) => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'ArrowRight' || e.key === 'j') setPos((p) => Math.min(list.length - 1, p + 1)); if (e.key === 'ArrowLeft' || e.key === 'k') setPos((p) => Math.max(0, p - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [list.length]);
  if (err) return <div className="alert" role="alert">{err}</div>;
  if (!d) return <p className="muted" role="status">Loading…</p>;
  const count = (f) => d.questions.filter((q) => base(q) && match(q, f)).length;
  const set = (k, v) => { const n = new URLSearchParams(sp); n.delete('qid'); if (v === 'all') n.delete(k); else n.set(k, v); setSp(n, { replace: true }); };
  const idx = Math.min(pos, list.length - 1); const q = list[idx];
  const secNo = (x) => d.questions.filter((y) => y.section === x.section && y.index <= x.index).length;
  const secShort = (k) => config?.sections[k]?.short || k;
  const topics = [...new Set(d.questions.filter((x) => section === 'all' || x.section === section).map((x) => x.topic))].sort();
  const nextMistake = () => { const i = list.findIndex((x, j) => j > idx && x.status === 'incorrect'); if (i >= 0) setPos(i); };
  const stats = { wrong: d.questions.filter((x) => x.status === 'incorrect').length, saved: Object.values(saved).filter(Boolean).length };
  return (
    <div className="review">
      <Link to={`/results/${attemptId}`} className="back">← Back to analysis</Link>
      <div className="pagehead"><div><h1>Review questions</h1><p className="muted small">{d.attempt.mockName} · {stats.wrong} incorrect · {stats.saved} bookmarked. Use ← → (or J / K) to move between questions.</p></div></div>
      <div className="filters" role="toolbar" aria-label="Filter questions">
        <div className="chips">{FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => set('filter', k)}>{l} <span>{count(k)}</span></button>)}</div>
      </div>
      <div className="rv-tools">
        <label className="sr-only" htmlFor="rv-search">Search questions</label>
        <input id="rv-search" type="search" placeholder="Search text or topic" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Section" value={section} onChange={(e) => { const n = new URLSearchParams(sp); n.delete('qid'); n.delete('topic'); if (e.target.value === 'all') n.delete('section'); else n.set('section', e.target.value); setSp(n, { replace: true }); }}><option value="all">All sections</option>{[...d.sections, ...(d.qualifying || [])].map((s) => <option key={s.key} value={s.key}>{s.name}{s.qualifying ? ' (qualifying)' : ''}</option>)}</select>
        <select aria-label="Topic" value={topic} onChange={(e) => set('topic', e.target.value)}><option value="all">All topics</option>{topics.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="Difficulty" value={diff} onChange={(e) => set('difficulty', e.target.value)}><option value="all">Any difficulty</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select>
        {(filter !== 'all' || section !== 'all' || topic !== 'all' || diff !== 'all' || search) && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSp({}, { replace: true }); }}>Clear</button>}
      </div>
      {!q ? <div className="card empty"><p>No questions match these filters.</p><button className="btn btn-ghost" onClick={() => { setSearch(''); setSp({}, { replace: true }); }}>Clear filters</button></div> : (
        <div className="rv-layout">
          <aside className={`rv-pal ${palOpen ? 'open' : ''}`}>
            <button className="btn btn-ghost btn-sm pal-toggle" onClick={() => setPalOpen(!palOpen)} aria-expanded={palOpen}>Question list ({list.length})</button>
            <div className="pal-grid" role="group" aria-label="Questions in this view">
              {list.map((x, i) => <button key={x.id} className={`pal-btn r-${x.status} ${i === idx ? 'cur' : ''} ${saved[x.id] ? 'sv' : ''}`} onClick={() => { setPos(i); setPalOpen(false); }} aria-label={`${secShort(x.section)} question ${secNo(x)}, ${x.status}${saved[x.id] ? ', bookmarked' : ''}`} title={`${secShort(x.section)} Q${secNo(x)}`}>{section === 'all' ? i + 1 : secNo(x)}</button>)}
            </div>
            <ul className="legend-list small"><li><span className="pal-chip r-correct" />Correct</li><li><span className="pal-chip r-incorrect" />Incorrect</li><li><span className="pal-chip r-unattempted" />Unattempted</li><li><span className="pal-chip sv-demo" />Bookmarked</li></ul>
            <button className="btn btn-ghost btn-sm btn-block" onClick={nextMistake} disabled={!list.some((x, j) => j > idx && x.status === 'incorrect')}>Jump to next mistake</button>
          </aside>
          <main className="rv-main">
            <div className="rv-top"><span className="secname">{config?.sections[q.section]?.name}{q.qualifying && <span className="qual-tag inline">Qualifying</span>}</span><span className="muted">{idx + 1} of {list.length}</span></div>
            <QuestionView q={q} number={secNo(q)} extraMeta={<>
              <span className={`diff d-${q.difficulty}`}>{q.difficulty}</span>
              <span className="muted small">Your time {duration(q.timeSec)} · section average {duration(Math.round(secAvg[q.section] || 0))}{isSlow(q) ? ' · took long' : ''}</span>
              <ReportQuestion qid={q.id} /><button type="button" className={`bm ${saved[q.id] ? 'on' : ''}`} aria-pressed={!!saved[q.id]} onClick={() => setSaved({ ...saved, [q.id]: !saved[q.id] })}>{saved[q.id] ? '★ Bookmarked' : '☆ Bookmark'}</button>
            </>}>
              <OptionList mode="review" options={q.options} figures={q.optionFigures} images={q.optionImages} selected={q.selected} correct={q.correct} />
            </QuestionView>
            <SolutionViewer q={q} />
            <div className="rv-note"><label htmlFor="rv-note">Your note for this question</label><textarea id="rv-note" rows={2} placeholder="Write the rule, formula or trick you want to remember" value={notes[q.id] || ''} onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })} /></div>
            <div className="rv-nav"><button className="btn btn-ghost" disabled={idx === 0} onClick={() => setPos(idx - 1)}>← Previous</button><button className="btn btn-primary" disabled={idx >= list.length - 1} onClick={() => setPos(idx + 1)}>Next →</button></div>
          </main>
        </div>
      )}
    </div>
  );
}
