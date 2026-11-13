import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tip } from './Tip.jsx';

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };

/** 0-100 readiness from score progress (60%), accuracy (25%) and mocks completed (15%). */
export function readinessOf({ stats, mocksTotal, target, maxMarks }) {
  const avgMarks = (stats.avgPercentage / 100) * maxMarks;
  const progress = target ? clamp((avgMarks / target) * 100) : clamp(stats.avgPercentage);
  const coverage = clamp((stats.completed / Math.max(1, mocksTotal)) * 100);
  const accuracy = clamp(stats.avgAccuracy);
  const value = Math.round(0.6 * progress + 0.25 * accuracy + 0.15 * coverage);
  const band = value < 40 ? 'Building' : value < 65 ? 'Getting there' : value < 85 ? 'Strong' : 'Exam-ready';
  return { value, band, parts: [['Score vs ' + (target ? 'target' : 'maximum'), progress], ['Accuracy', accuracy], ['Mocks completed', coverage]] };
}

export function ReadinessGauge({ r }) {
  const R = 52, C = Math.PI * R; // half circle
  return (
    <div className="ix-card">
      <h3>Exam readiness</h3>
      <div className="gauge" role="img" aria-label={`Readiness ${r.value} out of 100, ${r.band}`}>
        <svg viewBox="0 0 120 70" aria-hidden="true"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset=".5" stopColor="#22d3ee" /><stop offset="1" stopColor="#16a34a" /></linearGradient></defs>
          <path d="M8 62 A52 52 0 0 1 112 62" className="g-bg" /><path d="M8 62 A52 52 0 0 1 112 62" className="g-fg" strokeDasharray={`${(r.value / 100) * C} ${C}`} /></svg>
        <div className="gauge-val"><b>{r.value}</b><span>{r.band}</span></div>
      </div>
      <ul className="parts">{r.parts.map(([l, v]) => <li key={l} tabIndex={0} {...tip({ t: 'Readiness input', v: `${l}: ${Math.round(v)}%`, tone: v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad', rows: [[l.startsWith('Score') ? 'Weight' : l === 'Accuracy' ? 'Weight' : 'Weight', l.startsWith('Score') ? '60%' : l === 'Accuracy' ? '25%' : '15%']] })}><span>{l}</span><i><u style={{ width: `${Math.round(v)}%` }} /></i><b>{Math.round(v)}%</b></li>)}</ul>
      <details className="ix-note"><summary>How is this calculated?</summary><p>60% how close your average score is to your target (or to full marks if no target is set), 25% your accuracy, 15% how many mocks you have completed. It is a guide, not a prediction.</p></details>
    </div>
  );
}

export function SkillRadar({ sections }) {
  const n = sections.length; if (n < 3) return null;
  const S = 200, c = S / 2, R = 74;
  const pt = (i, v) => { const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)]; };
  const poly = (k) => sections.map((s, i) => pt(i, clamp(s[k])).map((x) => x.toFixed(1)).join(',')).join(' ');
  return (
    <div className="ix-card">
      <h3>Skill radar</h3>
      <svg viewBox={`0 0 ${S} ${S}`} className="radar" role="img" aria-label={'Average score and accuracy by section: ' + sections.map((s) => `${s.short} ${Math.round(s.avgPercentage)}% score, ${Math.round(s.avgAccuracy)}% accuracy`).join('; ')}>
        {[25, 50, 75, 100].map((g) => <polygon key={g} className="rd-grid" points={sections.map((_, i) => pt(i, g).join(',')).join(' ')} />)}
        {sections.map((s, i) => { const [x, y] = pt(i, 100); const [lx, ly] = pt(i, 122); return (<g key={s.key}><line x1={c} y1={c} x2={x} y2={y} className="rd-grid" /><text x={lx} y={ly + 3} textAnchor="middle" className="rd-label">{s.short}</text></g>); })}
        <polygon points={poly('avgAccuracy')} className="rd-acc" /><polygon points={poly('avgPercentage')} className="rd-score" />
        {sections.map((s, i) => { const [x, y] = pt(i, clamp(s.avgPercentage)); return <circle key={s.key} cx={x} cy={y} r="3" className="rd-dot" tabIndex={0} {...tip({ t: s.name || s.short, v: `${Math.round(s.avgPercentage)}% score`, tone: s.avgPercentage >= 60 ? 'good' : s.avgPercentage >= 35 ? 'warn' : 'bad', rows: [['Accuracy', `${Math.round(s.avgAccuracy)}%`]] })} />; })}
      </svg>
      <p className="legend small"><span><i className="sw sw-a" />Score %</span><span><i className="sw sw-acc" />Accuracy %</span></p>
    </div>
  );
}

export function Trajectory({ trend, target, maxMarks }) {
  const W = 520, H = 200, L = 34, Rr = 16, T = 14, B = 30, n = trend.length;
  const pts = trend.slice(-8); const m = pts.length;
  const x = (i) => (m + 1 === 1 ? W / 2 : L + (i * (W - L - Rr)) / m);
  const y = (v) => T + (1 - clamp(v) / 100) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percentage).toFixed(1)}`).join(' ');
  let proj = null;
  if (m >= 3) { // least-squares trend, extended one mock ahead
    const xs = pts.map((_, i) => i), ys = pts.map((p) => p.percentage), mx = xs.reduce((a, b) => a + b) / m, my = ys.reduce((a, b) => a + b) / m;
    const slope = xs.reduce((a, xi, i) => a + (xi - mx) * (ys[i] - my), 0) / (xs.reduce((a, xi) => a + (xi - mx) ** 2, 0) || 1);
    proj = { from: pts[m - 1].percentage, to: clamp(my + slope * (m - mx)), slope };
  }
  const tp = target ? clamp((target / maxMarks) * 100) : null;
  return (
    <div className="ix-card ix-wide">
      <h3>Score trajectory</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="traj" role="img" aria-label={`Score percentage across your last ${m} mocks${tp ? `, target ${Math.round(tp)} percent` : ''}`}>
        {[0, 25, 50, 75, 100].map((g) => <g key={g}><line x1={L} x2={W - Rr} y1={y(g)} y2={y(g)} className="grid" /><text x={L - 6} y={y(g) + 4} textAnchor="end" className="axis">{g}</text></g>)}
        {tp != null && <g><line x1={L} x2={W - Rr} y1={y(tp)} y2={y(tp)} className="tj-target" /><text x={W - Rr} y={y(tp) - 5} textAnchor="end" className="axis strong">Target {target}</text></g>}
        <path d={`${line} L${x(m - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="tj-area" />
        <path d={line} className="tj-line" fill="none" />
        {proj && <line x1={x(m - 1)} y1={y(proj.from)} x2={x(m)} y2={y(proj.to)} className="tj-proj" />}
        {proj && <circle cx={x(m)} cy={y(proj.to)} r="5" className="tj-ghost" tabIndex={0} {...tip({ t: 'Projection', v: `About ${Math.round(proj.to)}%`, tone: 'warn', rows: [['Trend', `${proj.slope >= 0 ? '+' : ''}${proj.slope.toFixed(1)} pts per mock`], ['Based on', `last ${m} mocks`]], hint: 'A simple straight-line estimate' })} />}
        {pts.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.percentage)} r="4.5" className="tj-pt" tabIndex={0} {...tip({ t: p.mockName, v: `${p.score} / ${p.maxMarks}`, tone: i > 0 && p.percentage < pts[i - 1].percentage ? 'bad' : 'good', rows: [['Score', `${p.percentage}%`], ...(i > 0 ? [['Vs previous', `${p.percentage - pts[i - 1].percentage >= 0 ? '+' : ''}${Math.round((p.percentage - pts[i - 1].percentage) * 10) / 10} pts`]] : []), ...(tp != null ? [['Target', `${Math.round(tp)}%`]] : [])] })} /><text x={x(i)} y={H - 10} textAnchor="middle" className="axis">{p.mockName.replace(/.*Mock /, 'M')}</text></g>)}
        {proj && <text x={x(m)} y={H - 10} textAnchor="middle" className="axis">next</text>}
      </svg>
      <p className="small muted">{proj ? (proj.slope > 0.5 ? `Trending up about ${proj.slope.toFixed(1)} points per mock. The dashed line is a simple projection, not a promise.` : proj.slope < -0.5 ? 'Scores are drifting down. Review your mistakes before the next mock.' : 'Scores are steady. Target your weakest topics to break through.') : 'Complete 3 mocks to see your trend and projection.'}</p>
    </div>
  );
}

