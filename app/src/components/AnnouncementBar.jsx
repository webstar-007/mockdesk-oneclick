import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
/** Messages posted from the admin dashboard. A student can dismiss one; it stays hidden for that browser session. */
export default function AnnouncementBar() {
  const [list, setList] = useState([]);
  const seen = () => { try { return JSON.parse(sessionStorage.getItem('mockdesk-ann') || '[]'); } catch { return []; } };
  const [hidden, setHidden] = useState(seen);
  useEffect(() => { api.get('/announcements').then((d) => setList(d.announcements || [])).catch(() => {}); }, []);
  const show = list.filter((a) => !hidden.includes(a.id));
  if (!show.length) return null;
  const close = (id) => { const n = [...hidden, id]; setHidden(n); try { sessionStorage.setItem('mockdesk-ann', JSON.stringify(n)); } catch { /* blocked */ } };
  return <div className="ann-wrap" aria-label="Announcements">{show.map((a) => <div key={a.id} className={`ann ann-${a.level}`} role="status"><span aria-hidden="true">{a.level === 'warn' ? '⚠' : a.level === 'good' ? '✓' : '📢'}</span><p>{a.text}</p><button type="button" aria-label="Dismiss announcement" onClick={() => close(a.id)}>×</button></div>)}</div>;
}
