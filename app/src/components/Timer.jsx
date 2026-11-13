import { useEffect, useRef, useState } from 'react';
import { clock } from '../lib/format.js';
/** Counts down to endsAtMs (already corrected for server clock offset via getNow). */
export default function Timer({ endsAtMs, getNow, onExpire, warnSeconds = 300 }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAtMs - getNow()) / 1000)));
  const fired = useRef(false);
  const exp = useRef(onExpire); exp.current = onExpire;
  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const s = Math.max(0, Math.ceil((endsAtMs - getNow()) / 1000));
      setLeft(s);
      if (s <= 0 && !fired.current) { fired.current = true; exp.current?.(); }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAtMs, getNow]);
  const low = left <= warnSeconds, crit = left <= 60;
  return (
    <div className={`timer ${low ? 'low' : ''} ${crit ? 'crit' : ''}`} role="timer" aria-label="Time left in this section">
      <span className="timer-lbl">Time left</span>
      <span className="timer-val">{clock(left)}</span>
      <span className="sr-only" aria-live="polite">{left === warnSeconds || left === 60 ? `${Math.ceil(left / 60)} minute${left > 60 ? 's' : ''} remaining` : ''}</span>
    </div>
  );
}
