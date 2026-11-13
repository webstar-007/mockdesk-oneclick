import Rich from './Rich.jsx';
import { LETTERS, duration } from '../lib/format.js';
const VERDICT = { correct: ['Correct', 'good'], incorrect: ['Incorrect', 'wrong'], unattempted: ['Not attempted', 'none'] };
export default function SolutionViewer({ q }) {
  const [vt, vc] = VERDICT[q.status];
  const marks = q.marksAwarded > 0 ? `+${q.marksAwarded}` : q.marksAwarded < 0 ? `−${Math.abs(q.marksAwarded)}` : '0';
  return (
    <section className="sol" aria-label="Solution">
      <div className={`verdict ${vc}`}>
        <strong>{vt}</strong><span>{marks} marks</span>
        <span>Your answer: {q.selected == null ? '—' : LETTERS[q.selected]}</span><span>Correct: {LETTERS[q.correct]}</span>
        <span>Time: {duration(q.timeSec)}</span>{q.marked && <span className="flag">Marked for review</span>}
      </div>
      <p className="topicline"><b>Topic:</b> {q.topic}{q.subtopic ? ` › ${q.subtopic}` : ''} <span className={`diff d-${q.difficulty}`}>{q.difficulty}</span>{q.currentAffairs && <span className="diff d-ca">current affairs</span>}</p>
      {q.status === 'incorrect' && q.whyWrong && (<div className="box bad"><h4>Why your answer was wrong</h4><p>Option {LETTERS[q.selected]}: <Rich text={q.whyWrong} /></p></div>)}
      {q.status === 'unattempted' && <div className="box neutral"><h4>You skipped this one</h4><p>Skipping costs nothing, but check whether the method below was within reach in the time you had.</p></div>}
      <div className="box"><h4>{q.status === 'incorrect' ? 'How it should have been solved' : 'Explanation'}</h4><p><Rich text={q.explanation} /></p>
        {q.solutionImage && <img className="qimg" src={q.solutionImage} alt="Solution illustration" loading="lazy" />}
        {q.steps?.length > 0 && <ol className="steps">{q.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>}</div>
      {q.shortcut && <div className="box tip"><h4>Faster method</h4><p><Rich text={q.shortcut} /></p></div>}
      <div className="insights">
        {q.trap && <div><h4>Common mistake</h4><p><Rich text={q.trap} /></p></div>}
        {q.revise && <div><h4>Concept to revise</h4><p><Rich text={q.revise} /></p></div>}
        {q.approach && <div><h4>Approach for similar questions</h4><p><Rich text={q.approach} /></p></div>}
      </div>
      {q.status !== 'correct' && q.wrongReasons && (
        <details className="why-opts"><summary>Why the other options fail</summary>
          <ul>{q.options.map((o, i) => (i === q.correct ? null : q.wrongReasons[i] ? <li key={i}><b>{LETTERS[i]}.</b> <Rich text={q.wrongReasons[i]} /></li> : null))}</ul></details>
      )}
    </section>
  );
}
