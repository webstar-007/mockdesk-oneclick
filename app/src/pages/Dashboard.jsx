import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { duration, fmtDate, fmtDateTime, num } from '../lib/format.js';
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
  const exams = config?.exams?.length ? config.exams : EXAMS; const [examPick, setExam] = useState(null); const exam = examPick && exams.some((x) => x.id === examPick) ? examPick : exams[0].id; const [filter, setFilter] = useState('all'); const [allMocks, setMocks] = useState(null); const [stats, setStats] = useState(null); const [hist, setHist] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
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
  if (!allMocks) return <p role="status" className="muted">Loading dashboard…</p>;
  const mocks = allMocks.filter((m) => (m.examId || 'ssc-cgl-t2') === exam);
  const pat = config?.patterns?.[exam]; const bpConfig = pat ? { ...config, sections: pat.sections, segments: pat.segments } : config;
  const gap = user?.targetScore && stats?.bestScore != null ? user.targetScore - stats.bestScore : null;
  const first = user.name.split(' ')[0];
  const daysLeft = user.examDate ? Math.ceil((new Date(user.examDate + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const done = mocks.filter((m) => m.status === 'completed').length;
  const inProg = mocks.find((m) => m.status === 'in_progress');
  const open_ = mocks.filter((m) => !m.locked && !m.upcoming && m.live?.state !== 'closed');
  const nextMock = inProg || open_.find((m) => m.status === 'not_attempted') || open_.slice().sort((x, y) => (x.best?.percentage ?? 0) - (y.best?.percentage ?? 0))[0];
  const lastDone = hist[0];
  const totalQs = mocks.reduce((a, m) => a + m.totalQuestions + (m.qualifying || []).reduce((b, x) => b + x.questions, 0), 0);
  const counts = { all: mocks.length, live: mocks.filter((m) => m.live).length, pyq: mocks.filter((m) => m.kind === 'pyq').length, not_attempted: mocks.filter((m) => m.status === 'not_attempted').length, in_progress: mocks.filter((m) => m.status === 'in_progress').length, completed: done };
  const shown = mocks.filter((m) => filter === 'all' || (filter === 'live' ? !!m.live : filter === 'pyq' ? m.kind === 'pyq' : m.status === filter));
  const examName = exams.find((x) => x.id === exam)?.name;
  const maxMarks = pat?.scoredMarks || config?.scoredMarks || 390;
  const primary = exam === exams[0].id; const mine = mocks.filter((m) => m.best); const kBest = mine.length ? Math.max(...mine.map((m) => m.best.score)) : null; const kAvg = mine.length ? mine.reduce((a, m) => a + m.best.percentage, 0) / mine.length : null;
  const examHist = hist.filter((h) => mocks.some((m) => m.id === h.mockId));
  const readiness = stats?.completed && primary ? readinessOf({ stats, mocksTotal: mocks.length, target: user.targetScore, maxMarks }) : null;
  const secs = Object.entries(config?.sections || {});
  const minsOf = (k) => config?.segments?.find((sg) => sg.sections.includes(k))?.minutes;
  const targetPct = user?.targetScore && stats?.bestScore != null ? Math.min(100, Math.round((stats.bestScore / user.targetScore) * 100)) : null;
  const ring = (pct, label, sub) => (
    <div className="hm-ring" role="img" aria-label={`${label}: ${sub}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle className="hm-ring-bg" cx="18" cy="18" r="15.9" /><circle className="hm-ring-fg" cx="18" cy="18" r="15.9" strokeDasharray={`${pct} 100`} style={pct ? undefined : { opacity: 0 }} /></svg>
      <b>{sub}</b><span>{label}</span>
    </div>
  );
  const pSecs = Object.values(pat?.sections || config?.sections || {}); const sc = pSecs.find((x) => !x.qualifying) || { marksPerQuestion: 3, negativeMarks: 1 }; const qs = pSecs.find((x) => x.qualifying);
  const tips = [
    ['Start with your strongest section', pat && pat.segments.length > 1 ? 'Sections are timed and locked one after another, so bank the sure marks first.' : 'Spend the first pass on the questions you are sure about, then come back for the rest.'],
    [`Every wrong answer costs ${sc.negativeMarks} mark${sc.negativeMarks === 1 ? '' : 's'}`, `Each question is worth ${sc.marksPerQuestion} marks, so skip a question when you cannot cut at least two options.`],
    qs ? ['Computer is qualifying only', `You need ${qs.qualifyingMarks} of ${qs.questions * qs.marksPerQuestion} to qualify and its marks are not added to your total.`] : ['Keep an eye on the clock', 'Aim to finish a first pass with a few minutes spare, then revisit the questions you marked.'],
    ['Review every mock within a day', 'Read the “Common mistake” note even on questions you got right.'],
  ];
  return (
    <div className="dash hm">
      <nav className="hm-exams" aria-label="Choose exam">
        {exams.map((x) => <button key={x.id} className={`hm-exam ${exam === x.id ? 'on' : ''}`} aria-pressed={exam === x.id} onClick={() => { setExam(x.id); setFilter('all'); }}>{x.name}</button>)}
        {exams.length < 2 && <span className="hm-exam soon" aria-label="More exams coming soon">+ More exams soon</span>}
      </nav>
      <section className="hm-hero" aria-label="Welcome">
        <div className="hm-hero-main">
          <p className="hm-eyebrow">{greet}</p>
          <h1>{first}, ready for your next mock?</h1>
          <p className="hm-sub">{done ? `You have completed ${done} of ${mocks.length} mocks.` : `${mocks.length} full-length mocks, from moderate to exam-day hard. Start with Mock 1 to set your baseline.`}{gap != null && (gap > 0 ? ` ${gap} marks to your target of ${user.targetScore}.` : ` You have reached your target of ${user.targetScore}.`)}</p>
          <ul className="hm-pills" aria-label="Highlights"><li>{mocks.length} full mocks</li><li>{totalQs} questions</li><li>Step-by-step solutions</li>{daysLeft != null && daysLeft >= 0 && <li className="hm-days">{daysLeft === 0 ? 'Exam is today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to exam`}</li>}</ul>
          <div className="hm-cta">
            {nextMock && <button className="hm-btn hm-btn-light" onClick={() => start(nextMock)}>{inProg ? 'Resume' : done ? 'Attempt next' : 'Start'}: {nextMock.name.replace('CGL Tier-II ', '')} →</button>}
            {lastDone && <Link className="hm-btn hm-btn-line" to={`/results/${lastDone.id}`}>View last analysis</Link>}
          </div>
        </div>
        <div className="hm-rings">
          {ring(mocks.length ? Math.round((done / mocks.length) * 100) : 0, 'Mocks done', `${done}/${mocks.length}`)}
          {targetPct != null ? ring(targetPct, 'Of target', `${targetPct}%`) : ring(stats?.completed ? Math.round(stats.avgAccuracy || 0) : 0, 'Accuracy', stats?.completed ? `${num(stats.avgAccuracy)}%` : '–')}
        </div>
      </section>

      <section className="hm-kpis" aria-label="Summary">
        {[['Tests completed', `${done}`, `of ${mocks.length} mocks`, '✔', 'k-blue'], ['Best score', num(kBest), mine.length ? `out of ${maxMarks}` : 'no attempt yet', '★', 'k-amber'], ['Average score', mine.length ? `${num(kAvg)}%` : '–', mine.length ? 'of total marks (best per mock)' : 'no attempt yet', '∅', 'k-violet'], ['Average accuracy', primary && stats?.completed ? `${num(stats.avgAccuracy)}%` : '–', primary && stats?.completed ? 'of attempted questions' : 'see each analysis', '◎', 'k-green']].map(([l, v, sub, ic, tone]) => (
          <div className={`hm-kpi ${tone}`} key={l}><i aria-hidden="true">{ic}</i><div><span>{l}</span><strong>{v}</strong><small>{sub}</small></div></div>
        ))}
        {primary && stats?.qualifying && <div className="hm-kpi k-teal"><i aria-hidden="true">⌨</i><div><span>Computer qualified</span><strong>{stats.qualifying.passed}/{stats.qualifying.attempts}</strong><small>cut-off {stats.qualifying.qualifyingMarks} of {stats.qualifying.maxMarks}</small></div></div>}
      </section>

      {!primary ? <section className="ix" aria-label="Your progress"><div className="card"><h3>Your progress in {examName}</h3><p className="muted">{mine.length ? 'Open any finished mock for its full section and topic analysis. Questions you got wrong are collected in your Notebook.' : 'Finish a mock to see your analysis here.'} <Link to="/notebook">Open notebook</Link></p></div></section> : stats?.completed > 0 ? (
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

      <Blueprint config={bpConfig} examName={examName} />

      <PracticeCard />

      <div className="hm-head"><h2>Full-length mocks</h2><span className="muted small">Take them in order for a steady difficulty ramp.</span></div>
      <div className="hm-filters" role="group" aria-label="Filter mocks">
        {[['all', 'All'], ['not_attempted', 'Not attempted'], ['in_progress', 'In progress'], ['completed', 'Completed'], ...(counts.live ? [['live', 'Live mocks']] : []), ...(counts.pyq ? [['pyq', 'Previous-year papers']] : [])].map(([k, l]) => <button key={k} className={`hm-filter ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{counts[k]}</b></button>)}
      </div>
      {shown.length === 0 && <p className="hm-empty muted">{mocks.length === 0 ? `No ${examName} mocks have been published yet. Check back soon.` : 'No mocks in this view yet.'}</p>}
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
              {(m.kind === 'pyq' || m.live) && <p className="hm-badges">{m.kind === 'pyq' && <span className="badge b-pyq">Previous-year paper{m.paperYear ? ` · ${m.paperYear}` : ''}{m.paperLabel ? ` · ${m.paperLabel}` : ''}</span>}{m.live && <span className={`badge b-live l-${m.live.state}`}>{m.live.state === 'open' ? 'Live now' : m.live.state === 'upcoming' ? 'Live mock · upcoming' : 'Live mock · closed'}</span>}</p>}
              <h3>{m.name.replace('CGL Tier-II ', '')}</h3>
              <p className="muted">{m.description}</p>
              <div className="hm-facts"><span><b>{m.totalQuestions + (m.qualifying || []).reduce((b, x) => b + x.questions, 0)}</b> Qs</span><span><b>{m.totalMarks}</b> marks</span><span><b>{m.totalMinutes}</b> min</span></div>
              {m.best && (
                <div className="hm-best"><div className="hm-bar" tabIndex={0} {...tip({ t: 'Your best', v: `${m.best.score} / ${m.totalMarks}`, tone: 'good', rows: [['Percentage', `${m.best.percentage}%`], ['Attempts', m.attempts]] })}><i style={{ width: `${Math.max(2, Math.min(100, m.best.percentage))}%` }} /></div><small>Best <strong>{m.best.score}/{m.totalMarks}</strong> ({m.best.percentage}%) · {m.attempts} attempt{m.attempts > 1 ? 's' : ''}</small></div>
              )}
              {m.live && <p className="hm-live small" role="note">{m.live.state === 'upcoming' ? `Opens ${fmtDateTime(m.live.opensAt)}. Start any time until ${fmtDateTime(m.live.closesAt)}.` : m.live.state === 'open' ? <>Start any time until <b>{fmtDateTime(m.live.closesAt)}</b>. {m.live.taken ? 'Your first finished attempt counts for rank.' : 'Your first finished attempt counts for rank, so give it your best.'}</> : (m.live.rank ? <>You ranked <b>#{m.live.rank}</b> of {m.live.of}.</> : 'The window has closed. Ranks are final.')}</p>}
              {!m.complete && <p className="small warn-txt">Question bank still being completed.</p>}
              <footer>
                <button className="hm-btn hm-btn-solid" disabled={busy === m.id || m.upcoming} onClick={() => start(m)}>{m.upcoming ? 'Not open yet' : m.locked ? 'Invite a friend to unlock' : m.status === 'in_progress' ? 'Resume test' : m.status === 'completed' ? (m.live?.state === 'open' ? 'Retake for practice' : 'Retake') : 'Start test'}</button>
                {m.live && <Link className="hm-btn hm-btn-ghost" to={`/live/${m.id}`}>{m.live.state === 'closed' ? 'Leaderboard' : 'Live details'}</Link>}
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

      {examHist.length > 0 && (
        <>
          <h2>Attempt history</h2>
          <div className="tbl-wrap card nopad"><table className="dtable hist">
            <thead><tr><th>Test</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Computer</th><th>Time</th><th /></tr></thead>
            <tbody>{examHist.map((h) => <tr key={h.id}><th scope="row">{h.mockName}</th><td>{fmtDate(h.submittedAt)}</td><td>{h.score}/{h.maxMarks}</td><td>{h.accuracy}%</td><td>{h.qualified === null || h.qualified === undefined ? '–' : <span className={`qchip ${h.qualified ? 'q-pass' : 'q-fail'}`}>{h.qualified ? 'Qualified' : 'Not qualified'}</span>}</td><td>{duration(h.timeTakenSec)}</td><td><Link to={`/results/${h.id}`}>Analysis</Link> · <Link to={`/review/${h.id}`}>Review</Link> · <PdfMenu id={h.id} compact /></td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
