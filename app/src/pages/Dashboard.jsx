import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { duration, fmtDate, num } from '../lib/format.js';
import { EXAMS } from '../lib/exams.js';
import { tip } from '../components/Tip.jsx';
import PdfMenu from '../components/PdfMenu.jsx';
import Blueprint from '../components/Blueprint.jsx';
import PracticeCard from '../components/PracticeCard.jsx';
import { ActivityMap, LockedInsights, ToolTiles, ReadinessGauge, SkillRadar, StudyPlanner, Trajectory, readinessOf } from '../components/Insights.jsx';

const STATUS = { not_attempted: ['Not attempted', 'st-none'], in_progress: ['In progress', 'st-prog'], completed: ['Completed', 'st-done'] };
export default function Dashboard() {
  const { user, config } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState(EXAMS[0].id); const [filter, setFilter] = useState('all'); const [mocks, setMocks] = useState(null); const [stats, setStats] = useState(null); const [hist, setHist] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => {
    Promise.all([api.get('/mocks'), api.get('/stats'), api.get('/attempts')])
      .then(([m, s, h]) => { setMocks(m.mocks); setStats(s); setHist(h.attempts.filter((a) => a.status === 'submitted')); })
      .catch((e) => setErr(e.message));
  }, []);
  const start = async (m) => {
    if (m.locked) return nav('/profile#invite');
    if (m.status === 'in_progress') return nav(`/exam/${m.inProgressAttemptId}`);
    nav(`/mock/${m.id}`);
  };
  if (err) return <div className="alert" role="alert">{err}</div>;
  if (!mocks) return <p role="status" className="muted">Loading dashboard…</p>;
  const gap = user?.targetScore && stats?.bestScore != null ? user.targetScore - stats.bestScore : null;
  const first = user.name.split(' ')[0];
  const daysLeft = user.examDate ? Math.ceil((new Date(user.examDate + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const done = mocks.filter((m) => m.status === 'completed').length;
  const inProg = mocks.find((m) => m.status === 'in_progress');
  const open_ = mocks.filter((m) => !m.locked);
  const nextMock = inProg || open_.find((m) => m.status === 'not_attempted') || open_.slice().sort((x, y) => (x.best?.percentage ?? 0) - (y.best?.percentage ?? 0))[0];
  const lastDone = hist[0];
  const totalQs = mocks.reduce((a, m) => a + m.totalQuestions + (m.qualifying || []).reduce((b, x) => b + x.questions, 0), 0);
  const counts = { all: mocks.length, not_attempted: mocks.filter((m) => m.status === 'not_attempted').length, in_progress: mocks.filter((m) => m.status === 'in_progress').length, completed: done };
  const shown = mocks.filter((m) => filter === 'all' || m.status === filter);
  const examName = EXAMS.find((x) => x.id === exam)?.name;
  const maxMarks = config?.scoredMarks || 390;
  const readiness = stats?.completed ? readinessOf({ stats, mocksTotal: mocks.length, target: user.targetScore, maxMarks }) : null;
  const secs = Object.entries(config?.sections || {});
  const minsOf = (k) => config?.segments?.find((sg) => sg.sections.includes(k))?.minutes;
  const targetPct = user?.targetScore && stats?.bestScore != null ? Math.min(100, Math.round((stats.bestScore / user.targetScore) * 100)) : null;
  const ring = (pct, label, sub) => (
    <div className="hm-ring" role="img" aria-label={`${label}: ${sub}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle className="hm-ring-bg" cx="18" cy="18" r="15.9" /><circle className="hm-ring-fg" cx="18" cy="18" r="15.9" strokeDasharray={`${pct} 100`} style={pct ? undefined : { opacity: 0 }} /></svg>
      <b>{sub}</b><span>{label}</span>
    </div>
  );
  const tips = [
    ['Start with your strongest section', 'Sections are timed and locked one after another, so bank the sure marks first.'],
    ['Every wrong answer costs 1 mark', 'Each question is worth 3 marks, so skip a question when you cannot cut at least two options.'],
    ['Computer is qualifying only', 'You need 27 of 60 to qualify and its marks are not added to your total.'],
    ['Review every mock within a day', 'Read the “Common mistake” note even on questions you got right.'],
  ];
  return (
    <div className="dash hm">
      <nav className="hm-exams" aria-label="Choose exam">
        {EXAMS.map((x) => <button key={x.id} className={`hm-exam ${exam === x.id ? 'on' : ''}`} aria-pressed={exam === x.id} onClick={() => setExam(x.id)}>{x.name}</button>)}
        <span className="hm-exam soon" aria-label="More exams coming soon">+ More exams soon</span>
      </nav>
      <section className="hm-hero" aria-label="Welcome">
        <div className="hm-hero-main">
          <p className="hm-eyebrow">{greet}</p>
          <h1>{first}, ready for your next mock?</h1>
          <p className="hm-sub">{stats?.completed ? `You have completed ${stats.completed} of ${mocks.length} mocks.` : `${mocks.length} full-length mocks, from moderate to exam-day hard. Start with Mock 1 to set your baseline.`}{gap != null && (gap > 0 ? ` ${gap} marks to your target of ${user.targetScore}.` : ` You have reached your target of ${user.targetScore}.`)}</p>
          <ul className="hm-pills" aria-label="Highlights"><li>{mocks.length} full mocks</li><li>{totalQs} questions</li><li>Step-by-step solutions</li>{daysLeft != null && daysLeft >= 0 && <li className="hm-days">{daysLeft === 0 ? 'Exam is today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to exam`}</li>}</ul>
          <div className="hm-cta">
            {nextMock && <button className="hm-btn hm-btn-light" onClick={() => start(nextMock)}>{inProg ? 'Resume' : done ? 'Attempt next' : 'Start'}: {nextMock.name.replace('CGL Tier-II ', '')} →</button>}
            {lastDone && <Link className="hm-btn hm-btn-line" to={`/results/${lastDone.id}`}>View last analysis</Link>}
          </div>
        </div>
        <div className="hm-rings">
          {ring(Math.round((done / mocks.length) * 100), 'Mocks done', `${done}/${mocks.length}`)}
          {targetPct != null ? ring(targetPct, 'Of target', `${targetPct}%`) : ring(stats?.completed ? Math.round(stats.avgAccuracy || 0) : 0, 'Accuracy', stats?.completed ? `${num(stats.avgAccuracy)}%` : '–')}
        </div>
      </section>

      <section className="hm-kpis" aria-label="Summary">
        {[['Tests completed', `${stats?.completed ?? 0}`, `of ${mocks.length} mocks`, '✔', 'k-blue'], ['Best score', num(stats?.bestScore), stats?.completed ? `out of ${maxMarks}` : 'no attempt yet', '★', 'k-amber'], ['Average score', stats?.completed ? `${num(stats.avgPercentage)}%` : '–', stats?.completed ? 'of total marks' : 'no attempt yet', '∅', 'k-violet'], ['Average accuracy', stats?.completed ? `${num(stats.avgAccuracy)}%` : '–', stats?.completed ? 'of attempted questions' : 'no attempt yet', '◎', 'k-green']].map(([l, v, sub, ic, tone]) => (
          <div className={`hm-kpi ${tone}`} key={l}><i aria-hidden="true">{ic}</i><div><span>{l}</span><strong>{v}</strong><small>{sub}</small></div></div>
        ))}
        {stats?.qualifying && <div className="hm-kpi k-teal"><i aria-hidden="true">⌨</i><div><span>Computer qualified</span><strong>{stats.qualifying.passed}/{stats.qualifying.attempts}</strong><small>cut-off {stats.qualifying.qualifyingMarks} of {stats.qualifying.maxMarks}</small></div></div>}
      </section>

      {stats?.completed > 0 ? (
        <section className="ix" aria-label="Your performance cockpit">
          <div className="hm-head"><h2>Your performance cockpit</h2><span className="muted small">Built from your own attempts</span></div>
          <div className="ix-grid">
            <ReadinessGauge r={readiness} />
            <SkillRadar sections={stats.sections} />
            <div className="ix-plan"><StudyPlanner stats={stats} nextMock={nextMock} mocksLeft={mocks.filter((m) => m.status === 'not_attempted').length} daysLeft={daysLeft} lastId={lastDone?.id} sectionName={config?.sections[stats.weakest]?.short} /></div>
            <Trajectory trend={stats.trend} target={user.targetScore} maxMarks={maxMarks} />
            <div className="ix-card ix-weak"><h3>Weakest topics</h3>
              {stats.weakTopics?.length ? <ul className="weak-list">{stats.weakTopics.slice(0, 6).map((t) => <li key={t.topic + t.section}><span>{t.topic}<small> · {config?.sections[t.section]?.short}</small></span><b>{t.accuracy}%</b></li>)}</ul> : <p className="muted">No weak topics yet. Great start.</p>}
              {lastDone && <Link className="hm-more" to={`/review/${lastDone.id}?filter=incorrect`}>Review last mock’s mistakes →</Link>}
            </div>
            <div className="ix-full"><ActivityMap stamps={stats.activity} /></div>
          </div>
        </section>
      ) : <LockedInsights />}

      <Blueprint config={config} examName={examName} />

      <PracticeCard />

      <div className="hm-head"><h2>Full-length mocks</h2><span className="muted small">Take them in order for a steady difficulty ramp.</span></div>
      <div className="hm-filters" role="group" aria-label="Filter mocks">
        {[['all', 'All'], ['not_attempted', 'Not attempted'], ['in_progress', 'In progress'], ['completed', 'Completed']].map(([k, l]) => <button key={k} className={`hm-filter ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{counts[k]}</b></button>)}
      </div>
      {shown.length === 0 && <p className="hm-empty muted">No mocks in this view yet.</p>}
      <section className="hm-mocks">
        {shown.map((m) => {
          const i = mocks.indexOf(m);
          const [label, cls] = STATUS[m.status];
          const lvl = { easy: 1, moderate: 2, hard: 3 }[m.difficulty] || 2;
          return (
            <article key={m.id} className={`hm-mock ${m.locked ? 'is-locked' : ''} ${m.status === 'in_progress' ? 'is-prog' : ''} ${m.id === nextMock?.id ? 'is-next' : ''}`}>
              <div className="hm-mock-top">
                <span className="hm-num" aria-hidden="true">{i + 1}</span>
                <div className="hm-meter" role="img" aria-label={`Difficulty: ${m.difficulty}`}><i className={lvl >= 1 ? 'on' : ''} /><i className={lvl >= 2 ? 'on' : ''} /><i className={lvl >= 3 ? 'on' : ''} /><span className={`diff d-${m.difficulty}`}>{m.difficulty}</span></div>
                <span className={`status ${cls} ${m.id === nextMock?.id && m.status === 'not_attempted' ? 'st-next' : ''}`}>{m.id === nextMock?.id && m.status === 'not_attempted' ? 'Up next' : label}</span>
              </div>
              <h3>{m.name.replace('CGL Tier-II ', '')}</h3>
              <p className="muted">{m.description}</p>
              <div className="hm-facts"><span><b>{m.totalQuestions + (m.qualifying || []).reduce((b, x) => b + x.questions, 0)}</b> Qs</span><span><b>{m.totalMarks}</b> marks</span><span><b>{m.totalMinutes}</b> min</span></div>
              {m.best && (
                <div className="hm-best"><div className="hm-bar" tabIndex={0} {...tip({ t: 'Your best', v: `${m.best.score} / ${m.totalMarks}`, tone: 'good', rows: [['Percentage', `${m.best.percentage}%`], ['Attempts', m.attempts]] })}><i style={{ width: `${Math.max(2, Math.min(100, m.best.percentage))}%` }} /></div><small>Best <strong>{m.best.score}/{m.totalMarks}</strong> ({m.best.percentage}%) · {m.attempts} attempt{m.attempts > 1 ? 's' : ''}</small></div>
              )}
              {!m.complete && <p className="small warn-txt">Question bank still being completed.</p>}
              <footer>
                <button className="hm-btn hm-btn-solid" disabled={busy === m.id} onClick={() => start(m)}>{m.locked ? 'Invite a friend to unlock' : m.status === 'in_progress' ? 'Resume test' : m.status === 'completed' ? 'Retake' : 'Start test'}</button>
                {m.last && <Link className="hm-btn hm-btn-ghost" to={`/results/${m.last.attemptId}`}>Last result</Link>}
              </footer>
            </article>
          );
        })}
        {filter === 'all' && <div className="hm-soon"><b>More mocks on the way</b><span>New full-length papers are added regularly.</span></div>}
      </section>

      {!stats?.completed ? <section className="hm-why" aria-label="Why MockDesk">
        {[['🖥', 'Real exam interface', 'Sectional timers that lock, the numbered palette, mark-for-review and a server-kept clock, like the actual CBT.'], ['💡', 'Solutions that teach', 'Every question has steps, the common mistake, a concept to revise and why each wrong option fails.'], ['📈', 'Analysis that guides', 'Section strengths, weakest topics, accuracy and time per attempt, so you know what to fix next.']].map(([ic, t, d]) => <div className="hm-why-card" key={t}><i aria-hidden="true">{ic}</i><h3>{t}</h3><p>{d}</p></div>)}
      </section> : <ToolTiles />}

      <section className="hm-tips" aria-label="Exam tips">
        <div className="hm-head"><h2>Exam-day playbook</h2></div>
        <div className="hm-tip-grid">
          {tips.map(([t, d], i) => <div className="hm-tip" key={t}><b aria-hidden="true">{['①','②','③','④'][i]}</b><div><h4>{t}</h4><p>{d}</p></div></div>)}
          {stats?.completed > 0 && stats.weakest && <div className="hm-tip hm-focus"><b>!</b><div><h4>Focus next: {config?.sections[stats.weakest]?.short}</h4><p>Your lowest average section so far{stats.weakTopics?.[0] ? `, with ${stats.weakTopics[0].topic} the weakest topic` : ''}. Revise it before your next mock.</p></div></div>}
        </div>
      </section>

      {stats?.completed > 0 && (
        <>
          <h2>Attempt history</h2>
          <div className="tbl-wrap card nopad"><table className="dtable hist">
            <thead><tr><th>Test</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Computer</th><th>Time</th><th /></tr></thead>
            <tbody>{hist.map((h) => <tr key={h.id}><th scope="row">{h.mockName}</th><td>{fmtDate(h.submittedAt)}</td><td>{h.score}/{h.maxMarks}</td><td>{h.accuracy}%</td><td>{h.qualified === null || h.qualified === undefined ? '–' : <span className={`qchip ${h.qualified ? 'q-pass' : 'q-fail'}`}>{h.qualified ? 'Qualified' : 'Not qualified'}</span>}</td><td>{duration(h.timeTakenSec)}</td><td><Link to={`/results/${h.id}`}>Analysis</Link> · <Link to={`/review/${h.id}`}>Review</Link> · <PdfMenu id={h.id} compact /></td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
