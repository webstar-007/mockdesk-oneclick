import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Err, Bars, Loading, PageHead, Stat, dayLabel, mmss, useLoad } from './ui.jsx';
import { tip } from '../components/Tip.jsx';

const QList = ({ title, rows, unit }) => (
  <section className="card"><h3>{title}</h3>{rows.length ? <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>{rows.map((q) => <li key={q.id}><Link to={`/admin/mocks/${q.mockId}?q=${q.id}`}>{q.text}…</Link><br /><small className="muted">{q.section} · {q.topic} · <b>{unit(q)}</b> · {q.attempts} answers</small></li>)}</ol> : <p className="muted small">Needs questions answered by at least 3 students.</p>}</section>
);
export default function Analytics() {
  const mocks = useLoad('/admin/mocks'); const [mock, setMock] = useState('');
  const { data: d, err, loading } = useLoad(`/admin/analytics?mock=${mock}`, [mock]);
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const mx = Math.max(1, ...d.histogram.map((h) => h.n)); const top = d.funnel[0].n || 1;
  return (
    <>
      <PageHead title="Analytics" sub="How students perform across the whole platform."><select value={mock} onChange={(e) => setMock(e.target.value)} aria-label="Mock" style={{ height: 40 }}><option value="">All mocks</option>{mocks.data?.mocks.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></PageHead>
      <div className="ad-grid g4"><Stat icon="📄" label="Finished attempts" value={d.sample} /><Stat icon="🎯" label="Average score" value={`${d.avgPct}%`} /><Stat icon="⏲" tone={d.autoSubmitted ? 'warn' : ''} label="Auto-submitted" value={d.autoSubmitted} sub="Timer ran out" /><Stat icon="⚑" label="Mocks with data" value={d.perMock.filter((m) => m.finished).length} /></div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Score distribution</h3>{d.sample ? <div className="ad-hist">{d.histogram.map((h) => <div key={h.from} tabIndex={0} {...tip({ t: 'Score band', v: `${h.from}–${h.to}%`, tone: 'brand', rows: [['Students', h.n], ['Share', `${d.sample ? Math.round((h.n / d.sample) * 100) : 0}%`]] })}><i style={{ height: `${Math.max(h.n ? 6 : 2, (h.n / mx) * 100)}%` }} /><em>{h.from}</em></div>)}</div> : <Empty>No finished attempts.</Empty>}</section>
        <section className="card"><h3>Signup to finish funnel</h3><div className="ad-funnel">{d.funnel.map((f) => <div key={f.label}><span>{f.label}</span><div className="bar" style={{ width: `${Math.max(3, (f.n / top) * 100)}%` }} tabIndex={0} {...tip({ t: f.label, v: `${f.n} students`, rows: [['Of signups', `${Math.round((f.n / top) * 100)}%`]] })} /><b>{f.n}</b></div>)}</div></section>
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>New students, last 60 days</h3><Bars title="New students" unit="Signups" every={10} data={d.signups.map(dayLabel)} /></section>
        <section className="card"><h3>Tests started, last 60 days</h3><Bars title="Tests started" tone="good" unit="Tests" every={10} data={d.attemptsDaily.map(dayLabel)} /></section>
      </div>
      <h2>Sections</h2>
      <div className="card nopad"><table className="ad-table"><thead><tr><th>Section</th><th className="num">Avg score</th><th className="num">Avg accuracy</th><th className="num">Avg time</th></tr></thead><tbody>{d.sections.map((s) => <tr key={s.key}><td><b>{s.short}</b></td><td className="num">{s.avgPct}%</td><td className="num">{s.avgAccuracy}%</td><td className="num">{mmss(s.avgTimeSec)}</td></tr>)}{!d.sections.length && <tr><td colSpan="4"><Empty>No data yet.</Empty></td></tr>}</tbody></table></div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        {[['Weakest topics', d.weakestTopics, 'bad'], ['Strongest topics', d.strongestTopics, 'good']].map(([t, list, tone]) => <section key={t} className="card"><h3>{t}</h3>{list.length ? <div className="ad-sec-bars">{list.map((x) => <div key={x.topic + x.section} tabIndex={0} {...tip({ t: x.topic, v: `${x.accuracy}% accuracy`, tone, rows: [['Section', x.section], ['Answers', x.total]] })} style={{ gridTemplateColumns: '1fr 90px 52px' }}><span>{x.topic}</span><span className="ad-prog"><i style={{ width: `${x.accuracy}%`, background: `var(--${tone})` }} /></span><b>{x.accuracy}%</b></div>)}</div> : <p className="muted small">Needs at least 5 answers per topic.</p>}</section>)}
      </div>
      <div className="ad-grid g3" style={{ marginTop: 14 }}><QList title="Hardest questions" rows={d.hardest} unit={(q) => `${q.pctCorrect}% correct`} /><QList title="Easiest questions" rows={d.easiest} unit={(q) => `${q.pctCorrect}% correct`} /><QList title="Slowest questions" rows={d.slowest} unit={(q) => `${q.avgTimeSec}s average`} /></div>
      <h2>Mock completion</h2>
      <div className="card nopad"><table className="ad-table"><thead><tr><th>Mock</th><th className="num">Started</th><th className="num">Finished</th><th>Completion</th></tr></thead><tbody>{d.perMock.map((m) => <tr key={m.id}><td><Link to={`/admin/mocks/${m.id}`}><b>{m.name}</b></Link></td><td className="num">{m.started}</td><td className="num">{m.finished}</td><td><span className="ad-meter"><i className={m.completion < 50 ? 'low' : m.completion < 80 ? 'mid' : ''} style={{ width: `${m.completion}%` }} /></span>{m.completion}%</td></tr>)}</tbody></table></div>
    </>
  );
}
