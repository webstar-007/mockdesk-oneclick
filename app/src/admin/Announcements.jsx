import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Dialog, Empty, Err, Loading, PageHead, Stat, dt, toast, useLoad } from './ui.jsx';

const LEVELS = [['info', 'Information'], ['good', 'Good news'], ['warn', 'Warning'], ['urgent', 'Urgent']];
const ICON = { warn: '⚠', urgent: '❗', good: '✓', info: 'ℹ' };
const TONE = { live: 'good', scheduled: 'brand', draft: 'mute', ended: 'warn' };
const local = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v).getTime() : null);
const blank = { title: '', text: '', level: 'info', audience: 'all', batchId: '', linkUrl: '', linkLabel: 'Open', startsAt: '', endsAt: '', pinned: false, dismissible: true, notify: [], active: true };

function Editor({ meta, item, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...blank, ...item, batchId: item.batchId || '', startsAt: local(item.startsAt), endsAt: local(item.endsAt) } : blank); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [count, setCount] = useState(null);
  const up = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const loadCount = (aud, bid) => api.get(`/admin/announcements/audience?audience=${aud}&batchId=${bid || ''}`).then((r) => setCount(r.count)).catch(() => setCount(null));
  useEffect(() => { loadCount(f.audience, f.batchId); }, []); // eslint-disable-line
  const toggle = (k) => up('notify', f.notify.includes(k) ? f.notify.filter((x) => x !== k) : [...f.notify, k]);
  const save = async (active) => {
    setBusy(true); setErr('');
    try {
      const body = { ...f, active, batchId: f.audience === 'batch' ? Number(f.batchId) || null : null, startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt) };
      const r = item ? await api.patch(`/admin/announcements/${item.id}`, body) : await api.post('/admin/announcements', body);
      toast(active ? (f.startsAt && fromLocal(f.startsAt) > Date.now() ? 'Scheduled' : item ? 'Saved' : 'Published') : 'Saved as draft'); onSaved(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const sent = item?.broadcastAt;
  return (
    <Dialog title={item ? 'Edit announcement' : 'New announcement'} onClose={onClose} wide>
      <div className="ann-ed">
        <div className="ann-form">
          <label className="ad-field">Title <small>Optional</small><input value={f.title} maxLength={80} onChange={(e) => up('title', e.target.value)} placeholder="Mock 6 is live" /></label>
          <label className="ad-field">Message<textarea rows={3} maxLength={400} value={f.text} onChange={(e) => up('text', e.target.value)} placeholder="Tonight at 9 PM. Good luck!" /><small>{f.text.length}/400</small></label>
          <div className="ad-field">Style<div className="ad-pill-row">{LEVELS.map(([k, n]) => <button type="button" key={k} className={`ad-pill ${f.level === k ? 'on' : ''}`} onClick={() => up('level', k)}>{n}</button>)}</div></div>
          <div className="ad-row">
            <label className="ad-field">Who sees it<select value={f.audience} onChange={(e) => { up('audience', e.target.value); loadCount(e.target.value, f.batchId); }}>{meta.audiences.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
            {f.audience === 'batch' && <label className="ad-field">Batch<select value={f.batchId} onChange={(e) => { up('batchId', e.target.value); loadCount('batch', e.target.value); }}><option value="">Choose…</option>{meta.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
          </div>
          {count != null && <p className="small muted">About {count} student{count === 1 ? '' : 's'} match this audience now.</p>}
          <div className="ad-row">
            <label className="ad-field">Button link <small>Optional. A page such as /profile or a full https:// address</small><input value={f.linkUrl} onChange={(e) => up('linkUrl', e.target.value)} placeholder="/profile#invite" /></label>
            <label className="ad-field">Button text<input value={f.linkLabel} maxLength={30} onChange={(e) => up('linkLabel', e.target.value)} disabled={!f.linkUrl} /></label>
          </div>
          <div className="ad-row">
            <label className="ad-field">Show from <small>Leave empty to start now</small><input type="datetime-local" value={f.startsAt} onChange={(e) => up('startsAt', e.target.value)} /></label>
            <label className="ad-field">Hide after <small>Leave empty to keep it up</small><input type="datetime-local" value={f.endsAt} onChange={(e) => up('endsAt', e.target.value)} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => up('pinned', e.target.checked)} /><span>Pin to the top</span></label>
          <label className="check"><input type="checkbox" checked={f.dismissible} onChange={(e) => up('dismissible', e.target.checked)} /><span>Students can close it</span></label>
          <div className="ad-field">Also send as a notification {sent && <small>Already sent {dt(sent)}</small>}
            <div className="ad-pill-row"><button type="button" disabled={!!sent} className={`ad-pill ${f.notify.includes('push') ? 'on' : ''}`} onClick={() => toggle('push')}>Push{!meta.pushReady ? ' (not set up)' : ''}</button><button type="button" disabled={!!sent} className={`ad-pill ${f.notify.includes('email') ? 'on' : ''}`} onClick={() => toggle('email')}>Email{!meta.emailReady ? ' (not set up)' : ''}</button></div>
            <small>Sent once, when the announcement goes live. Email costs about $0.10 per 1,000 messages. Students who turned it off are skipped.</small></div>
        </div>
        <div className="ann-prev" aria-label="Preview"><b className="small muted">Preview</b>
          <div className={`ann ann-${f.level}`}><span aria-hidden="true">{ICON[f.level]}</span><p>{f.title && <b>{f.title} </b>}{f.text || 'Your message appears here.'}</p>{f.linkUrl && <span className="ann-cta">{f.linkLabel || 'Open'}</span>}{f.dismissible && <button type="button" tabIndex={-1} aria-hidden="true">×</button>}</div></div>
      </div>
      <Err>{err}</Err>
      <div className="ad-modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-ghost" disabled={busy || !f.text.trim()} onClick={() => save(false)}>Save as draft</button><button className="btn btn-primary" disabled={busy || !f.text.trim() || (f.audience === 'batch' && !f.batchId)} onClick={() => save(true)}>{f.startsAt && fromLocal(f.startsAt) > Date.now() ? 'Schedule' : 'Publish'}</button></div>
    </Dialog>
  );
}

export default function Announcements() {
  const { data, err, loading, reload } = useLoad('/admin/announcements'); const [edit, setEdit] = useState(null); const [filter, setFilter] = useState('all');
  if (loading && !data) return <Loading />;
  const list = (data?.announcements || []).filter((a) => filter === 'all' || a.status === filter);
  const act = async (fn, ok) => { try { await fn(); toast(ok); reload(); } catch (e) { toast(e.message, 'bad'); } };
  const live = (data?.announcements || []).filter((a) => a.status === 'live').length;
  return (
    <>
      <PageHead title="Announcements" sub="Banners and messages for students. Target a group, schedule them and see who read them."><button className="btn btn-primary" onClick={() => setEdit({})}>＋ New announcement</button></PageHead>
      <Err>{err}</Err>
      <div className="ad-grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Live now" value={live} icon="📢" /><Stat label="Scheduled" value={(data?.announcements || []).filter((a) => a.status === 'scheduled').length} icon="🕒" /><Stat label="Drafts" value={(data?.announcements || []).filter((a) => a.status === 'draft').length} icon="✎" /><Stat label="Ended" value={(data?.announcements || []).filter((a) => a.status === 'ended').length} icon="✔" />
      </div>
      <div className="ad-pill-row" style={{ marginBottom: 14 }}>{[['all', 'All'], ['live', 'Live'], ['scheduled', 'Scheduled'], ['draft', 'Drafts'], ['ended', 'Ended']].map(([k, n]) => <button key={k} className={`ad-pill ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{n}</button>)}</div>
      {!list.length ? <div className="card"><Empty>Nothing here. Create an announcement to get started.</Empty></div> : (
        <div className="ann-list">{list.map((a) => (
          <article className="card ann-item" key={a.id}>
            <div className="ann-item-top"><Badge tone={TONE[a.status]}>{a.status}</Badge>{a.pinned && <Badge tone="brand">pinned</Badge>}<Badge tone="mute">{a.audience === 'batch' ? `batch: ${a.batchName || ''}` : a.audience}</Badge>{a.notify.length > 0 && <Badge tone="mute">{a.broadcastAt ? 'sent as ' : 'will send as '}{a.notify.join(' + ')}</Badge>}</div>
            <div className={`ann ann-${a.level}`}><span aria-hidden="true">{ICON[a.level]}</span><p>{a.title && <b>{a.title} </b>}{a.text}</p>{a.linkUrl && <span className="ann-cta">{a.linkLabel}</span>}</div>
            <p className="small muted">{a.startsAt ? `From ${dt(a.startsAt)}` : `Created ${dt(a.createdAt)}`}{a.endsAt ? ` · until ${dt(a.endsAt)}` : ''}{a.createdBy ? ` · by ${a.createdBy}` : ''}</p>
            <p className="small"><b>{a.stats.seen}</b> saw it · <b>{a.stats.clicked}</b> clicked · <b>{a.stats.dismissed}</b> closed{a.reach != null && <span className="muted"> · reaches about {a.reach}</span>}</p>
            <div className="ad-pill-row">
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(a)}>Edit</button>
              {a.status === 'live' && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.post(`/admin/announcements/${a.id}/end`), 'Ended')}>End now</button>}
              {a.status === 'draft' && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`/admin/announcements/${a.id}`, { active: true }), 'Published')}>Publish</button>}
              {(a.status === 'scheduled') && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`/admin/announcements/${a.id}`, { active: false }), 'Moved to drafts')}>Unschedule</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.post(`/admin/announcements/${a.id}/duplicate`), 'Copied to drafts')}>Duplicate</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Delete this announcement and its statistics?')) act(() => api.del(`/admin/announcements/${a.id}`), 'Deleted'); }}>Delete</button>
            </div>
          </article>))}</div>)}
      {edit && <Editor meta={data} item={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
