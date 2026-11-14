import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Err, Loading, PageHead, Stat, mmss, useLoad } from './ui.jsx';

const FLAGS = [['any', 'Any flag'], ['wrong_key', 'Key may be wrong'], ['ambiguous', 'Ambiguous'], ['reported', 'Reported'], ['harder_than_tag', 'Harder than tag'], ['easier_than_tag', 'Easier than tag'], ['skipped', 'Often skipped'], ['slow', 'Slow'], ['no_explanation', 'No explanation']];
const SEV = ['mute', 'warn', 'warn', 'bad'];
export default function Quality() {
  const [flag, setFlag] = useState('any'); const [mock, setMock] = useState(''); const [min, setMin] = useState(5); const [section, setSection] = useState(''); const [shown, setShown] = useState(30);
  const { data, err, loading } = useLoad(`/admin/quality?flag=${flag === 'all' ? '' : flag}&mock=${mock}&min=${min}&section=${section}`, [flag, mock, min, section]);
  const open = (q) => (q.mockId ? `/admin/mocks/${q.mockId}?q=${q.id}` : '/admin/bank');
  return (
    <>
      <PageHead title="Question quality" sub="How each question performed with real students, and which ones may be wrong or unclear." />
      <Err>{err}</Err>
      {data && <div className="ad-grid g4" style={{ marginBottom: 14 }}><Stat label="Questions measured" value={data.total} sub={`at least ${data.minAttempts} attempts`} icon="📊" /><Stat label="Need a look" value={data.flagged} tone={data.flagged ? 'warn' : ''} icon="🚩" /><Stat label="Key may be wrong" value={data.counts.wrong_key || 0} tone={data.counts.wrong_key ? 'bad' : ''} icon="⚠" /><Stat label="Ambiguous" value={data.counts.ambiguous || 0} icon="❔" /></div>}
      <div className="card qa-filters">
        <div className="ad-pill-row">{[['all', 'All'], ...FLAGS].map(([k, n]) => <button key={k} className={`ad-pill ${flag === k ? 'on' : ''}`} onClick={() => setFlag(k)}>{n}{k !== 'all' && k !== 'any' && data?.counts[k] ? ` (${data.counts[k]})` : ''}</button>)}</div>
        <div className="ad-row">
          <label className="ad-field">Mock<select value={mock} onChange={(e) => setMock(e.target.value)}><option value="">All mocks</option>{(data?.mocks || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="ad-field">Section<select value={section} onChange={(e) => setSection(e.target.value)}><option value="">All sections</option>{['maths', 'reasoning', 'english', 'ga'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="ad-field">At least this many attempts<input type="number" min="1" max="200" value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} /></label>
        </div>
      </div>
      {loading && !data ? <Loading /> : !data?.questions.length ? <div className="card" style={{ marginTop: 14 }}><Empty>{data?.total ? 'No questions match these filters.' : 'No question has enough attempts yet. This fills in as students finish mocks.'}</Empty></div> : (
        <div className="qa-list">{data.questions.slice(0, shown).map((q) => (
          <article className="card qa-item" key={q.id}>
            <div className="qa-top"><span className="qa-meta">{q.mockName} · {q.section} · {q.topic} · <i className={`diff d-${q.difficulty}`}>{q.difficulty}</i></span><Link className="btn btn-ghost btn-sm" to={open(q)}>Open to fix</Link></div>
            <p className="qa-text">{q.text}</p>
            <div className="qa-nums"><span><b className={q.pctRight < 25 ? 'c-bad' : ''}>{q.pctRight}%</b> right</span><span><b>{q.pctWrong}%</b> wrong</span><span><b>{q.pctSkipped}%</b> skipped</span><span><b>{mmss(q.avgTimeSec)}</b> average time{q.sectionAvgSec ? <small className="muted"> (section {mmss(q.sectionAvgSec)})</small> : ''}</span><span className="muted">{q.attempts} attempts{q.reports ? ` · ${q.reports} report${q.reports > 1 ? 's' : ''}` : ''}</span></div>
            <div className="qa-opts" role="img" aria-label={q.options.map((v, i) => `Option ${'ABCD'[i]} ${v}%${i === q.keyIndex ? ' (key)' : ''}`).join(', ')}>{q.options.map((v, i) => <div key={i} className={i === q.keyIndex ? 'key' : ''}><i style={{ width: `${Math.max(2, v)}%` }} /><span>{'ABCD'[i]} {v}%{i === q.keyIndex ? ' · key' : ''}</span></div>)}</div>
            {q.flags.length > 0 && <ul className="qa-flags">{q.flags.map((f) => <li key={f.key}><Badge tone={SEV[f.severity]}>{f.label}</Badge> <span className="small">{f.detail}</span></li>)}</ul>}
          </article>))}
          {data.questions.length > shown && <button className="btn btn-ghost" onClick={() => setShown(shown + 30)}>Show more ({data.questions.length - shown} left)</button>}
        </div>)}
    </>
  );
}
