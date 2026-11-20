import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

/** Public list of corrections: what changed, in which mock, how many scores were updated. */
export default function FixLog() {
  const { config } = useAuth(); const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get('/fixes').then(setD).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="fixlog">
      <Link to="/" className="back">← Dashboard</Link>
      <div className="pagehead"><div><h1>Corrections</h1><p className="muted">When we find a wrong answer key, we fix it, re-score every affected attempt and list it here. Report a question from the review page if you spot one.</p></div></div>
      {err && <div className="alert" role="alert">{err}</div>}
      {!d ? <p className="muted" role="status">Loading…</p> : !d.fixes.length ? <div className="card empty"><h2>No corrections yet</h2><p className="muted">Any fix to an answer key will appear here.</p></div> : (
        <ul className="fx-list">{d.fixes.map((x) => (
          <li key={x.id} className="card"><div className="fx-head"><b>{x.mockName}</b><span className="muted small">{fmtDate(x.at)}</span></div>
            <p>{config?.sections?.[x.section]?.name || x.section}, question {x.number}. {x.summary}</p>
            {x.kind === 'answer' && <p className="small muted">{x.affected ? `${x.affected} score${x.affected === 1 ? ' was' : 's were'} updated and the students told.` : 'No finished attempt changed.'}</p>}</li>))}</ul>)}
    </div>
  );
}
