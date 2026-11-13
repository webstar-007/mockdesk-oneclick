import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { tip } from '../components/Tip.jsx';

export function useLoad(url, deps = []) {
  const [s, set] = useState({ data: null, err: '', loading: true });
  const [n, setN] = useState(0);
  useEffect(() => { let live = true; set((x) => ({ ...x, loading: true })); api.get(url).then((data) => live && set({ data, err: '', loading: false })).catch((e) => live && set({ data: null, err: e.message, loading: false })); return () => { live = false; }; }, [url, n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: useCallback(() => setN((x) => x + 1), []) };
}
export const toast = (msg, tone = 'good') => window.dispatchEvent(new CustomEvent('ad-toast', { detail: { msg, tone, id: Math.random() } }));
export function ToastHost() {
  const [list, setList] = useState([]);
  useEffect(() => { const on = (e) => { setList((l) => [...l, e.detail]); setTimeout(() => setList((l) => l.filter((x) => x.id !== e.detail.id)), 4200); }; window.addEventListener('ad-toast', on); return () => window.removeEventListener('ad-toast', on); }, []);
  return <div className="ad-toasts" aria-live="polite">{list.map((t) => <div key={t.id} className={`ad-toast t-${t.tone}`}>{t.msg}</div>)}</div>;
}
export const dt = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
export const dOnly = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const ago = (ms) => { if (!ms) return 'never'; const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`; return dOnly(ms); };
export const mmss = (s) => (s == null ? '–' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);

export function PageHead({ title, sub, children }) { return <header className="ad-head"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div><div className="ad-head-act">{children}</div></header>; }
export function Stat({ label, value, sub, tone = '', icon }) { return <div className={`ad-stat ${tone}`}><span className="ad-stat-ico" aria-hidden="true">{icon}</span><div><b>{value}</b><span>{label}</span>{sub && <small>{sub}</small>}</div></div>; }
export function Badge({ tone = 'mute', children }) { return <span className={`ad-badge b-${tone}`}>{children}</span>; }
export const statusTone = { published: 'good', draft: 'warn', archived: 'mute', active: 'good', suspended: 'bad', submitted: 'good', in_progress: 'brand', open: 'warn', resolved: 'good', dismissed: 'mute', admin: 'brand', student: 'mute' };
export const diffTone = { easy: 'good', moderate: 'warn', hard: 'bad' };
export function Empty({ children }) { return <div className="ad-empty">{children}</div>; }
export function Err({ children }) { return children ? <div className="alert" role="alert">{children}</div> : null; }
export function Loading() { return <p className="muted" role="status">Loading…</p>; }

export function Pager({ page, size, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="ad-pager"><span className="muted small">{total ? `${(page - 1) * size + 1}–${Math.min(total, page * size)} of ${total}` : 'No results'}</span><div><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button><span className="small">Page {page} / {pages}</span><button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button></div></div>;
}
export function SortTh({ k, sort, dir, onSort, children, className }) {
  const on = sort === k;
  return <th scope="col" className={className} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`ad-sort${on ? ' on' : ''}`} onClick={() => onSort(k, on && dir === 'desc' ? 'asc' : 'desc')}>{children}<i aria-hidden="true">{on ? (dir === 'asc' ? '▲' : '▼') : '↕'}</i></button></th>;
}
export function useSort(def = 'joined', defDir = 'desc') { const [s, set] = useState({ sort: def, dir: defDir }); return [s, (sort, dir) => set({ sort, dir })]; }

/** Typed-confirmation modal for dangerous actions. */
export function ConfirmModal({ title, children, word, label = 'Confirm', danger, busy, onConfirm, onClose, error }) {
  const [typed, setTyped] = useState('');
  const ok = !word || typed.trim() === word;
  return (
    <div className="modal-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ad-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>{children}
        {word && <label className="ad-field">Type <b>{word}</b> to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>}
        <Err>{error}</Err>
        <div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy} onClick={() => onConfirm(typed.trim())}>{busy ? 'Working…' : label}</button></div>
      </div>
    </div>
  );
}
export function Dialog({ title, onClose, children, wide }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`modal ad-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="ad-modal-head"><h2>{title}</h2><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button></div>{children}</div></div>;
}

/** Daily bars (signups, attempts) or any [{label, n}] series with rich hover. */
export function Bars({ data, unit = '', tone = 'brand', height = 120, every = 5, title }) {
  const mx = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="ad-bars" style={{ height }} role="img" aria-label={`${title || 'Chart'}: ${data.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
      {data.map((d, i) => <div key={i} className="ad-bar" tabIndex={0} {...tip({ t: title, v: `${d.label}`, tone, rows: [[unit || 'Count', d.n]] })}><i className={`t-${tone}`} style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / mx) * 100)}%` }} /><em>{i % every === 0 ? d.short ?? d.label : ''}</em></div>)}
    </div>
  );
}
export const dayLabel = (d) => ({ label: new Date(d.day + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }), short: new Date(d.day + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }), n: d.n });

export function TagInput({ value = [], onChange, suggestions = [], id, placeholder = 'Type and press Enter' }) {
  const [t, setT] = useState('');
  const add = (x) => { const v = x.trim().toLowerCase(); if (v && !value.includes(v)) onChange([...value, v]); setT(''); };
  return (
    <div className="ad-tags">
      {value.map((x) => <span key={x} className="ad-tag">{x}<button type="button" aria-label={`Remove ${x}`} onClick={() => onChange(value.filter((y) => y !== x))}>×</button></span>)}
      <input id={id} list={id ? `${id}-sg` : undefined} value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(t); } else if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1)); }} onBlur={() => t && add(t)} />
      {id && <datalist id={`${id}-sg`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
    </div>
  );
}

export function ImageField({ value, onChange, label = 'Image' }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); setErr(''); try { onChange(await api.upload(f)); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="ad-img">
      {value ? <div className="ad-img-prev"><img src={value} alt={`${label} preview`} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Remove</button></div>
        : <label className="ad-drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick} disabled={busy} /><span>{busy ? 'Uploading…' : `＋ Add ${label.toLowerCase()}`}</span><small>PNG, JPG, WebP or GIF, up to 4 MB</small></label>}
      {err && <p className="ad-err small" role="alert">{err}</p>}
    </div>
  );
}
