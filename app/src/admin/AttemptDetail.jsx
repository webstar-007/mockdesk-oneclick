import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, Empty, Err, Loading, PageHead, Stat, dt, mmss, statusTone, toast, useLoad } from './ui.jsx';
import { tip } from '../components/Tip.jsx';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';

export default function AttemptDetail() {
  const { id } = useParams(); const nav = useNavigate(); const { data: d, err, loading } = useLoad(`/admin/attempts/${id}`, [id]);
  const [sec, setSec] = useState(''); const [st, setSt] = useState(''); const [open, setOpen] = useState(null); const [del, setDel] = useState(false); const [busy, setBusy] = useState(false);
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const u = d.user;
  const head = <PageHead title={`${u.name}’s attempt`} sub={<><Link to={`/admin/users/${u.id}`}>{u.email || u.phone}</Link></>}><button className="btn btn-ghost dng" onClick={() => setDel(true)}>Delete attempt</button></PageHead>;
  const rm = async () => { setBusy(true); try { await api.del(`/admin/attempts/${id}`); toast('Attempt deleted'); nav('/admin/attempts'); } catch (e) { toast(e.message, 'bad'); setBusy(false); } };
  const delModal = del && <ConfirmModal title="Delete this attempt?" label="Delete" danger busy={busy} onClose={() => setDel(false)} onConfirm={rm}><p>The result disappears from the student’s history and from all statistics.</p></ConfirmModal>;
  if (d.status !== 'submitted') return <>{head}<div className="card"><Badge tone="brand">In progress</Badge> <b>{d.mockName}</b> started {dt(d.startedAt)}. Results appear once the student submits.</div>{delModal}</>;
  const r = d.result; const s = r.summary; const qs = r.questions.filter((q) => (!sec || q.section === sec) && (!st || q.status === st));
  const tone = { correct: 'good', incorrect: 'bad', unattempted: 'mute' };
  return (
    <>
      {head}
      <div className="ad-grid g4">
        <Stat icon="🏆" tone="good" label="Score" value={`${s.score}/${s.maxMarks}`} sub={`${s.percentage}%${d.auto ? ' · auto-submitted' : ''}`} /><Stat icon="🎯" label="Accuracy" value={`${s.accuracy}%`} sub={`${s.correct} right · ${s.incorrect} wrong · ${s.unattempted} skipped`} /><Stat icon="⏱" label="Time taken" value={mmss(s.timeTakenSec)} /><Stat icon="✅" tone={s.qualified === false ? 'bad' : 'good'} label="Computer qualifying" value={s.qualified == null ? 'n/a' : s.qualified ? 'Qualified' : 'Not qualified'} />
      </div>
      <h2>Sections</h2>
      <div className="card nopad"><div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>Section</th><th className="num">Score</th><th className="num">Right</th><th className="num">Wrong</th><th className="num">Skipped</th><th className="num">Accuracy</th><th className="num">Time</th></tr></thead>
        <tbody>{[...r.sections, ...(r.qualifying || [])].map((x) => <tr key={x.key}><td><b>{x.name}</b>{x.qualifying && <> <Badge tone="warn">qualifying</Badge></>}</td><td className="num">{x.score}/{x.maxMarks}</td><td className="num">{x.correct}</td><td className="num">{x.incorrect}</td><td className="num">{x.unattempted}</td><td className="num">{x.accuracy}%</td><td className="num">{mmss(x.timeSec)}</td></tr>)}</tbody></table></div></div>
      <h2>Question by question</h2>
      <div className="ad-pill-row" style={{ marginBottom: 12 }} aria-label="Question map">{r.questions.map((q) => <button key={q.id} type="button" className={`ad-pill ${open === q.id ? 'on' : ''}`} style={{ padding: '2px 9px', borderColor: `var(--${q.status === 'correct' ? 'good' : q.status === 'incorrect' ? 'bad' : 'line'})` }} onClick={() => { setOpen(q.id); setSec(''); setSt(''); }} {...tip({ t: `${q.section} · Q${q.index + 1}`, v: q.status === 'correct' ? 'Correct' : q.status === 'incorrect' ? 'Incorrect' : 'Skipped', tone: tone[q.status], rows: [['Time', mmss(q.timeSec)], ['Topic', q.topic]] })}>{q.index + 1}</button>)}</div>
      <div className="ad-toolbar"><select value={sec} onChange={(e) => setSec(e.target.value)} aria-label="Section"><option value="">All sections</option>{[...r.sections, ...(r.qualifying || [])].map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}</select><select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Result"><option value="">All results</option><option value="correct">Correct</option><option value="incorrect">Wrong</option><option value="unattempted">Skipped</option></select><span className="muted small">{qs.length} questions</span></div>
      <div className="ad-qlist">{qs.map((q) => (
        <div key={q.id} className="card" style={{ padding: 12 }}>
          <button className="ad-q" style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: 0, background: 'none', padding: 0 }} onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id}>
            <span className="no">{q.index + 1}</span><span><p>{q.text}</p><small>{q.section} · {q.topic} · {q.difficulty} · {mmss(q.timeSec)}</small></span><Badge tone={tone[q.status]}>{q.status === 'incorrect' ? `Wrong ${q.marksAwarded}` : q.status === 'correct' ? `Right +${q.marksAwarded}` : 'Skipped'}</Badge>
          </button>
          {open === q.id && <div style={{ marginTop: 12 }}><QuestionView q={q} number={q.index + 1}><OptionList mode="review" options={q.options} figures={q.optionFigures} images={q.optionImages} selected={q.selected} correct={q.correct} />{q.explanation && <div className="box tip" style={{ marginTop: 10 }}><b>Explanation</b><p>{q.explanation}</p></div>}</QuestionView></div>}
        </div>))}{!qs.length && <Empty>No questions match.</Empty>}</div>
      {delModal}
    </>
  );
}
