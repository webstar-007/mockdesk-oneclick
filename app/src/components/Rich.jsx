import { rich } from '../lib/format.js';
export default function Rich({ text }) {
  return <>{rich(text).map((p, i) => (typeof p === 'string' ? p : p.k === 'b' ? <strong key={i}>{p.t}</strong> : <u key={i}>{p.t}</u>))}</>;
}
