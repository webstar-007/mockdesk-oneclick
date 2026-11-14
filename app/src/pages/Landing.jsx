import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '../styles/landing.css';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { api } from '../lib/api.js';

// Palette states, same colours as the real exam screen: answered, not answered, marked for review, not visited.
const STATES = ['a', 'n', 'm', 'v'];
const STATE_NAME = { a: 'answered', n: 'not answered', m: 'marked for review', v: 'not visited' };
const START = 'aaaaaaaamaaanaaamavvvvvvvvvvvv'.split('');

function Paper() {
  const [cells, setCells] = useState(START);
  const [left, setLeft] = useState(29 * 60 + 41);
  useEffect(() => { const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000); return () => clearInterval(t); }, []);
  const count = (k) => cells.filter((c) => c === k).length;
  const cycle = (i) => setCells((cs) => cs.map((c, j) => (j === i ? STATES[(STATES.indexOf(c) + 1) % STATES.length] : c)));
  const mm = String(Math.floor(left / 60)).padStart(2, '0'); const ss = String(left % 60).padStart(2, '0');
  return (
    <figure className="lp-paper" aria-label="Sample question palette">
      <div className="lp-paper-bar"><span>Section 1 · Mathematical Abilities</span><b aria-label={`${mm} minutes ${ss} seconds left`}>{mm}:{ss}</b></div>
      <div className="lp-grid" role="group" aria-label="Question palette. Press a number to change its status.">
        {cells.map((c, i) => (
          <button key={i} type="button" className={`lp-q q-${c}${i === 12 ? ' now' : ''}`} style={{ '--i': i }} onClick={() => cycle(i)} aria-label={`Question ${i + 1}, ${STATE_NAME[c]}`}>{i + 1}</button>
        ))}
      </div>
      <ul className="lp-key" aria-label="Palette summary">
        {STATES.map((k) => <li key={k}><i className={`q-${k}`} aria-hidden="true" /><b>{count(k)}</b> {STATE_NAME[k]}</li>)}
      </ul>
      <figcaption>Press any number to try the palette.</figcaption>
    </figure>
  );
}

