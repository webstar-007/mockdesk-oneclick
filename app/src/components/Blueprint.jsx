import { tip } from './Tip.jsx';
const GLYPH = { maths: '∑', reasoning: '◈', english: 'Aa', ga: '◎', computer: '⌨' };
const COLOR = { maths: '#2563eb', reasoning: '#7c3aed', english: '#0891b2', ga: '#d97706', computer: '#16a34a' };

/** Exam blueprint: a timed track of sections plus a detail card per section. All numbers come from the exam config. */
export default function Blueprint({ config, examName }) {
  if (!config?.sections || !config?.segments) return null;
  const secs = Object.entries(config.sections);
  const totalMin = config.segments.reduce((a, g) => a + g.minutes, 0);
  const totalQ = secs.reduce((a, [, c]) => a + c.questions, 0);
  const scored = secs.filter(([, c]) => !c.qualifying);
  const scoredMarks = scored.reduce((a, [, c]) => a + c.questions * c.marksPerQuestion, 0);
  const first = scored[0]?.[1];
  const minsOf = (k) => config.segments.find((g) => g.sections.includes(k))?.minutes || 0;
  let acc = 0; const stops = [0, ...config.segments.map((g) => (acc += g.minutes))];
  const qual = secs.find(([, c]) => c.qualifying)?.[1];
  return (
    <section className="bp" aria-label="Exam pattern">
      <header className="bp-head">
        <div><p className="bp-eyebrow">Exam blueprint</p><h2>{examName} pattern</h2></div>
        <ul className="bp-facts" aria-label="Paper at a glance">
          <li><b>{totalQ}</b><span>questions</span></li>
          <li><b>{totalMin}</b><span>minutes</span></li>
          <li><b>{scoredMarks}</b><span>scored marks</span></li>
        </ul>
      </header>

      <div className="bp-track" role="img" aria-label={`Timed sections in order: ${config.segments.map((g) => `${g.sections.map((k) => config.sections[k].short).join(' and ')} ${g.minutes} minutes`).join(', ')}`}>
        {config.segments.map((g, i) => {
          const k = g.sections[0]; const c = config.sections[k];
          return (
            <div key={g.id} className={`bp-seg${c.qualifying ? ' q' : ''}`} style={{ flex: g.minutes, '--c': COLOR[k] }} tabIndex={0} {...tip({ t: `Section ${i + 1} of ${config.segments.length}`, v: g.sections.map((x) => config.sections[x].name).join(' + '), tone: c.qualifying ? 'warn' : 'brand', rows: [['Time', `${g.minutes} min`], ['Starts at', `${stops[i]} min`], ['Questions', g.sections.reduce((a, x) => a + config.sections[x].questions, 0)], ['Per question', `${Math.round((g.minutes * 60) / g.sections.reduce((a, x) => a + config.sections[x].questions, 0))} s`]], hint: c.qualifying ? 'Qualifying, marks not added to total' : undefined })}>
              <span className="bp-no">{i + 1}</span>
              <b>{g.sections.map((x) => config.sections[x].short).join(' + ')}</b>
              <small>{g.minutes} min</small>
            </div>
          );
        })}
      </div>
      <div className="bp-axis" aria-hidden="true">{config.segments.map((g, i) => <span key={g.id} style={{ flex: g.minutes }}>{i === 0 ? '0' : ''}<em>{stops[i + 1]}′</em></span>)}</div>
      <p className="bp-lock"><span aria-hidden="true">🔒</span> Each section has its own timer and locks when it ends. You cannot go back or carry time forward.</p>

      <div className="bp-cards">
        {secs.map(([k, c]) => {
          const mins = minsOf(k); const marks = c.questions * c.marksPerQuestion; const share = c.qualifying ? 0 : Math.round((marks / scoredMarks) * 100);
          return (
            <article key={k} className={`bp-card${c.qualifying ? ' q' : ''}`} style={{ '--c': COLOR[k] }}>
              <div className="bp-ico" aria-hidden="true">{GLYPH[k]}</div>
              <h3>{c.name}</h3>
              <p className="bp-big"><b>{c.questions}</b> questions</p>
              <dl>
                <div><dt>Marks</dt><dd>{marks}{c.qualifying ? ' (not counted)' : ''}</dd></div>
                <div><dt>Time</dt><dd>{mins} min</dd></div>
                <div><dt>Per question</dt><dd>{Math.round((mins * 60) / c.questions)} s</dd></div>
              </dl>
              {c.qualifying ? <span className="bp-tag">Qualifying · {c.qualifyingMarks} of {marks} needed</span> : <div className="bp-share" tabIndex={0} {...tip({ t: c.name, v: `${share}% of scored marks`, rows: [['Marks', `${marks} of ${scoredMarks}`]] })}><i style={{ width: `${share}%` }} /><span>{share}% of marks</span></div>}
            </article>
          );
        })}
      </div>

      <ul className="bp-rules">
        <li><b>+{first?.marksPerQuestion} / −{first?.negativeMarks}</b><span>Every wrong answer costs {first?.negativeMarks} mark. Skipping costs nothing.</span></li>
        <li><b>{scored.length} scored sections</b><span>Their marks add up to the {scoredMarks}-mark total.</span></li>
        {qual && <li><b>Computer qualifies</b><span>Score {qual.qualifyingMarks} of {qual.questions * qual.marksPerQuestion} to qualify. Its marks are not added to the total.</span></li>}
      </ul>
    </section>
  );
}
