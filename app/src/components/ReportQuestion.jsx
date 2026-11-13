import { useState } from 'react';
import { api } from '../lib/api.js';
/** "Report a problem with this question" on the review page. Goes to the admin's Reports inbox. */
export default function ReportQuestion({ qid }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('wrong_answer'); const [note, setNote] = useState(''); const [state, setState] = useState('idle');
  const send = async (e) => { e.preventDefault(); setState('sending'); try { await api.post(`/questions/${qid}/report`, { reason, note }); setState('done'); } catch { setState('error'); } };
  if (state === 'done') return <span className="rq-done" role="status">✓ Thanks, we will check this question</span>;
  return (
    <span className="rq">
      <button type="button" className="bm" aria-expanded={open} onClick={() => setOpen(!open)}>⚑ Report a problem</button>
      {open && (
        <form className="rq-pop" onSubmit={send}>
          <label>What is wrong?<select value={reason} onChange={(e) => setReason(e.target.value)}><option value="wrong_answer">The correct answer looks wrong</option><option value="unclear">The question is unclear</option><option value="typo">Typo or formatting problem</option><option value="other">Something else</option></select></label>
          <label>Details (optional)<textarea rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us what you noticed" /></label>
          {state === 'error' && <p className="alert" role="alert">Could not send. Try again.</p>}
          <div className="rq-act"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={state === 'sending'}>Send report</button></div>
        </form>
      )}
    </span>
  );
}
