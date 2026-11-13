import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { BarChart } from '../components/Charts.jsx';
import PdfMenu from '../components/PdfMenu.jsx';
import { tip } from '../components/Tip.jsx';
import { duration, fmtDateTime, num } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { analyse } from '../lib/analysis.js';

export default function ResultPage() {
  const { attemptId } = useParams(); const { config } = useAuth();
  const [allTopics, setAllTopics] = useState(false);
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get(`/attempts/${attemptId}/result`).then(setD).catch((e) => setErr(e.message)); }, [attemptId]);
  if (err) return <div className="alert" role="alert">{err} <Link to="/">Dashboard</Link></div>;
  if (!d) return <p className="muted" role="status">Preparing your analysis…</p>;
  const s = d.summary;
  const A = analyse(d, config);
  const { wrong, penalty: negLost } = A;
  const qual = d.qualifying || [];
  const traps = [...new Map(wrong.map((q) => [q.trap, q])).values()].slice(0, 4);
  const revise = [...new Set(wrong.map((q) => q.revise))].slice(0, 6);
  const best = [...d.sections].sort((a, b) => b.score / b.maxMarks - a.score / a.maxMarks);
  const cmp = d.compare?.previousSameMock || d.compare?.previous; const cmpLabel = d.compare?.previousSameMock ? 'your last attempt of this mock' : d.compare?.previous ? `${d.compare.previous.mockName?.replace('CGL Tier-II ', '')}` : '';
  const delta = (v, unit = '') => (v === 0 ? 'no change' : `${v > 0 ? '▲ +' : '▼ −'}${Math.abs(Math.round(v * 10) / 10)}${unit}`);
  const com = d.community;
  const tot = s.maxMarks || 1;
  const seg = [['Net score', A.net, 'sg-net'], ['Penalty marks', A.penalty, 'sg-pen'], ['Missed on wrong answers', A.wrongMissed, 'sg-miss'], ['Left blank', A.skippedMarks, 'sg-skip']];
  const mmss = (x) => duration(Math.round(x));
  return (
    <div className="result">
      <Link to="/" className="back">← Dashboard</Link>
      <div className="pagehead"><div><h1>{d.attempt.mockName}: your analysis</h1><p className="muted">Submitted {fmtDateTime(d.attempt.submittedAt)}{d.attempt.autoSubmitted ? ' · auto-submitted when time ran out' : ''}</p></div>
        <div className="head-actions"><Link className="btn btn-primary" to={`/review/${attemptId}`}>Review all questions</Link><Link className="btn btn-ghost" to={`/review/${attemptId}?filter=incorrect`}>Review mistakes</Link><PdfMenu id={attemptId} /></div></div>

      <section className="score-hero card">
        <div className="big-score"><span>Total score{qual.length ? ' (excl. Computer)' : ''}</span><strong>{s.score}<small> / {s.maxMarks}</small></strong><em>{s.percentage}%</em></div>
        <dl className="mini">
          <div><dt>Correct</dt><dd className="c-good">{s.correct}</dd></div><div><dt>Incorrect</dt><dd className="c-bad">{s.incorrect}</dd></div><div><dt>Unattempted</dt><dd>{s.unattempted}</dd></div>
          <div><dt>Accuracy</dt><dd>{s.accuracy}%</dd></div><div><dt>Attempted</dt><dd>{s.attempted}/{s.totalQuestions}</dd></div><div><dt>Marked for review</dt><dd>{s.marked}</dd></div>
          <div><dt>Time taken</dt><dd>{duration(s.timeTakenSec)}</dd></div><div><dt>Avg per question</dt><dd>{duration(s.avgTimePerQuestionSec)}</dd></div><div><dt>Lost to negatives</dt><dd className={negLost ? 'c-bad' : ''}>{negLost ? `−${negLost}` : '0'}</dd></div>
        </dl>
      </section>

      <section className="an-side" aria-label="How you compare">
        <div className="an-card">
          <h3>Against other aspirants</h3>
          {com?.unlocked ? (<><p className="an-big">Top {Math.max(1, Math.round(100 - com.percentile))}%<small> · rank {com.rank} of {com.users}</small></p><p className="small muted">You beat {com.percentile}% of MockDesk students on this mock. Average {com.avgScore}, top score {com.topScore} (your best {com.yourBest}).</p></>)
            : (<><p className="an-big muted">Unlocks at {com?.needed ?? 10} students</p><p className="small muted">{com?.users ?? 0} student{com?.users === 1 ? ' has' : 's have'} completed this mock so far. Rank and percentile appear once enough people have, so the number means something.</p></>)}
        </div>
        <div className="an-card">
          <h3>Versus {cmpLabel || 'your last attempt'}</h3>
          {cmp ? (<ul className="an-deltas"><li><span>Score</span><b className={cmp.score <= s.score ? 'c-good' : 'c-bad'}>{delta(s.score - cmp.score, ' marks')}</b></li><li><span>Accuracy</span><b className={cmp.accuracy <= s.accuracy ? 'c-good' : 'c-bad'}>{delta(s.accuracy - cmp.accuracy, ' pts')}</b></li><li><span>Time</span><b>{delta(Math.round((s.timeTakenSec - cmp.timeTakenSec) / 60), ' min')}</b></li></ul>) : <p className="small muted">This is your first completed mock. Next time you will see how you moved.</p>}
        </div>
      </section>

      <section className="an-card an-wide" aria-label="Where your marks went">
        <h3>Where your {s.maxMarks} marks went</h3>
        <div className="marksbar" role="img" aria-label={seg.map(([l, v]) => `${l} ${v}`).join(', ')}>{seg.map(([l, v, c]) => v > 0 && <i key={l} className={c} style={{ flex: v }} tabIndex={0} {...tip({ t: 'Where your marks went', v: `${l}: ${v}`, tone: /penalty|missed/i.test(l) ? 'bad' : /blank/i.test(l) ? 'mute' : 'good', rows: [['Share of paper', `${Math.round((v / s.maxMarks) * 100)}%`]] })} />)}</div>
        <ul className="marks-legend">{seg.map(([l, v, c]) => <li key={l}><i className={c} />{l} <b>{v}</b></li>)}</ul>
        <p className="small muted">{A.wrong.length ? `Skipping your ${A.wrong.length} wrong answers would have given ${A.net + A.penalty} marks (+${A.penalty}). ` : ''}{A.skipped.length ? `${A.skipped.length} questions were left blank, worth up to ${A.skippedMarks} marks.` : 'You attempted every question.'}</p>
      </section>

      {qual.map((x) => {
        const gap = x.qualifyingMarks - x.score; const w = Math.max(0, Math.min(100, (Math.max(0, x.score) / x.maxMarks) * 100)); const m = (x.qualifyingMarks / x.maxMarks) * 100;
        return (
          <section key={x.key} className={`qual card ${x.qualified ? 'q-pass' : 'q-fail'}`} aria-label={`${x.name} qualifying result`}>
            <div className="qual-head"><div><span className="qual-tag">Qualifying section · not added to total</span><h2>{x.name}</h2></div>
              <strong className="qual-badge" role="status">{x.qualified ? '✓ Qualified' : '✗ Not qualified'}</strong></div>
            <p><b>{x.score}</b> / {x.maxMarks} marks · cut-off {x.qualifyingMarks}. {x.qualified ? (x.score === x.qualifyingMarks ? 'You are exactly on the cut-off, so every wrong answer counts.' : `You are ${x.score - x.qualifyingMarks} mark${x.score - x.qualifyingMarks === 1 ? '' : 's'} above the cut-off.`) : `You need ${gap} more mark${gap === 1 ? '' : 's'} to qualify (about ${Math.ceil(gap / 3)} more correct answer${Math.ceil(gap / 3) === 1 ? '' : 's'} if you do not change your wrong answers).`}</p>
            <div className="qbar" role="img" aria-label={`${x.score} of ${x.maxMarks} marks, cut-off ${x.qualifyingMarks}`}><span className="qbar-fill" style={{ width: `${w}%` }} tabIndex={0} {...tip({ t: x.name, v: `${x.score} / ${x.maxMarks}`, tone: x.qualified ? 'good' : 'bad', rows: [['Correct', x.correct], ['Wrong', x.incorrect], ['Cut-off', x.qualifyingMarks]] })} /><span className="qbar-cut" style={{ left: `${m}%` }} tabIndex={0} {...tip({ t: `${x.name} cut-off`, v: `${x.qualifyingMarks} marks`, tone: 'warn', rows: [['Your score', x.score], [x.qualified ? 'Above cut-off by' : 'Short by', Math.abs(x.score - x.qualifyingMarks)]] })} /></div>
            <p className="small muted">{x.correct} correct · {x.incorrect} wrong · {x.unattempted} unattempted · accuracy {x.accuracy}%. Each wrong answer costs 1 mark, so guessing blindly can drop you below the cut-off.</p>
          </section>
        );
      })}

      <h2>Section-wise performance</h2>
      <div className="tbl-wrap card nopad"><table className="dtable sec">
        <thead><tr><th>Section</th><th>Attempted</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Score</th><th>Accuracy</th><th>Time spent</th></tr></thead>
        <tbody>{d.sections.map((x) => (<tr key={x.key}><th scope="row">{x.name}</th><td>{x.attempted}/{x.total}</td><td>{x.correct}</td><td>{x.incorrect}</td><td>{x.unattempted}</td><td><b>{x.score}</b>/{x.maxMarks}</td><td>{x.accuracy}%</td><td>{duration(x.timeSec)}</td></tr>))}</tbody></table></div>
      <div className="grid2">
        <div className="card"><h3>Score by section (% of marks)</h3><BarChart label="Score percentage by section" data={d.sections.map((x) => ({ label: x.short, value: Math.round((Math.max(0, x.score) / x.maxMarks) * 1000) / 10, tone: x === best[0] ? 'good' : x === best.at(-1) ? 'weak' : '' }))} /></div>
        <div className="card"><h3>Accuracy by section</h3><BarChart label="Accuracy by section" data={d.sections.map((x) => ({ label: x.short, value: x.accuracy }))} /></div>
      </div>

      <h2>Time and pace</h2>
      <div className="grid2">
        <div className="card"><h3>Time used per section</h3>
          <ul className="pace">{A.pace.map((p) => { const over = p.allowed && p.used > p.allowed * 0.98; return (<li key={p.key}><div className="pace-top"><b>{p.short}{p.qualifying ? ' (qualifying)' : ''}</b><span className="muted small">{mmss(p.used)}{p.allowed ? ` of ${mmss(p.allowed)}` : ''}</span></div><div className="pace-bar" tabIndex={0} {...tip({ t: p.short + ' time', v: `${mmss(p.used)}${p.allowed ? ` of ${mmss(p.allowed)}` : ''}`, tone: over ? 'warn' : 'good', rows: [['Per question', `${Math.round(p.perQ)} s`], ...(p.allowedPerQ ? [['Available', `${Math.round(p.allowedPerQ)} s`]] : [])] })}><i className={over ? 'full' : ''} style={{ width: `${p.allowed ? Math.min(100, (p.used / p.allowed) * 100) : 50}%` }} /></div><small className="muted">{Math.round(p.perQ)} s per question{p.allowedPerQ ? ` · ${Math.round(p.allowedPerQ)} s available` : ''}{over ? ' · used the whole section' : p.allowed && p.used < p.allowed * 0.6 ? ' · finished early, use spare time to re-check' : ''}</small></li>); })}</ul></div>
        <div className="card"><h3>Accuracy by difficulty</h3>
          {A.diff.length ? <BarChart label="Share of questions answered correctly by difficulty" data={A.diff.map((x) => ({ label: x.key[0].toUpperCase() + x.key.slice(1), value: x.pct, tone: x.key === 'easy' ? 'good' : x.key === 'hard' ? 'weak' : '' }))} /> : null}
          <p className="small muted">{(() => { const e = A.diff.find((x) => x.key === 'easy'); return e && e.pct < 70 ? `You got ${e.pct}% of the easy questions. Easy marks are the cheapest to win back.` : 'Measured on all questions in each band, including blanks.'; })()}</p></div>
      </div>
      <div className="card an-timeline"><h3>Question-by-question timeline <small className="muted">taller bar means more time; tap a bar to open the solution</small></h3>
        {d.sections.concat(qual).map((sec) => { const qs = d.questions.filter((q) => q.section === sec.key); const mx = Math.max(60, ...qs.map((q) => q.timeSec)); return (
          <div className="tl-row" key={sec.key}><span className="tl-label">{sec.short}</span><div className="tl-bars">{qs.map((q) => <Link key={q.id} to={`/review/${attemptId}?qid=${q.id}`} className={`r-${q.status}`} style={{ height: `${Math.max(6, (q.timeSec / mx) * 100)}%` }} {...tip({ t: `${sec.short} · Question ${q.index + 1}`, v: q.status === 'correct' ? 'Correct' : q.status === 'incorrect' ? 'Incorrect' : 'Not attempted', tone: q.status === 'correct' ? 'good' : q.status === 'incorrect' ? 'bad' : 'mute', rows: [['Time spent', duration(q.timeSec)], ...(q.topic ? [['Topic', q.topic]] : []), ...(q.difficulty ? [['Difficulty', q.difficulty]] : [])], hint: 'Click to open the solution' })} aria-label={`${sec.short} question ${q.index + 1}, ${q.status}, ${duration(q.timeSec)}`} />)}</div></div>); })}
        <ul className="marks-legend"><li><i className="r-correct" />Correct</li><li><i className="r-incorrect" />Incorrect</li><li><i className="r-unattempted" />Unattempted</li></ul></div>

      <h2>Topic-by-topic</h2>
      <div className="tbl-wrap card nopad"><table className="dtable topics">
        <thead><tr><th>Topic</th><th>Section</th><th>Correct</th><th>Accuracy</th><th /></tr></thead>
        <tbody>{(allTopics ? A.topics : A.topics.slice(0, 12)).map((t) => (<tr key={t.topic + t.section}><th scope="row">{t.topic}</th><td>{d.sections.find((x) => x.key === t.section)?.short}</td><td>{t.correct}/{t.total}</td><td><span className="acc" tabIndex={0} {...tip({ t: t.topic, v: `${t.accuracy}% accuracy`, tone: t.accuracy < 50 ? 'bad' : t.accuracy < 80 ? 'warn' : 'good', rows: [['Correct', `${t.correct} of ${t.total}`]], hint: t.accuracy < 100 ? 'Use Review to revisit these' : undefined })}><i className={t.accuracy < 50 ? 'low' : t.accuracy < 80 ? 'mid' : 'hi'} style={{ width: `${t.accuracy}%` }} /></span> {t.accuracy}%</td><td>{t.accuracy < 100 && <Link to={`/review/${attemptId}?topic=${encodeURIComponent(t.topic)}`}>Review</Link>}</td></tr>))}</tbody></table>{A.topics.length > 12 && <button className="btn btn-ghost btn-sm topics-more" onClick={() => setAllTopics(!allTopics)}>{allTopics ? 'Show fewer topics' : `Show all ${A.topics.length} topics`}</button>}</div>

      {A.fixes.length > 0 && (<><h2>Your three fixes before the next mock</h2>
        <ol className="fixes">{A.fixes.map((f) => <li key={f.title}><b>{f.title}</b><span>{f.body}</span></li>)}</ol></>)}

      <h2>What to work on</h2>
      <div className="grid2">
        <div className="card"><h3>Concepts to revise</h3>{revise.length ? <ul className="plain">{revise.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="muted">Nothing flagged: you made no incorrect attempts.</p>}</div>
        <div className="card"><h3>Common mistakes you made</h3>{traps.length ? <ul className="plain">{traps.map((q) => <li key={q.id}>{q.trap} <small className="muted">({q.topic})</small></li>)}</ul> : <p className="muted">None flagged.</p>}</div>
        <div className="card habits-card"><h3>Habits this paper showed</h3><ul className="plain"><li>{A.rushed.length ? `${A.rushed.length} wrong answers were given in a few seconds: likely rushed.` : 'No rushed wrong answers.'}</li><li>{A.overthought.length ? `${A.overthought.length} questions took long and scored nothing: likely over-thinking.` : 'No long time sinks without marks.'}</li><li>{A.marked.length ? `You answered ${A.marked.length} questions and marked them for review; ${A.markedRight} turned out correct.` : 'You did not use mark-for-review on answered questions.'}</li></ul></div>
      </div>
      <div className="cta"><Link className="btn btn-primary btn-lg" to={`/review/${attemptId}`}>Go through every question with solutions</Link><PdfMenu id={attemptId} large up /></div>
    </div>
  );
}
