import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Legend } from '../components/Palette.jsx';

export default function Instructions() {
  const { mockId } = useParams(); const nav = useNavigate(); const { config, user } = useAuth();
  const [mock, setMock] = useState(null); const [agree, setAgree] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/mocks').then((r) => setMock(r.mocks.find((m) => m.id === mockId) || false)).catch((e) => setErr(e.message)); }, [mockId]);
  if (err) return <div className="alert">{err}</div>;
  if (mock === null || !config) return <p role="status" className="muted">Loading…</p>;
  if (mock === false) return <div className="card"><p>This mock is not available yet.</p><Link to="/">Back</Link></div>;
  const begin = async () => { setBusy(true); try { const r = await api.post(`/mocks/${mockId}/start`); nav(`/exam/${r.attemptId}`); } catch (e) { setErr(e.message); setBusy(false); } };
  const segs = config.segments.filter((s) => s.sections.some((k) => mock.sections.find((x) => x.key === k)));
  return (
    <div className="instr">
      <Link to="/" className="back">← Dashboard</Link>
      <header className="in-hero">
        <div>
          <span className={`diff d-${mock.difficulty}`}>{mock.difficulty}</span>
          <h1>{mock.name}</h1>
          <p>Read the instructions once, then begin. The timers start the moment you do.</p>
        </div>
        <ul className="in-facts" aria-label="Paper at a glance">
          <li><b>{mock.totalQuestions + (mock.qualifying || []).reduce((x, q) => x + q.questions, 0)}</b><span>questions</span></li>
          <li><b>{mock.totalMarks}</b><span>scored marks</span></li>
          <li><b>{mock.totalMinutes}</b><span>minutes</span></li>
        </ul>
      </header>

      <div className="in-cols">
        <div className="in-main">
          <section className="card"><h2>Sections and timing</h2>
            <ol className="in-secs">
              {segs.map((s) => s.sections.map((k) => { const n = mock.sections.find((x) => x.key === k)?.questions; const c = config.sections[k]; return (
                <li key={k} className={`s-${k}`}>
                  <span className="in-dot" aria-hidden="true" />
                  <div><b>{c.name}</b>{c.qualifying && <span className="qual-tag inline">Qualifying</span>}<small>{n} questions · {n * c.marksPerQuestion} marks{c.qualifying ? ` (pass ${c.qualifyingMarks})` : ''}</small></div>
                  <span className="in-min">{s.minutes} min</span>
                </li>); }))}
            </ol>
          </section>
          <section className="card"><h2>Instructions</h2>
            <ol className="instr-list in-list">{config.instructions.map((t, i) => <li key={i}>{t}</li>)}</ol>
            <h3>Question palette</h3><Legend labels={config.statuses} />
            <p className="small muted">Shortcuts: 1–4 or A–D to choose an option, ← → to move between questions.</p>
          </section>
        </div>

        <aside className="in-side card" aria-label="Before you begin">
          <h2>Before you begin</h2>
          <ul className="in-ready">
            <li>A quiet place for {mock.totalMinutes} minutes</li>
            <li>Stable internet (progress is saved as you go)</li>
            <li>Pen and rough sheet, no calculator</li>
            <li>Phone on silent</li>
          </ul>
          <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>I have read the instructions, {user.name}, and I am ready to begin.</span></label>
          <button className="btn btn-primary btn-lg" disabled={!agree || busy} onClick={begin}>{busy ? 'Starting…' : 'Begin test'}</button>
        </aside>
      </div>
    </div>
  );
}
