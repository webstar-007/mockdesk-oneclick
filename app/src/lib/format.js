export const pad = (n) => String(n).padStart(2, '0');
export function clock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function duration(sec) {
  if (sec == null) return '–';
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}m ${pad(s)}s` : `${s}s`;
}
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
export const num = (n) => (n == null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];
/** tiny inline markup: **bold** and __underline__ (as allowed by the content guide) */
export function rich(text) {
  const out = []; const re = /(\*\*[^*]+\*\*|__[^_]+__)/g; let last = 0, m, i = 0;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? { k: 'b', t: t.slice(2, -2), i: i++ } : { k: 'u', t: t.slice(2, -2), i: i++ });
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