export function ActivityMap({ stamps, bare = false }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const counts = {}; (stamps || []).forEach((t) => { const k = dayKey(t); counts[k] = (counts[k] || 0) + 1; });
  const WEEKS = 15, start = new Date(today); start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7); // Monday-first
  const cells = []; for (let w = 0; w < WEEKS; w++) for (let d = 0; d < 7; d++) { const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d); cells.push({ w, d, dt, n: dt <= today ? counts[dayKey(dt)] || 0 : -1 }); }
  let streak = 0; const probe = new Date(today); if (!counts[dayKey(probe)]) probe.setDate(probe.getDate() - 1);
  while (counts[dayKey(probe)]) { streak++; probe.setDate(probe.getDate() - 1); }
  const active = Object.keys(counts).length;
  return (
    <div className={bare ? 'ix-bare' : 'ix-card ix-act'}>
      {!bare && <h3>Practice streak</h3>}
      <div className="streak"><b>{streak}</b><span>day{streak === 1 ? '' : 's'} in a row</span><small>{active} active day{active === 1 ? '' : 's'} recently</small></div>
      <div className="heat" role="img" aria-label={`Practice activity over the last ${WEEKS} weeks, ${active} active days`}>
        {cells.map((c) => <i key={`${c.w}-${c.d}`} className={c.n < 0 ? 'fut' : c.n === 0 ? '' : c.n === 1 ? 'l1' : c.n === 2 ? 'l2' : 'l3'} style={{ gridColumn: c.w + 1, gridRow: c.d + 1 }} {...(c.n < 0 ? {} : tip({ t: c.dt.toLocaleDateString(undefined, { weekday: 'long' }), v: c.dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), tone: c.n ? 'good' : 'mute', rows: [['Mocks attempted', c.n]] }))} />)}
      </div>
    </div>
  );
}

