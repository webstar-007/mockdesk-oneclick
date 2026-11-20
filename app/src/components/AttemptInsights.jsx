import { Link } from 'react-router-dom';
import { LABELS, behaviour, strategy } from '../lib/attempt.js';
import { fmtDateTime } from '../lib/format.js';

/** Result page blocks: how you attempted, the what-if strategy, and notes from your teacher. */
export function AttemptStyle({ d }) {
  const b = behaviour(d); const order = ['perfect', 'overtime_correct', 'wrong', 'too_fast', 'overtime_wrong', 'wasted', 'skipped'];
  return (
    <section className="an-card an-wide ai-style" aria-label="How you attempted this test">
      <h2>How you attempted this test: <em>{b.title}</em></h2>
      <p>{b.line}</p>
      <ul className="ai-bars">{order.filter((k) => b.counts[k]).map((k) => <li key={k} className={`t-${LABELS[k].tone}`} title={LABELS[k].tip}><span>{LABELS[k].text}</span><i style={{ width: `${Math.max(4, (b.counts[k] / b.total) * 100)}%` }} /><b>{b.counts[k]}</b></li>)}</ul>
      <p className="small muted">Every question carries one of these labels in the review. “Too fast” and “slow” are judged against the time each section allows per question.</p>
    </section>
  );
}

export function StrategyReport({ d }) {
  const { items, rate } = strategy(d);
  if (!items.length) return null;
  return (
    <section className="an-card an-wide ai-strategy" aria-label="What would have raised your score">
      <h2>What would have raised your score</h2>
      <ol className="ai-fixes">{items.map((x) => <li key={x.key}><b>{x.title}</b><p>{x.body}</p></li>)}</ol>
      {rate && <div className="tbl-wrap"><table className="dtable"><caption className="sr-only">Marks per minute by section</caption><thead><tr><th scope="col">Section</th><th scope="col">Score</th><th scope="col">Minutes</th><th scope="col">Marks per minute</th></tr></thead><tbody>{rate.map((x) => <tr key={x.key}><th scope="row">{x.name}</th><td>{x.score}</td><td>{x.mins}</td><td>{Math.round(x.perMin * 100) / 100}</td></tr>)}</tbody></table></div>}
      <p className="small muted">These are estimates from this one attempt, not guarantees.</p>
    </section>
  );
}

export function TeacherNotes({ notes }) {
  if (!notes?.length) return null;
  return (
    <section className="an-card an-wide ai-notes" aria-label="Notes from your teacher">
      <h2>Notes from your teacher</h2>
      <ul>{notes.map((n) => <li key={n.id}><p>{n.note}</p><span className="small muted">{n.teacher} · {fmtDateTime(n.at)}</span></li>)}</ul>
    </section>
  );
}

export function IntegrityBadge({ live }) {
  if (!live?.integrity) return null;
  const t = { pending: ['Checks run when the window closes', 'idle'], verified: [`Integrity checked${live.removedCount ? `. ${live.removedCount} attempt${live.removedCount === 1 ? ' was' : 's were'} removed after review` : ''}`, 'ok'], removed: ['Removed from the leaderboard after an integrity review', 'bad'] }[live.integrity];
  return <p className={`ai-integrity i-${t[1]}`} role="note"><span aria-hidden="true">{t[1] === 'ok' ? '✓' : t[1] === 'bad' ? '!' : '…'}</span> {t[0]}.</p>;
}
