import { useCallback, useEffect, useRef, useState } from 'react';

const root = () => document.documentElement;
const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const canFs = () => !!(root().requestFullscreen || root().webkitRequestFullscreen);
const enter = () => { try { const p = (root().requestFullscreen || root().webkitRequestFullscreen).call(root()); return p && p.catch ? p.catch(() => {}) : Promise.resolve(); } catch { return Promise.resolve(); } };

/* Keeps the student inside the test: fullscreen, no tab or window switching, no back button,
   no copy or paste, no right click. Browsers cannot be locked completely, so every attempt
   to leave is blocked where possible, counted, and shown to the student. */
export default function ExamLock() {
  const supported = useRef(canFs());
  const [needFs, setNeedFs] = useState(supported.current && !inFs());
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState('');

  const last = useRef(0);
  const flag = useCallback((why) => { const t = Date.now(); if (t - last.current > 1500) setLeft((n) => n + 1); last.current = t; setNote(why); }, []);

  useEffect(() => {
    const onFs = () => { if (supported.current && !inFs()) { setNeedFs(true); flag('You exited fullscreen.'); } else setNeedFs(false); };
    const onVis = () => { if (document.visibilityState === 'hidden') flag('You switched to another tab or app.'); };
    const onBlur = () => { if (document.visibilityState === 'visible') flag('The test window lost focus.'); };
    const stop = (e) => e.preventDefault();
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12' || (e.ctrlKey || e.metaKey) && ['r', 'w', 't', 'n', 'p', 's', 'u', 'l', 'k'].includes(k) || (e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k) || e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); }
    };
    history.pushState({ lock: 1 }, '', location.href);
    const onPop = () => { history.pushState({ lock: 1 }, '', location.href); flag('The back button is disabled during the test.'); };
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur);
    document.addEventListener('contextmenu', stop); document.addEventListener('copy', stop); document.addEventListener('cut', stop); document.addEventListener('paste', stop); document.addEventListener('dragstart', stop);
    window.addEventListener('keydown', onKey, true); window.addEventListener('popstate', onPop); window.addEventListener('beforeunload', onUnload);
    document.body.classList.add('exam-locked');
    return () => {
      document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur);
      document.removeEventListener('contextmenu', stop); document.removeEventListener('copy', stop); document.removeEventListener('cut', stop); document.removeEventListener('paste', stop); document.removeEventListener('dragstart', stop);
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('popstate', onPop); window.removeEventListener('beforeunload', onUnload);
      document.body.classList.remove('exam-locked');
      if (inFs()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch { /* ignore */ } }
    };
  }, [flag]);

  const resume = async () => { await enter(); setNeedFs(!inFs() && supported.current); setNote(''); };
  if (!needFs && !note) return null;
  return (
    <div className="lock-ov" role="alertdialog" aria-modal="true" aria-labelledby="lock-t">
      <div className="lock-card">
        <div className="lock-ico" aria-hidden="true">🔒</div>
        <h2 id="lock-t">{needFs ? 'Return to fullscreen to continue' : 'Stay on the test'}</h2>
        {note && <p className="lock-note">{note}</p>}
        <p className="muted">The test runs in fullscreen and cannot be left until you submit. <b>Your timer keeps running.</b>{left > 0 && <> Times you left so far: <b>{left}</b>.</>}</p>
        <button className="btn btn-primary" autoFocus onClick={resume}>{needFs ? 'Continue in fullscreen' : 'Back to the test'}</button>
        {!supported.current && <p className="small muted">Your browser does not support fullscreen. Keep this tab open until you submit.</p>}
      </div>
    </div>
  );
}
