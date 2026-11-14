import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Err, PageHead } from './ui.jsx';

export default function Ask() {
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [log, setLog] = useState([]); const [examples, setExamples] = useState([]); const inp = useRef(null);
  useEffect(() => { api.get('/admin/ask/examples').then((r) => setExamples(r.examples)).catch(() => {}); }, []);
  async function ask(text) {
    const t = (text ?? q).trim(); if (t.length < 3 || busy) return;
    setBusy(true); setErr('');
    try { const r = await api.post('/admin/ask', { q: t }); setLog((l) => [{ ...r, id: Date.now() }, ...l]); setQ(''); inp.current?.focus(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHead title="Ask your data" sub="Ask in plain English. Answers come straight from your students' results, with nothing guessed." />
      <form className="card ask-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label className="sr-only" htmlFor="ask-q">Your question</label>
        <input id="ask-q" ref={inp} value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder='For example: "How did Mock 3 go?"' autoFocus />
        <button className="btn btn-primary" disabled={busy || q.trim().length < 3}>{busy ? 'Working…' : 'Ask'}</button>
      </form>
      <div className="ask-ex" role="group" aria-label="Example questions">{examples.map((x) => <button key={x} type="button" className="ad-pill" onClick={() => ask(x)}>{x}</button>)}</div>
      <Err>{err}</Err>
      {!log.length && !err && <p className="muted" style={{ marginTop: 18 }}>Pick an example or type a question. You can ask about a mock ("How did Mock 2 go?"), a student by name or email, topics, sign-ups, live tests, integrity flags or doubts, and add a time such as "today" or "this week".</p>}
      <div className="ask-log">
        {log.map((a) => (
          <article key={a.id} className="card ask-a">
            <h3>{a.q}</h3>
            {a.answer.map((p, i) => <p key={i}>{p}</p>)}
            {a.table && (
              <div className="tbl-wrap"><table className="dtable"><thead><tr>{a.table.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{a.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
            )}
            {a.link && <p><Link to={a.link.to}>{a.link.label} →</Link></p>}
            {a.help && <p className="muted small">I answer from your database only, so I cannot help with other topics.</p>}
          </article>
        ))}
      </div>
    </>
  );
}