function PatternBar({ sections, segments }) {
  const total = sections.reduce((a, s) => a + s.questions, 0);
  const mins = (k) => { const g = segments.find((s) => s.sections.includes(k)); return g ? `${g.minutes} min${g.sections.length > 1 ? ' shared' : ''}` : ''; };
  return (
    <div>
      <div className="lp-bar" role="img" aria-label={sections.map((s) => `${s.short} ${s.questions} questions`).join(', ')}>
        {sections.map((s, i) => <span key={s.key} className={`lp-seg s${i}${s.qualifying ? ' qual' : ''}`} style={{ flexGrow: s.questions }}>{s.short}</span>)}
      </div>
      <div className="tbl-wrap">
        <table className="lp-table">
          <caption className="sr-only">Sections of the paper</caption>
          <thead><tr><th>Section</th><th>Questions</th><th>Time</th><th>Marks</th></tr></thead>
          <tbody>
            {sections.map((s, i) => (
              <tr key={s.key}>
                <td><i className={`lp-dot s${i}${s.qualifying ? ' qual' : ''}`} aria-hidden="true" />{s.name}</td>
                <td>{s.questions}</td><td>{mins(s.key)}</td>
                <td>{s.qualifying ? <>Qualifying: pass {s.qualifyingMarks}/{s.questions * s.marks}</> : <>{s.questions * s.marks}</>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Scored total</td><td>{sections.filter((s) => !s.qualifying).reduce((a, s) => a + s.questions, 0)}</td><td /><td>{sections.filter((s) => !s.qualifying).reduce((a, s) => a + s.questions * s.marks, 0)}</td></tr></tfoot>
        </table>
      </div>
      <p className="muted small">Each correct answer earns +{sections[0].marks}; each wrong answer costs −{sections[0].negative}; skipped questions score 0. {total} questions in all, including the qualifying section.</p>
    </div>
  );
}

const FEATURES = [
  ['Sectional timers', 'Every section has its own countdown and locks when time is up, the way the real paper does.'],
  ['The exam-day palette', 'Answered, not answered, marked for review and not visited are colour-coded, with a question grid you can jump around.'],
  ['Marking that matches', '+3 for right, −1 for wrong, and the Computer Knowledge cut-off shown separately from your total.'],
  ['A breakdown after every attempt', 'Score, accuracy, time per section, weak topics and where your marks went.'],
  ['Solutions you can keep', 'Download your report or the full solutions as a PDF and revise offline.'],
  ['Built for your phone', 'Take a full test on a phone, resume if you get cut off, and switch to dark mode for late practice.'],
];
const FAQ = [
  ['Which exam is this for?', 'SSC CGL Tier-II, Paper-I: Mathematical Abilities, Reasoning, English, General Awareness, and the qualifying Computer Knowledge section.'],
  ['Do I need an account to look around?', 'No. This page is open to everyone. You sign in when you start a test, so your answers and results are saved to you.'],
  ['What if my internet drops in the middle of a test?', 'Open MockDesk again and resume. Your saved answers are kept and the section timer keeps running, as it would in the exam.'],
  ['Are these the real SSC questions?', 'No. They are practice mocks built to the Tier-II pattern. Always check the latest official SSC notice for the exam rules.'],
  ['Can I use it on my phone?', 'Yes. The test screen, palette and results all work on a phone.'],
];

export default function Landing() {
  const [d, setD] = useState(null); const [err, setErr] = useState(false);
  useEffect(() => { api.get('/public/overview').then(setD).catch(() => setErr(true)); }, []);
  const scored = useMemo(() => (d ? d.sections.filter((s) => !s.qualifying) : []), [d]);
  const goto = (id) => ({ pathname: '/login', state: { from: `/mock/${id}` } });
  return (
    <div className="lp">
      <a className="skip" href="#lp-main">Skip to content</a>
      <header className="lp-head">
        <div className="lp-wrap lp-head-in">
          <Link to="/" className="brand" aria-label="MockDesk home"><span className="brand-mark" aria-hidden="true">✓</span><span>MockDesk</span></Link>
          <nav aria-label="Page sections"><a href="#mocks">Mocks</a><a href="#pattern">Exam pattern</a><a href="#how">How it works</a><a href="#faq">FAQ</a></nav>
          <div className="lp-head-act"><ThemeToggle /><Link className="btn btn-ghost btn-sm" to="/login">Log in</Link><Link className="btn btn-primary btn-sm" to="/register">Sign up</Link></div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-txt">
              <h1>Practise the SSC CGL Tier-II paper on a screen that works like the real one.</h1>
              <p className="lp-lede">Full-length mocks with sectional timers, +3 / −1 marking and a question-by-question breakdown when you finish.</p>
              <div className="lp-cta">
                <Link className="btn btn-primary btn-lg" to="/register">Create a free account</Link>
                <Link className="btn btn-lg" to="/login">Log in</Link>
              </div>
              <p className="muted small">Sign up with your email or phone number. No payment details needed.</p>
            </div>
            <Paper />
          </div>
        </section>

        <section className="lp-facts" aria-label="At a glance">
          <div className="lp-wrap">
            <dl>
              <div><dt>Full-length mocks</dt><dd>{d ? d.totals.mocks : '–'}</dd></div>
              <div><dt>Questions to practise</dt><dd>{d ? d.totals.questions.toLocaleString('en-IN') : '–'}</dd></div>
              <div><dt>Scored per paper</dt><dd>{d ? `${scored.reduce((a, s) => a + s.questions, 0)} questions` : '–'}</dd></div>
              <div><dt>Marks per paper</dt><dd>{d ? scored.reduce((a, s) => a + s.questions * s.marks, 0) : '–'}</dd></div>
            </dl>
          </div>
        </section>

        <section id="mocks" className="lp-sec">
          <div className="lp-wrap">
            <h2>Pick a mock</h2>
            <p className="lp-sub">Browse freely. You will be asked to log in or sign up when you start one.</p>
            {err && <p className="alert" role="alert">Could not load the mocks. Check your connection and refresh.</p>}
            {d && !d.mocks.length && <p className="card">New mocks will appear here soon.</p>}
            <ul className="lp-mocks">
              {(d?.mocks || []).map((m) => (
                <li key={m.id}>
                  <Link to={goto(m.id)} className="lp-mock">
                    <span className="lp-mock-n" aria-hidden="true">{m.number}</span>
                    <span className="lp-mock-main">
                      <b>{m.name}</b>
                      <span className="muted">{m.description}</span>
                    </span>
                    <span className="lp-mock-meta"><span className={`diff d-${m.difficulty}`}>{m.difficulty}</span><span>{m.questions} questions · {m.marks} marks · {m.minutes} min</span></span>
                    <span className="lp-mock-go">Log in to attempt</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pattern" className="lp-sec lp-alt">
          <div className="lp-wrap lp-two">
            <div><h2>The paper, section by section</h2><p className="lp-sub">Questions are split the same way as Tier-II Paper-I, so you learn to spend your minutes where the marks are.</p></div>
            {d ? <PatternBar sections={d.sections} segments={d.segments} /> : <p className="muted">Loading the pattern…</p>}
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <h2>What you get in every test</h2>
            <dl className="lp-feats">
              {FEATURES.map(([t, p]) => <div key={t}><dt>{t}</dt><dd>{p}</dd></div>)}
            </dl>
          </div>
        </section>

        <section id="how" className="lp-sec lp-alt">
          <div className="lp-wrap">
            <h2>How it works</h2>
            <ol className="lp-steps">
              <li><b>Create your account</b><span>Use your email or phone number. A one-time code confirms it is you.</span></li>
              <li><b>Take a mock</b><span>Choose a paper, read the instructions and start the clock. Your timer is kept on the server.</span></li>
              <li><b>Review and improve</b><span>See your score, weak topics and every solution, then pick your next mock.</span></li>
            </ol>
          </div>
        </section>

        <section id="faq" className="lp-sec">
          <div className="lp-wrap lp-faq-wrap">
            <h2>Questions students ask</h2>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        <section className="lp-band">
          <div className="lp-wrap">
            <h2>Start with one full paper.</h2>
            <p>Your first result shows exactly which topics to fix next.</p>
            <div className="lp-cta"><Link className="btn btn-lg lp-btn-inv" to="/register">Create a free account</Link><Link className="btn btn-lg lp-btn-line" to="/login">Log in</Link></div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span><b>MockDesk</b> · Online mock tests for government exams</span>
          <span className="muted small">An independent practice platform. Not affiliated with or endorsed by the Staff Selection Commission.</span>
          <span className="lp-foot-links"><Link to="/login">Log in</Link><Link to="/register">Sign up</Link></span>
        </div>
      </footer>
    </div>
  );
}
