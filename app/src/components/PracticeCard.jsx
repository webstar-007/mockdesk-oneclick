import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
/** One tap builds a test from the student's weak topics. Marked as practice, so it never reaches a leaderboard. */
export default function PracticeCard() {
  const nav = useNavigate(); const [o, setO] = useState(null); const [size, setSize] = useState(20); const [prev, setPrev] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { api.get('/practice/overview').then(setO).catch(() => setO(false)); }, []);
  if (o === null || o === false) return null;
  const build = async (dryRun) => {
    setBusy(true); setErr('');
    try { const r = await api.post('/practice', { size, dryRun }); if (dryRun) setPrev(r); else nav(`/exam/${r.attemptId}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (o.inProgress) return (
    <section className="pr card" aria-label="Practice set"><div><h2>Practice set in progress</h2><p className="muted">You started a practice set built from your weak topics. Pick up where you left off.</p></div><button className="btn btn-primary" onClick={() => nav(`/exam/${o.inProgress}`)}>Resume practice</button></section>);
  return (
    <section className="pr card" aria-label="Practice set">
      <div className="pr-main">
        <h2>Practise your weak topics</h2>
        {o.needsMock ? <p className="muted">Finish one full mock and we will build practice sets from the topics you get wrong. Practice sets do not count on any leaderboard.</p> : (
          <>
            <p className="muted">One tap builds a short test from your weakest topics, mixed with questions you have not seen. It is marked as practice and does not count on any leaderboard.</p>
            {o.weak?.length > 0 && <ul className="pr-weak" aria-label="Your weakest topics">{o.weak.slice(0, 4).map((t) => <li key={t.section + t.topic}>{t.topic}<b>{t.accuracy}%</b></li>)}</ul>}
            <div className="pr-row">
              <div className="pr-size" role="radiogroup" aria-label="Number of questions">{o.sizes.map((n) => <button key={n} type="button" role="radio" aria-checked={size === n} className={size === n ? 'on' : ''} onClick={() => { setSize(n); setPrev(null); }}>{n} questions</button>)}</div>
              <button className="btn btn-primary" disabled={busy || !o.ready || o.left < 1} onClick={() => build(true)}>{busy ? 'Building…' : 'Build my practice set'}</button>
            </div>
            <p className="small muted">{o.left > 0 ? `${o.left} practice set${o.left === 1 ? '' : 's'} left today.` : 'You have used today’s practice sets. Come back tomorrow.'}{!o.ready && ' There are not enough questions yet.'}</p>
          </>)}
        {err && <p className="alert" role="alert">{err}</p>}
        {prev && (
          <div className="pr-prev" role="status"><b>{prev.count} questions · {prev.minutes} min</b>
            <ul>{prev.topics.map((t) => <li key={t.section + t.topic}>{t.topic} <span className="muted">×{t.count}</span>{t.weak && <em>weak</em>}</li>)}</ul>
            <div className="pr-row"><button className="btn btn-primary" disabled={busy} onClick={() => build(false)}>Start practice</button><button className="btn btn-ghost" disabled={busy} onClick={() => build(true)}>Shuffle</button></div></div>)}
      </div>
    </section>
  );
}
