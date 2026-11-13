import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExamLock from '../components/ExamLock.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Timer from '../components/Timer.jsx';
import Palette, { statusOf, STATUS_ORDER } from '../components/Palette.jsx';
import QuestionView from '../components/QuestionView.jsx';
import OptionList from '../components/OptionList.jsx';
import Modal from '../components/Modal.jsx';

export default function ExamPage() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  const { user, config } = useAuth();
  const [att, setAtt] = useState(null);
  const [resp, setResp] = useState({});
  const [cur, setCur] = useState(null);
  const [err, setErr] = useState('');
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false); const [showInstr, setShowInstr] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [busy, setBusy] = useState(false);
  const offset = useRef(0);
  const dirty = useRef(new Set());
  const respRef = useRef({}); respRef.current = resp;
  const curRef = useRef(null); curRef.current = cur;
  const since = useRef(Date.now());
  const attRef = useRef(null); attRef.current = att;
  const getNow = useCallback(() => Date.now() + offset.current, []);

  const adopt = useCallback((a, msg) => {
    offset.current = new Date(a.serverNow) - Date.now();
    dirty.current = new Set();
    since.current = Date.now();
    setAtt(a); setResp(a.responses); setCur(a.lastQid || a.questions[0]?.id);
    setConfirm(false); setSheet(false);
    if (msg) setNotice(msg);
    // opening a question marks it visited
    const first = a.lastQid || a.questions[0]?.id;
    if (first) setResp((r) => ({ ...r, [first]: { ...r[first], visited: true } }));
    if (first) dirty.current.add(first);
  }, []);

  useEffect(() => {
    api.get(`/attempts/${attemptId}`).then((r) => {
      if (r.status === 'submitted') nav(`/results/${attemptId}`, { replace: true });
      else adopt(r.attempt);
    }).catch((e) => setErr(e.message));
  }, [attemptId, adopt, nav]);

  /** responses with the running time of the current question folded in */
  const snapshot = useCallback((onlyDirty) => {
    const out = {}; const c = curRef.current; const now = Date.now();
    const base = respRef.current;
    const ids = onlyDirty ? [...dirty.current, ...(c ? [c] : [])] : Object.keys(base);
    for (const id of new Set(ids)) {
      if (!base[id]) continue;
      out[id] = { ...base[id], timeMs: (base[id].timeMs || 0) + (id === c ? now - since.current : 0) };
    }
    return out;
  }, []);
  const commitTime = useCallback(() => {
    const c = curRef.current; if (!c) return;
    const now = Date.now(); const d = now - since.current; since.current = now;
    setResp((r) => ({ ...r, [c]: { ...r[c], timeMs: (r[c]?.timeMs || 0) + d } }));
    dirty.current.add(c);
  }, []);

  const save = useCallback(async () => {
    if (!attRef.current || !dirty.current.size && !curRef.current) return true;
    const snap = snapshot(true); const sent = new Set(dirty.current);
    setSaveState('saving');
    try {
      await api.put(`/attempts/${attemptId}/responses`, { responses: snap, lastQid: curRef.current });
      sent.forEach((id) => dirty.current.delete(id)); setSaveState('saved'); return true;
    } catch (e) {
      if (e.code === 'SEGMENT_EXPIRED') { await reload('Time for the previous section ended; it was submitted automatically.'); return false; }
      setSaveState('error'); return false;
    }
  }, [attemptId, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async (msg) => {
    try {
      const r = await api.get(`/attempts/${attemptId}`);
      if (r.status === 'submitted') nav(`/results/${attemptId}`, { replace: true }); else adopt(r.attempt, msg);
    } catch (e) { setErr(e.message); }
  }, [attemptId, adopt, nav]);

  // autosave
  useEffect(() => {
    if (!att) return undefined;
    const id = setInterval(() => { if (dirty.current.size) save(); }, config?.autosaveMs || 10000);
    return () => clearInterval(id);
  }, [att, save, config]);
  useEffect(() => { // debounce save shortly after any change
    if (!att || !dirty.current.size) return undefined;
    setSaveState((s) => (s === 'error' ? s : 'unsaved'));
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [resp, att, save]);
  useEffect(() => {
    const h = (e) => { if (dirty.current.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    const vis = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('beforeunload', h); document.removeEventListener('visibilitychange', vis); };
  }, [save]);

  const qs = att?.questions || [];
  const idx = Math.max(0, qs.findIndex((q) => q.id === cur));
  const q = qs[idx];
  const r = q ? resp[q.id] || {} : {};
  const isLast = att && att.segmentIndex === att.segments.length - 1;
  const seg = att?.segments[att.segmentIndex];
  const labels = config?.statuses || { notVisited: 'Not Visited', notAnswered: 'Not Answered', answered: 'Answered', marked: 'Marked for Review', answeredMarked: 'Answered & Marked' };

  const patch = useCallback((id, p) => { setResp((s) => ({ ...s, [id]: { ...s[id], ...p } })); dirty.current.add(id); }, []);
  const go = useCallback((id) => {
    if (!id || id === curRef.current) { setSheet(false); return; }
    commitTime();
    setCur(id); since.current = Date.now(); setSheet(false);
    setResp((s) => ({ ...s, [id]: { ...s[id], visited: true } })); dirty.current.add(id);
    document.querySelector('.qpane')?.scrollTo?.({ top: 0 });
  }, [commitTime]);
  const step = (d) => { const n = qs[idx + d]; if (n) go(n.id); };
  const select = (i) => q && patch(q.id, { selected: i, visited: true });
  const clear = () => q && patch(q.id, { selected: null });
  const markNext = () => { if (!q) return; patch(q.id, { marked: !r.marked }); if (!r.marked) step(1); };
  const saveNext = () => step(1);

  useEffect(() => {
    const key = (e) => {
      if (confirm || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (['1', '2', '3', '4'].includes(k)) select(Number(k) - 1);
      else if (['a', 'b', 'c', 'd'].includes(k)) select(k.charCodeAt(0) - 97);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }); // intentionally re-bound each render so handlers see fresh state

  const submitSegment = useCallback(async (auto) => {
    if (busy && !auto) return;
    setBusy(true); setConfirm(false);
    commitTime();
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const body = { responses: snapshot(false), lastQid: curRef.current };
        const out = await api.post(`/attempts/${attemptId}/segment/submit`, body);
        setBusy(false);
        if (out.status === 'submitted') nav(`/results/${attemptId}`, { replace: true });
        else adopt(out.attempt, auto ? 'Time is up. The previous section was submitted automatically.' : '');
        return;
      } catch (e) { await new Promise((res) => setTimeout(res, 1200 * (attempt + 1))); }
    }
    setBusy(false); setErr('Could not reach the server to submit. Your answers are saved locally in this tab; check your connection and press Submit again.');
  }, [attemptId, adopt, busy, commitTime, nav, snapshot]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
    qs.forEach((x) => { c[statusOf(resp[x.id])]++; });
    return c;
  }, [qs, resp]);

  if (err && !att) return <div className="center-page"><div className="card"><h1>Can't open this test</h1><p>{err}</p><button className="btn" onClick={() => nav('/')}>Back to dashboard</button></div></div>;
  if (!att || !q) return <div className="center-page" role="status">Loading your test…</div>;

  const endsAt = new Date(att.segmentEndsAt).getTime();
  const sectionName = seg.sections.map((s) => config?.sections[s]?.name || s).join(' + ');
  const answeredN = counts.answered + counts.answeredMarked;

  return (
    <div className="exam">
      <ExamLock attemptId={attemptId} />
      <header className="exam-head">
        <div className="eh-left">
          <div className="eh-title">{att.mockName}</div>
          <div className="eh-sub"><span className="eh-sec">{sectionName}</span>{seg.sections.some((s) => config?.sections[s]?.qualifying) && <span className="qual-tag inline">Qualifying</span>}<span className="eh-cand"> · {user?.name}</span></div>
        </div>
        <ol className="seg-steps" aria-label="Sections">
          {att.segments.map((s, i) => (<li key={s.id} className={s.state} aria-current={s.state === 'open' ? 'step' : undefined}>{(config?.sections[s.sections[0]]?.short) || s.id}</li>))}
        </ol>
        <div className="eh-right">
          <span className={`savestate ${saveState}`} aria-live="polite">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Offline: retrying' : 'Unsaved'}</span>
          <Timer endsAtMs={endsAt} getNow={getNow} onExpire={() => submitSegment(true)} warnSeconds={config?.lowTimeWarningSeconds || 300} />
          <button className="btn btn-pal" onClick={() => setSheet(true)} aria-haspopup="dialog">Palette</button>
        </div>
      </header>

      {notice && <div className="banner" role="status">{notice}<button className="btn-x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {err && <div className="banner bad" role="alert">{err}<button className="btn-x" onClick={() => setErr('')} aria-label="Dismiss">×</button></div>}

      <div className="exam-body">
        <main className="qpane" id="main" tabIndex={-1}>
          <QuestionView q={q} number={idx + 1} extraMeta={r.marked ? <span className="flag">Marked for review</span> : null}>
            <OptionList options={q.options} figures={q.optionFigures} images={q.optionImages} selected={r.selected} onSelect={select} name={q.id} />
          </QuestionView>
        </main>
        <aside className="side" aria-label="Question palette and summary">
          <div className="cand"><div className="avatar" aria-hidden="true">{(user?.name || '?')[0].toUpperCase()}</div><div><strong>{user?.name}</strong><span>{sectionName}</span></div></div>
          <Palette questions={qs} responses={resp} currentId={q.id} onJump={go} labels={labels} />
          <button type="button" className="btn btn-ghost" onClick={() => setShowInstr(true)}>View instructions</button>
          <button className="btn btn-submit" onClick={() => { commitTime(); setConfirm(true); }}>{isLast ? 'Submit Test' : 'Submit Section'}</button>
        </aside>
      </div>

      <footer className="exam-foot">
        <button className="btn btn-ghost" onClick={() => step(-1)} disabled={idx === 0}>← Previous</button>
        <button className="btn btn-mark" onClick={markNext}>{r.marked ? 'Unmark review' : 'Mark for Review & Next'}</button>
        <button className="btn btn-ghost" onClick={clear} disabled={r.selected == null}>Clear</button>
        <button className="btn btn-primary" onClick={saveNext} disabled={idx === qs.length - 1}>Save &amp; Next →</button>
        <button className="btn btn-submit foot-submit" onClick={() => { commitTime(); setConfirm(true); }}>{isLast ? 'Submit' : 'Submit Section'}</button>
      </footer>

      {showInstr && (
        <Modal title="Instructions" onClose={() => setShowInstr(false)} actions={<button className="btn btn-primary" onClick={() => setShowInstr(false)}>Back to test</button>}>
          <ol className="instr-list">{(config?.instructions || []).map((t, i) => <li key={i}>{t}</li>)}</ol>
        </Modal>
      )}

      {sheet && (
        <Modal title="Question palette" onClose={() => setSheet(false)} actions={<><button className="btn btn-ghost" onClick={() => setSheet(false)}>Close</button><button className="btn btn-submit" onClick={() => { setSheet(false); commitTime(); setConfirm(true); }}>{isLast ? 'Submit Test' : 'Submit Section'}</button></>}>
          <Palette questions={qs} responses={resp} currentId={q.id} onJump={go} labels={labels} />
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { setSheet(false); setShowInstr(true); }}>View instructions</button>
        </Modal>
      )}
      {confirm && (
        <Modal title={isLast ? 'Submit the test?' : `Submit ${sectionName}?`} onClose={() => setConfirm(false)}
          actions={<><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Go back</button><button className="btn btn-submit" onClick={() => submitSegment(false)} disabled={busy}>{busy ? 'Submitting…' : isLast ? 'Yes, submit test' : 'Yes, submit section'}</button></>}>
          <p>{isLast ? 'This is the last section. After submitting you will see your result.' : 'You cannot return to this section once it is submitted. The next section starts immediately.'}</p>
          {seg.sections.some((x) => config?.sections[x]?.qualifying) && <p className="small muted">This is a qualifying section: you need {config.sections[seg.sections.find((x) => config.sections[x].qualifying)].qualifyingMarks} marks to qualify. Its marks are not added to your total score.</p>}
          <table className="confirm-tbl"><tbody>
            <tr><th>Total questions</th><td>{qs.length}</td></tr>
            <tr><th>Answered</th><td>{answeredN}</td></tr>
            <tr><th>Not answered</th><td>{counts.notAnswered + counts.marked}</td></tr>
            <tr><th>Marked for review</th><td>{counts.marked + counts.answeredMarked}</td></tr>
            <tr><th>Not visited</th><td>{counts.notVisited}</td></tr>
          </tbody></table>
          {qs.length - answeredN > 0 && <p className="warn-txt">{qs.length - answeredN} question{qs.length - answeredN > 1 ? 's are' : ' is'} unanswered. There is no negative marking for leaving them blank.</p>}
        </Modal>
      )}
    </div>
  );
}
