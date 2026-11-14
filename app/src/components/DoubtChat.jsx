import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Rich from './Rich.jsx';

const START = [['explain', 'Explain the solution'], ['mine', 'Why was my answer wrong?'], ['shortcut', 'Is there a faster way?'], ['steps', 'Show the steps']];
const kept = new Map(); // keeps the conversation per question while the student moves around the review

/** Free doubt helper. It only ever talks about the question on screen. */
export default function DoubtChat({ attemptId, q, gate }) {
  const key = `${attemptId}:${q.id}`;
  const [msgs, setMsgs] = useState(() => kept.get(key) || []);
  const [open, setOpen] = useState(() => (kept.get(key) || []).length > 0);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [lock, setLock] = useState(gate && gate.available === false ? gate.reason : '');
  const [left, setLeft] = useState(gate?.left);
  const end = useRef(null);
  useEffect(() => { kept.set(key, msgs); end.current?.scrollIntoView?.({ block: 'nearest' }); }, [msgs, key]);
  const last = [...msgs].reverse().find((m) => m.who === 'bot');
  const chips = last?.chips?.map((c) => [c.label, c.label]) || START;

  async function ask(message) {
    const m = message.trim(); if (!m || busy) return;
    setBusy(true); setErr(''); setText('');
    setMsgs((x) => [...x, { who: 'you', text: m }]);
    try {
      const r = await api.post(`/attempts/${attemptId}/doubt`, { questionId: q.id, message: m });
      setMsgs((x) => [...x, { who: 'bot', replies: r.replies, chips: r.chips }]); setLeft(r.left);
    } catch (e) {
      if (e.code === 'CHAT_LOCKED' || e.code === 'CHAT_LIMIT') setLock(e.message); else setErr(e.message);
      setMsgs((x) => x.slice(0, -1));
    } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="btn dbt-open" onClick={() => setOpen(true)}>💬 Ask about this question</button>;
  return (
    <section className="dbt" aria-label="Ask about this question">
      <header><div><h3>Ask about this question</h3><p className="muted small">Free help. It only answers about this one question.{left != null && !lock ? ` ${left} left this hour.` : ''}</p></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Hide the helper">Hide</button></header>
      <div className="dbt-log" role="log" aria-live="polite">
        {!msgs.length && <p className="muted small">Try a button below, or type your own question.</p>}
        {msgs.map((m, i) => m.who === 'you'
          ? <p key={i} className="dbt-you">{m.text}</p>
          : <div key={i} className="dbt-bot">{m.replies.map((r, j) => (
            <div key={j}><b>{r.title}</b><p><Rich text={r.text} /></p>{r.steps && <ol className="steps">{r.steps.map((s, k) => <li key={k}><Rich text={s} /></li>)}</ol>}</div>))}</div>)}
        {busy && <p className="muted small" role="status">Thinking…</p>}
        <span ref={end} />
      </div>
      {lock ? <p className="dbt-lock" role="status">{lock}</p> : (
        <>
          <div className="dbt-chips">{chips.map(([k, l]) => <button key={k} type="button" className="chip" disabled={busy} onClick={() => ask(l)}>{l}</button>)}</div>
          <form className="dbt-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <label className="sr-only" htmlFor={`dbt-${q.id}`}>Your question about this problem</label>
            <input id={`dbt-${q.id}`} value={text} maxLength={300} placeholder="Type your doubt about this question" onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !text.trim()}>Ask</button>
          </form>
          {err && <p className="alert" role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}
