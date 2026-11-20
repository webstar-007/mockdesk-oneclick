import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDateTime, num } from '../lib/format.js';

/** Live mock: window, your standing and (after it closes) the top 10. Names are shown as "First L." */
export default function LiveBoard() {
  const { mockId } = useParams(); const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get(`/mocks/${mockId}/live`).then(setD).catch((e) => setErr(e.message)); }, [mockId]);
  if (err) return <div className="alert" role="alert">{err} <Link to="/">Dashboard</Link></div>;
  if (!d) return <p className="muted" role="status">Loading…</p>;
  return (
    <div className="lv">
      <Link to="/" className="back">← Dashboard</Link>
      <div className="pagehead"><div><h1>{d.name}</h1><p className="muted">Live mock · {d.state === 'upcoming' ? `opens ${fmtDateTime(d.opensAt)}` : d.state === 'open' ? `open until ${fmtDateTime(d.closesAt)}` : `closed ${fmtDateTime(d.closesAt)}`}</p></div>{d.state === 'open' && <Link className="btn btn-primary" to={`/mock/${mockId}`}>{d.mine ? 'View result' : 'Start the test'}</Link>}</div>
      <section className="card lv-info">
        <p>Start any time between {fmtDateTime(d.opensAt)} and {fmtDateTime(d.closesAt)}. Everyone takes the same paper, but you do not need to start together. Your <b>first finished attempt</b> inside the window counts for rank. Ranks appear once the window closes.</p>
        {d.state === 'closed' && <p className="ai-integrity i-ok" role="note"><span aria-hidden="true">✓</span> Integrity checked{d.removed ? `. ${d.removed} attempt${d.removed === 1 ? ' was' : 's were'} removed after review` : ''}.</p>}
        <p className="muted small">{d.participants} student{d.participants === 1 ? '' : 's'} {d.state === 'closed' ? 'ranked' : 'finished so far'}.</p>
      </section>
      {d.state === 'closed' && d.mine?.rank && <section className="card lv-me"><h2>Your rank</h2><p className="lv-big">#{d.mine.rank}<small> of {d.mine.of}</small></p><p className="muted">Score {num(d.mine.score)} · accuracy {num(d.mine.accuracy)}% · ahead of {d.mine.percentile}% of students. <Link to={`/results/${d.mine.attemptId}`}>Open analysis</Link></p></section>}
      {d.state === 'closed' && !d.mine?.rank && <section className="card"><p className="muted">You did not finish this paper inside the window, so you are not on the board. You can still attempt it for practice from the dashboard.</p></section>}
      {d.state === 'closed' && d.top?.length > 0 && (
        <section className="card nopad"><div className="tbl-wrap"><table className="dtable"><caption className="sr-only">Top 10</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Score</th><th scope="col">Accuracy</th></tr></thead>
          <tbody>{d.top.map((r) => <tr key={r.rank} className={r.you ? 'me' : ''}><th scope="row">{r.rank}</th><td>{r.name}{r.you ? ' (you)' : ''}</td><td>{num(r.score)}</td><td>{num(r.accuracy)}%</td></tr>)}</tbody></table></div></section>)}
    </div>
  );
}
