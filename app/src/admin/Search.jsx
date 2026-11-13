import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

/** Ctrl/⌘ + K: find any user, mock or question and jump straight to it. */
export default function Search({ onClose }) {
  const nav = useNavigate(); const [q, setQ] = useState(''); const [r, setR] = useState(null); const [cur, setCur] = useState(0); const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { if (q.trim().length < 2) { setR(null); return; } const t = setTimeout(() => api.get(`/admin/search?q=${encodeURIComponent(q.trim())}`).then((x) => { setR(x); setCur(0); }).catch(() => {}), 200); return () => clearTimeout(t); }, [q]);
  const items = r ? [...r.users.map((u) => ({ k: 'u' + u.id, g: 'Users', t: u.name, s: u.email || u.phone, to: `/admin/users/${u.id}` })), ...r.mocks.map((m) => ({ k: m.id, g: 'Mocks', t: m.name, s: `${m.status} · ${m.difficulty}`, to: `/admin/mocks/${m.id}` })), ...r.questions.map((x) => ({ k: x.id, g: 'Questions', t: x.text, s: `${x.section} · ${x.topic}`, to: x.mockId === 'pool' ? '/admin/bank' : `/admin/mocks/${x.mockId}?q=${x.id}` }))] : [];
  const go = (it) => { onClose(); nav(it.to); };
  const key = (e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(items.length - 1, c + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); } else if (e.key === 'Enter' && items[cur]) go(items[cur]); };
  let last = '';
  return (
    <div className="modal-back" role="presentation" style={{ alignItems: 'start', paddingTop: '10vh' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ad-search" role="dialog" aria-modal="true" aria-label="Search">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search users, mocks or questions…" aria-label="Search" />
        <div className="ad-search-res">
          {!r && <p className="muted small" style={{ padding: 14, margin: 0 }}>Type at least 2 letters. Search by student name, email or mobile, a mock name, or words from a question.</p>}
          {r && !items.length && <p className="muted small" style={{ padding: 14, margin: 0 }}>Nothing found.</p>}
          {items.map((it, i) => { const head = it.g !== last ? (last = it.g) : null; return <div key={it.k}>{head && <h4>{head}</h4>}<button className={i === cur ? 'on' : ''} onMouseEnter={() => setCur(i)} onClick={() => go(it)}><b>{it.t}</b><small>{it.s}</small></button></div>; })}
        </div>
        <p className="small muted" style={{ margin: '8px 4px 0' }}>↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
