import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const LS = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const range = (a, b) => { const x = fmt(a), y = fmt(b); return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)} – ${y}` : `${x} – ${y}`; };
const fmt = (m) => { const h = Math.floor(m / 60) % 24; const mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; };

/* ---------- 1. Score calculator (answer-key checker) ---------- */
function ScoreCalc({ config }) {
  const secs = Object.entries(config.sections);
  const [v, setV] = useState(() => LS('mockdesk-calc', {}));
  useEffect(() => save('mockdesk-calc', v), [v]);
  const set = (k, f, val) => setV((o) => ({ ...o, [k]: { ...(o[k] || {}), [f]: val.replace(/\D/g, '').slice(0, 2) } }));
  let total = 0, maxTotal = 0; let bad = false;
  const rows = secs.map(([k, s]) => {
    const c = num(v[k]?.c), w = num(v[k]?.w); const over = c + w > s.questions; if (over) bad = true;
    const marks = c * s.marksPerQuestion - w * s.negativeMarks; const max = s.questions * s.marksPerQuestion;
    if (!s.qualifying) { total += marks; maxTotal += max; }
    return { k, s, c, w, over, marks, max, left: Math.max(0, s.questions - c - w) };
  });
  const comp = rows.find((r) => r.s.qualifying);
  return (
    <section className="card tk-card" id="calc" aria-labelledby="tk-calc">
      <h2 id="tk-calc">Score calculator</h2>
      <p className="muted tk-note">Enter your correct and wrong answers from the official answer key to see your marks. {`+${secs[0][1].marksPerQuestion} for each correct answer, −${secs[0][1].negativeMarks} for each wrong one.`}</p>
      <div className="tk-table" role="table" aria-label="Score calculator">
        <div className="tk-row tk-head" role="row"><span>Section</span><span>Correct</span><span>Wrong</span><span>Marks</span></div>
        {rows.map((r) => (
          <div className={`tk-row${r.over ? ' bad' : ''}`} role="row" key={r.k}>
            <span><b>{r.s.short}</b><small>{r.s.questions} Qs{r.s.qualifying ? ' · qualifying' : ''}</small></span>
            <input inputMode="numeric" aria-label={`${r.s.short} correct`} value={v[r.k]?.c || ''} onChange={(e) => set(r.k, 'c', e.target.value)} placeholder="0" />
            <input inputMode="numeric" aria-label={`${r.s.short} wrong`} value={v[r.k]?.w || ''} onChange={(e) => set(r.k, 'w', e.target.value)} placeholder="0" />
            <span className="tk-marks">{r.over ? '—' : r.marks}<small>/{r.max}</small></span>
          </div>
        ))}
      </div>
      {bad && <p className="alert" role="alert">Correct plus wrong cannot be more than the number of questions in a section.</p>}
      <div className="tk-result" role="status" aria-live="polite">
        <div><span>Total score (Computer excluded)</span><b>{bad ? '—' : total}<small>/{maxTotal}</small></b></div>
        {comp && <div className={!bad && comp.marks >= comp.s.qualifyingMarks ? 'ok' : ''}><span>Computer Knowledge</span><b>{bad ? '—' : comp.marks}<small>/{comp.max}</small></b><em>{bad ? '' : comp.marks >= comp.s.qualifyingMarks ? 'Qualified' : `Needs ${comp.s.qualifyingMarks} to qualify`}</em></div>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setV({})}>Clear</button>
    </section>
  );
}

/* ---------- 2. Pace planner ---------- */
function PacePlanner({ config }) {
  const [start, setStart] = useState(() => LS('mockdesk-start', '09:00'));
  useEffect(() => save('mockdesk-start', start), [start]);
  const [h, m] = start.split(':').map(Number); let t = (h || 0) * 60 + (m || 0);
  const rows = config.segments.map((g) => {
    const qs = g.sections.reduce((a, k) => a + config.sections[k].questions, 0); const name = g.sections.map((k) => config.sections[k].short).join(' + ');
    const from = t; t += g.minutes; const secPerQ = Math.round((g.minutes * 60) / qs);
    return { id: g.id, name, qs, minutes: g.minutes, secPerQ, first: Math.round(g.minutes * 0.75), from, to: t, qual: g.sections.every((k) => config.sections[k].qualifying) };
  });
  return (
    <section className="card tk-card" id="pace" aria-labelledby="tk-pace">
      <h2 id="tk-pace">Pace planner</h2>
      <p className="muted tk-note">Each section has its own timer and locks when it ends, so you cannot borrow time. Plan to finish a first pass in about three quarters of the time and use the rest to revisit marked questions.</p>
      <label className="tk-start">Paper starts at <input type="time" value={start} onChange={(e) => setStart(e.target.value || '09:00')} /></label>
      <div className="tk-table" role="table" aria-label="Pace plan">
        <div className="tk-row tk-pace tk-head" role="row"><span>Section</span><span>Clock</span><span>Per question</span><span>First pass</span></div>
        {rows.map((r) => (
          <div className="tk-row tk-pace" role="row" key={r.id}>
            <span><b>{r.name}</b><small>{r.qs} Qs · {r.minutes} min{r.qual ? ' · qualifying' : ''}</small></span>
            <span className="nw">{range(r.from, r.to)}</span>
            <span>{r.secPerQ} s</span>
            <span>by {fmt(r.from + r.first)}</span>
          </div>
        ))}
      </div>
      <p className="muted tk-note">Finish time: <b>{fmt(t)}</b>. If a question has eaten twice its slot, mark it and move on.</p>
    </section>
  );
}

/* ---------- 3. Guess calculator ---------- */
function GuessCalc({ config }) {
  const s = Object.values(config.sections)[0]; const gain = s.marksPerQuestion, loss = s.negativeMarks;
  const [left, setLeft] = useState(2);
  const p = 1 / left; const ev = p * gain - (1 - p) * loss; const breakEven = Math.round((loss / (gain + loss)) * 100);
  return (
    <section className="card tk-card tk-wide tk-guess" id="guess" aria-labelledby="tk-guess">
      <div className="tk-gtext"><h2 id="tk-guess">Should I guess?</h2><p className="muted tk-note">A wrong answer costs {loss} mark, so a guess only pays when you are at least {breakEven}% sure. Pick how many options you could not rule out.</p></div>
      <div className="tk-pills" role="radiogroup" aria-label="Options left after eliminating">
        {[4, 3, 2, 1].map((n) => <button key={n} type="button" role="radio" aria-checked={left === n} className={left === n ? 'on' : ''} onClick={() => setLeft(n)}>{n === 1 ? 'Sure' : `${n} left`}</button>)}
      </div>
      <div className={`tk-verdict ${ev > 0.05 ? 'go' : ev < -0.05 ? 'stop' : 'flat'}`} role="status" aria-live="polite">
        <b>{ev > 0.05 ? 'Attempt it' : Math.abs(ev) <= 0.05 ? 'Break-even: skip' : 'Skip it'}</b>
        <span>Chance of being right {Math.round(p * 100)}% · expected {ev > 0 ? '+' : ''}{ev.toFixed(2)} marks per attempt</span>
      </div>
    </section>
  );
}

/* ---------- 4. Exam-day checklist ---------- */
const CHECK = [
  ['Documents', ['Printed admit card (read the instructions on it, do not write on it before the exam)', 'Original valid photo ID (Aadhaar, passport, driving licence, Voter ID or PAN)', 'Two recent passport-size photographs', 'Another original proof of date of birth if it differs on your ID']],
  ['Carry', ['Two blue or black ballpoint pens', 'A transparent water bottle, if the centre allows it', 'A photocopy of your ID as a spare']],
  ['Leave at home', ['Mobile phone, smartwatch and fitness band', 'Calculator, notes, books and paper chits', 'Earphones, storage devices and heavy metal accessories', 'Face mask or covering (your face must be visible)']],
  ['At the centre', ['Reach before the reporting time on your admit card: the gate closes strictly', 'Expect frisking, biometric checks and live photographs', 'Rough sheets are given at the centre and must be returned', 'Visit the venue the day before so the route holds no surprises']],
];
function Checklist() {
  const [done, setDone] = useState(() => LS('mockdesk-checklist', {}));
  useEffect(() => save('mockdesk-checklist', done), [done]);
  const all = CHECK.flatMap(([g, items]) => items.map((t) => `${g}:${t}`)); const n = all.filter((k) => done[k]).length;
  return (
    <section className="card tk-card tk-wide" id="check" aria-labelledby="tk-check">
      <div className="tk-head2"><h2 id="tk-check">Exam-day checklist</h2><span className="tk-count">{n} of {all.length} ready</span></div>
      <div className="tk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={n} aria-label="Checklist progress"><i style={{ width: `${(n / all.length) * 100}%` }} /></div>
      <div className="tk-groups">
        {CHECK.map(([g, items]) => (
          <fieldset key={g}><legend>{g}</legend>
            {items.map((t) => { const k = `${g}:${t}`; return <label key={k} className="check tk-item"><input type="checkbox" checked={!!done[k]} onChange={(e) => setDone((o) => ({ ...o, [k]: e.target.checked }))} /> <span>{t}</span></label>; })}
          </fieldset>
        ))}
      </div>
      <p className="muted tk-note">Compiled from exam-day guidance published for SSC CGL. Your own admit card and the official SSC notice always come first. Ticks are saved on this device only.</p>
    </section>
  );
}

export default function Toolkit() {
  const { config } = useAuth();
  const ok = useMemo(() => !!config?.sections, [config]); const { hash } = useLocation();
  useEffect(() => { if (ok && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [ok, hash]);
  if (!ok) return <p role="status" className="muted">Loading…</p>;
  return (
    <div className="tk">
      <header className="tk-hero"><h1>Exam toolkit</h1><p>Small tools for the real exam: check your score against the answer key, plan your time per section, decide when to guess and get ready for exam day.</p><Link to="/" className="back">← Dashboard</Link></header>
      <div className="tk-grid">
        <ScoreCalc config={config} />
        <PacePlanner config={config} />
        <GuessCalc config={config} />
        <Checklist />
      </div>
    </div>
  );
}
