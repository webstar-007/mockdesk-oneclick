import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Spread onto any element: <i {...tip({ t:'Maths Q4', v:'Correct', rows:[['Time','22 s']], tone:'good', hint:'Click to open' })} />
 *  t = title, v = headline value, rows = [label, value] pairs, tone = good | bad | warn | brand, hint = small footer line. */
export const tip = (o) => ({ 'data-tip': JSON.stringify(o) });

/** One shared, themed tooltip for the whole app. Mouse: hover. Keyboard: focus. Touch: first tap shows it, a second tap follows the link. */
export default function TipLayer() {
  const [s, setS] = useState(null); // { o, rect }
  const [pos, setPos] = useState(null);
  const box = useRef(null); const cur = useRef(null);

  useEffect(() => {
    const find = (e) => (e.target instanceof Element ? e.target.closest('[data-tip]') : null);
    const show = (el) => { let o; try { o = JSON.parse(el.getAttribute('data-tip')); } catch { return; } cur.current = el; setPos(null); setS({ o, rect: el.getBoundingClientRect() }); };
    const hide = () => { cur.current = null; setS(null); };
    const over = (e) => { if (e.pointerType === 'touch') return; const el = find(e); if (el) show(el); else if (cur.current) hide(); };
    const fin = (e) => { const el = find(e); if (el) show(el); };
    const down = (e) => { if (e.pointerType !== 'touch') return; const el = find(e); if (!el) { hide(); return; } if (cur.current !== el) { show(el); el.dataset.tipArmed = '1'; } };
    const click = (e) => { const el = find(e); if (el?.dataset.tipArmed) { delete el.dataset.tipArmed; e.preventDefault(); } };
    const key = (e) => { if (e.key === 'Escape') hide(); };
    const doc = document;
    doc.addEventListener('pointerover', over); doc.addEventListener('focusin', fin); doc.addEventListener('focusout', hide);
    doc.addEventListener('pointerdown', down); doc.addEventListener('click', click, true); doc.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => { doc.removeEventListener('pointerover', over); doc.removeEventListener('focusin', fin); doc.removeEventListener('focusout', hide); doc.removeEventListener('pointerdown', down); doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', key); window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, []);

  useLayoutEffect(() => {
    if (!s || !box.current) return;
    const b = box.current.getBoundingClientRect(); const r = s.rect; const m = 10;
    let left = r.left + r.width / 2 - b.width / 2; left = Math.max(m, Math.min(window.innerWidth - b.width - m, left));
    let top = r.top - b.height - 12, below = false; if (top < m) { top = r.bottom + 12; below = true; }
    const ax = Math.max(14, Math.min(b.width - 14, r.left + r.width / 2 - left));
    setPos({ left, top, ax, below });
  }, [s]);

  if (!s) return null; const o = s.o;
  return (
    <div ref={box} className={`tip tone-${o.tone || 'brand'}${pos?.below ? ' below' : ''}`} role="tooltip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', '--ax': `${pos?.ax ?? 20}px` }}>
      {o.t && <div className="tip-t">{o.t}</div>}
      {o.v && <div className="tip-v"><i />{o.v}</div>}
      {o.rows?.length > 0 && <dl>{o.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {o.hint && <div className="tip-h">{o.hint}</div>}
    </div>
  );
}
