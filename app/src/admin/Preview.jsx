import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Badge, Err, Loading, useLoad } from './ui.jsx';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';
import Blueprint from '../components/Blueprint.jsx';

/** Admin preview: the mock exactly as a student sees it, without creating an attempt or touching any statistics. */
export default function Preview() {
  const { id } = useParams(); const { config } = useAuth(); const { data: d, err, loading } = useLoad(`/admin/mocks/${id}`, [id]);
  const [stage, setStage] = useState('intro'); const [sec, setSec] = useState(null); const [i, setI] = useState(0); const [ans, setAns] = useState({}); const [mark, setMark] = useState({}); const [reveal, setReveal] = useState(false); const [phone, setPhone] = useState(false);
  const groups = useMemo(() => { if (!d || !config) return []; return Object.entries(config.sections).map(([k, s]) => ({ key: k, ...s, qs: d.questions.filter((q) => q.section === k) })).filter((g) => g.qs.length); }, [d, config]);
  if (loading || !config) return <Loading />; if (err) return <Err>{err}</Err>;
  const m = d.mock; const cur = groups.find((g) => g.key === (sec || groups[0]?.key)) || groups[0]; const q = cur?.qs[i];
  const seg = config.segments.find((s) => s.sections.includes(cur?.key));
  const status = (qq) => (mark[qq.id] ? (ans[qq.id] != null ? 'marked-ans' : 'marked') : ans[qq.id] != null ? 'answered' : 'open');
  const pick = (g) => { setSec(g.key); setI(0); };
  const head = <div className="ad-head"><div><h1>Student preview · {m.name}</h1><p className="muted">This is what a student will see. Nothing you do here is saved or counted.</p></div><div className="ad-head-act"><Badge tone={m.status === 'published' ? 'good' : 'warn'}>{m.status}</Badge><Link className="btn btn-ghost" to={`/admin/mocks/${id}`}>← Back to builder</Link></div></div>;
  if (!groups.length) return <>{head}<div className="card">This mock has no questions yet.</div></>;
  if (stage === 'intro') return (
    <>{head}
      <div className="card" style={{ maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>{m.name}</h2>
        <p className="muted">{m.description || 'No description yet.'}</p>
        <div className="ad-pill-row" style={{ marginBottom: 12 }}><Badge tone={m.difficulty === 'hard' ? 'bad' : m.difficulty === 'easy' ? 'good' : 'warn'}>{m.difficulty}</Badge>{m.tags.filter((t) => t !== m.difficulty).map((t) => <Badge key={t} tone="brand">{t}</Badge>)}</div>
        <div className="ad-check warn" style={{ marginBottom: 14 }}><b>{m.questions} question{m.questions === 1 ? "" : "s"} · {groups.length} section{groups.length === 1 ? "" : "s"}</b><span className="small">{groups.map((g) => `${g.short} ${g.qs.length}/${g.questions}`).join('  ·  ')}</span></div>
        <Blueprint config={config} examName={config.exam?.name || ''} />
        <p style={{ marginTop: 18 }}><button className="btn btn-primary btn-lg" onClick={() => setStage('exam')}>Start preview</button></p>
      </div>
    </>);
  return (
    <>{head}
      <div className="ad-toolbar"><button className={`ad-pill ${!phone ? 'on' : ''}`} onClick={() => setPhone(false)}>🖥 Desktop</button><button className={`ad-pill ${phone ? 'on' : ''}`} onClick={() => setPhone(true)}>📱 Phone width</button><label className="ad-chk"><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Show correct answer and explanation (admin only)</label><span className="grow" /><button className="btn btn-ghost btn-sm" onClick={() => setStage('intro')}>Instructions screen</button></div>
      <div className="pv-frame" style={{ maxWidth: phone ? 400 : undefined }}>
        <div className="pv-bar"><b>{m.name}</b><span>{seg ? `Section timer: ${seg.minutes} min (disabled in preview)` : ''}</span></div>
        <div className="pv-tabs" role="tablist">{groups.map((g) => <button key={g.key} role="tab" aria-selected={g.key === cur.key} className={g.key === cur.key ? 'on' : ''} onClick={() => pick(g)}>{g.short} <small>{g.qs.filter((x) => ans[x.id] != null).length}/{g.qs.length}</small>{g.qualifying && <em>qualifying</em>}</button>)}</div>
        <div className={`pv-body ${phone ? 'one' : ''}`}>
          <div className="pv-q">
            <QuestionView q={q} number={i + 1}>
              <OptionList mode={reveal ? 'review' : 'exam'} options={q.options} figures={q.optionFigures} images={q.optionImages} selected={ans[q.id] ?? null} correct={q.answer} onSelect={(n) => setAns({ ...ans, [q.id]: n })} />
              {reveal && <div className="box tip" style={{ marginTop: 10 }}><b>Explanation</b><p>{q.explanation || 'No explanation written yet.'}</p>{q.steps?.length > 0 && <ol>{q.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>}</div>}
            </QuestionView>
            <div className="pv-nav"><button className="btn btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous</button><button className="btn btn-ghost" onClick={() => setMark({ ...mark, [q.id]: !mark[q.id] })}>{mark[q.id] ? '★ Marked' : '☆ Mark for review'}</button><button className="btn btn-ghost" onClick={() => { const n = { ...ans }; delete n[q.id]; setAns(n); }}>Clear</button><button className="btn btn-primary" disabled={i === cur.qs.length - 1} onClick={() => setI(i + 1)}>Save & next →</button></div>
          </div>
          <aside className="pv-pal"><h3>{cur.name}</h3><div className="pv-grid">{cur.qs.map((qq, k) => <button key={qq.id} className={`pv-n ${status(qq)} ${k === i ? 'cur' : ''}`} onClick={() => setI(k)} aria-label={`Question ${k + 1}, ${status(qq)}`}>{k + 1}</button>)}</div>
            <ul className="pv-key"><li><i className="answered" />Answered</li><li><i className="marked" />Marked</li><li><i className="open" />Not answered</li></ul></aside>
        </div>
      </div>
    </>
  );
}
