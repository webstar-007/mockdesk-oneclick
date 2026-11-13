import { useEffect, useRef, useState } from 'react';

/** The one PDF control used everywhere (result page, bottom of result page, history list).
 *  Always offers the same two downloads. The popup is position:fixed so tables and cards never clip it. */
export default function PdfMenu({ id, compact = false, large = false, up = false }) {
  const ref = useRef(null); const [pos, setPos] = useState(null);
  const close = () => { if (ref.current) ref.current.open = false; setPos(null); };
  useEffect(() => {
    const out = (e) => { if (ref.current?.open && !ref.current.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', out); document.addEventListener('keydown', esc); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('click', out); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, []);
  const toggle = (e) => {
    const r = e.currentTarget.getBoundingClientRect(); const w = Math.min(340, window.innerWidth - 20);
    const left = Math.max(10, Math.min(window.innerWidth - w - 10, r.right - w));
    const wantUp = up || r.bottom + 190 > window.innerHeight;
    setPos(wantUp ? { left, width: w, bottom: window.innerHeight - r.top + 8 } : { left, width: w, top: r.bottom + 8 });
  };
  return (
    <details className={`pdf-menu${compact ? ' compact' : ''}`} ref={ref}>
      <summary className={compact ? 'pdf-link' : `btn btn-ghost${large ? ' btn-lg' : ''}`} onClick={toggle}>{compact ? 'PDF ▾' : '⬇ Download PDF'}</summary>
      {pos && (
        <div className="pdf-pop" style={pos} onClick={close}>
          <a href={`/api/attempts/${id}/report.pdf`} download><b>Report with mistakes</b><small>Result, analysis and solutions for questions you got wrong or skipped</small></a>
          <a href={`/api/attempts/${id}/report.pdf?scope=all`} download><b>Full solutions</b><small>Everything above plus solutions for every question (long file)</small></a>
        </div>
      )}
    </details>
  );
}
