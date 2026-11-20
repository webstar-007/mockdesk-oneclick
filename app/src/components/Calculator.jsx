import { useState } from 'react';

/** Basic on-screen calculator for exams that allow one. No eval: it applies one operation at a time. */
const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => (b === 0 ? NaN : a / b) };
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e10) / 1e10) : 'Error');

export default function Calculator({ onClose }) {
  const [shown, setShown] = useState('0'); const [acc, setAcc] = useState(null); const [op, setOp] = useState(null); const [fresh, setFresh] = useState(true);
  const digit = (d) => { setShown((s) => (fresh || s === '0' || s === 'Error' ? (d === '.' ? '0.' : d) : d === '.' && s.includes('.') ? s : s.length > 14 ? s : s + d)); setFresh(false); };
  const apply = () => { if (acc === null || !op) return Number(shown); return OPS[op](acc, Number(shown)); };
  const pick = (o) => { const v = apply(); setAcc(Number.isFinite(v) ? v : null); setShown(fmt(v)); setOp(o); setFresh(true); };
  const equals = () => { if (!op) return; const v = apply(); setShown(fmt(v)); setAcc(null); setOp(null); setFresh(true); };
  const clear = () => { setShown('0'); setAcc(null); setOp(null); setFresh(true); };
  const unary = (f) => { const v = f(Number(shown)); setShown(fmt(v)); setFresh(true); };
  const keys = [['C', clear, 'fn'], ['√', () => unary(Math.sqrt), 'fn'], ['%', () => unary((x) => x / 100), 'fn'], ['÷', () => pick('÷'), 'op'], ...['7', '8', '9'].map((d) => [d, () => digit(d)]), ['×', () => pick('×'), 'op'], ...['4', '5', '6'].map((d) => [d, () => digit(d)]), ['−', () => pick('−'), 'op'], ...['1', '2', '3'].map((d) => [d, () => digit(d)]), ['+', () => pick('+'), 'op'], ['0', () => digit('0')], ['.', () => digit('.')], ['±', () => unary((x) => -x), 'fn'], ['=', equals, 'eq']];
  return (
    <div className="calc" role="dialog" aria-label="Calculator">
      <div className="calc-head"><b>Calculator</b><button type="button" className="btn-x" onClick={onClose} aria-label="Close calculator">×</button></div>
      <output className="calc-screen" aria-live="polite">{shown}</output>
      <div className="calc-keys">{keys.map(([l, f, k]) => <button key={l} type="button" className={`ck ${k || ''}`} onClick={f}>{l}</button>)}</div>
    </div>
  );
}