const DONE_KEY = 'mockdesk-plan-done';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } };
export function StudyPlanner({ stats, nextMock, mocksLeft, daysLeft, lastId, sectionName }) {
  const [done, setDone] = useState(readDone);
  useEffect(() => { try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* storage blocked */ } }, [done]);
  const wk = new Date(); const week = `${wk.getFullYear()}-W${Math.ceil((((wk - new Date(wk.getFullYear(), 0, 1)) / 86400000) + new Date(wk.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
  const gap = daysLeft != null && daysLeft > 0 && mocksLeft > 0 ? Math.max(2, Math.floor(daysLeft / mocksLeft)) : null;
  const items = [];
  if (nextMock) items.push({ id: `mock-${nextMock.id}`, label: `Attempt ${nextMock.name.replace('CGL Tier-II ', '')}`, hint: gap ? `One mock every ${gap} days fits your ${daysLeft}-day runway` : 'Attempt it in one sitting, with the sectional timers', to: null });
  if (lastId) items.push({ id: `rev-${lastId}`, label: 'Review your mistakes from the last mock', hint: 'Read the common-mistake note even on correct answers', to: `/review/${lastId}?filter=incorrect` });
  (stats?.weakTopics || []).slice(0, 3).forEach((t) => items.push({ id: `topic-${t.topic}-${week}`, label: `Revise ${t.topic}`, hint: `${t.accuracy}% accuracy so far`, to: null }));
  if (stats?.weakest) items.push({ id: `sec-${stats.weakest}-${week}`, label: `Do a 30-minute ${sectionName} session`, hint: 'Your lowest-scoring section', to: null });
  if (!stats?.completed) items.unshift({ id: 'baseline', label: 'Take Mock 1 to set your baseline', hint: 'It unlocks your readiness score, radar and plan', to: null });
  const shown = items.slice(0, 6); const n = shown.filter((i) => done[i.id]).length;
  return (
    <div className="ix-card">
      <h3>This week’s plan <small>{n}/{shown.length} done</small></h3>
      <ul className="plan">{shown.map((i) => (
        <li key={i.id} className={done[i.id] ? 'ok' : ''}><label><input type="checkbox" checked={!!done[i.id]} onChange={() => setDone({ ...done, [i.id]: !done[i.id] })} /><span><b>{i.label}</b><small>{i.hint}{i.to && <> · <Link to={i.to}>Open</Link></>}</small></span></label></li>
      ))}</ul>
    </div>
  );
}

export function LockedInsights() {
  const items = [['Exam readiness', 'A 0-100 score built from your marks, accuracy and coverage'], ['Skill radar', 'Strengths and gaps across every section'], ['Score trajectory', 'Your trend, your target line and a projection'], ['Practice streak', 'A calendar of the days you practised']];
  return (
    <section className="ix-locked" aria-label="Insights unlock after your first mock">
      <div className="ix-locked-head"><h2>Your performance cockpit</h2><span>Unlocks after your first mock</span></div>
      <div className="ix-locked-grid">{items.map(([t, d]) => <div key={t} className="ix-card ghost"><h3>{t}</h3><p className="muted small">{d}</p><div className="ghost-bars" aria-hidden="true"><i /><i /><i /></div></div>)}</div>
    </section>
  );
}

/** Shortcuts to the exam toolkit, shown on the home page. */
export function ToolTiles() {
  let ticked = 0; try { ticked = Object.values(JSON.parse(localStorage.getItem('mockdesk-checklist') || '{}')).filter(Boolean).length; } catch { /* storage blocked */ }
  const tiles = [['🧮', 'Score calculator', 'Check your marks against the official answer key', 'calc'], ['⏱', 'Pace planner', 'Clock times and seconds per question for each section', 'pace'], ['🎲', 'Should I guess?', 'Know when a risky answer is worth the −1', 'guess'], ['✅', 'Exam-day checklist', ticked ? `${ticked} of 15 ready` : 'Documents, what to carry and what to leave', 'check']];
  return (
    <section className="hm-tools" aria-label="Exam toolkit">
      <div className="hm-head"><h2>Exam toolkit</h2><Link className="hm-more" to="/toolkit">Open all →</Link></div>
      <div className="hm-tool-grid">{tiles.map(([i, t, d, h]) => <Link key={h} to={`/toolkit#${h}`} className="hm-tool"><span aria-hidden="true">{i}</span><b>{t}</b><small>{d}</small></Link>)}</div>
    </section>
  );
}
