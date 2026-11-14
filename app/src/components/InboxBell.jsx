import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
const when = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
export default function InboxBell() {
  const [d, setD] = useState({ items: [], unread: 0 }); const [open, setOpen] = useState(false); const box = useRef(null); const nav = useNavigate();
  const load = () => api.get('/inbox').then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!open) return; const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); }; const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => { const n = !open; setOpen(n); if (n) load(); };
  const readAll = () => api.post('/inbox/read').then(() => setD((x) => ({ unread: 0, items: x.items.map((i) => ({ ...i, read: true })) })));
  const go = (i) => { setOpen(false); if (i.type === 'announcement') api.post(`/announcements/${i.id}/click`).catch(() => {}); if (!i.link) return; if (/^https?:/.test(i.link)) window.open(i.link, '_blank', 'noopener'); else nav(i.link); };
  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" aria-label={`Messages${d.unread ? `, ${d.unread} unread` : ''}`} aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {d.unread > 0 && <span className="bell-n">{d.unread > 9 ? '9+' : d.unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Messages">
          <div className="bell-head"><b>Messages</b>{d.unread > 0 && <button type="button" className="linkbtn" onClick={readAll}>Mark all read</button>}</div>
          {!d.items.length ? <p className="muted small bell-empty">Nothing here yet. Reminders and news from MockDesk will show up here.</p> : (
            <ul>{d.items.map((i) => <li key={i.key} className={i.read ? '' : 'unread'}><button type="button" onClick={() => go(i)}><b>{i.title}</b>{i.body && <span>{i.body}</span>}<small>{when(i.at)}{i.type === 'announcement' ? ' · announcement' : ''}</small></button></li>)}</ul>)}
          <div className="bell-foot"><Link to="/profile#notifications" onClick={() => setOpen(false)}>Notification settings</Link></div>
        </div>)}
    </div>
  );
}
