import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
const ICON = { warn: '⚠', urgent: '❗', good: '✓', info: 'ℹ' };
/** Messages from the admin console. Each one follows its audience, schedule and dismissible setting; opens and clicks are counted. */
export default function AnnouncementBar() {
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/announcements').then((d) => setList(d.announcements || [])).catch(() => {}); }, []);
  const close = (a) => { setList((l) => l.filter((x) => x.id !== a.id)); api.post(`/announcements/${a.id}/dismiss`).catch(() => {}); };
  const click = (a) => api.post(`/announcements/${a.id}/click`).catch(() => {});
  if (!list.length) return null;
  const cta = (a) => (/^https?:/.test(a.linkUrl) ? <a className="ann-cta" href={a.linkUrl} target="_blank" rel="noopener noreferrer" onClick={() => click(a)}>{a.linkLabel || 'Open'}</a> : <Link className="ann-cta" to={a.linkUrl} onClick={() => click(a)}>{a.linkLabel || 'Open'}</Link>);
  return <div className="ann-wrap" aria-label="Announcements">{list.map((a) => (
    <div key={a.id} className={`ann ann-${a.level}`} role={a.level === 'urgent' ? 'alert' : 'status'}>
      <span aria-hidden="true">{ICON[a.level] || 'ℹ'}</span>
      <p>{a.title && <b>{a.title} </b>}{a.text}</p>
      {a.linkUrl && cta(a)}
      {a.dismissible && <button type="button" aria-label="Dismiss announcement" onClick={() => close(a)}>×</button>}
    </div>))}</div>;
}
