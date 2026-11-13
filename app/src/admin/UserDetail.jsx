import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, Dialog, Empty, Err, Loading, PageHead, Stat, ago, dt, mmss, statusTone, toast, useLoad } from './ui.jsx';
import { tip } from '../components/Tip.jsx';

function Trend({ trend }) {
  if (!trend.length) return <Empty>No finished tests yet.</Empty>;
  const W = 520, H = 160, L = 30, T = 10, B = 24, n = trend.length; const x = (i) => (n === 1 ? W / 2 : L + (i * (W - L - 12)) / (n - 1)); const y = (v) => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);
  const line = trend.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.pct)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Score percentage per attempt">{[0, 50, 100].map((g) => <g key={g}><line x1={L} x2={W - 8} y1={y(g)} y2={y(g)} stroke="var(--line)" /><text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{g}</text></g>)}<path d={line} fill="none" stroke="var(--brand-2)" strokeWidth="3" />{trend.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.pct)} r="6" fill="var(--brand-2)" tabIndex={0} {...tip({ t: p.mockName, v: `${p.score} marks`, rows: [['Score', `${p.pct}%`]] })} />)}</svg>;
}
export default function UserDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { data: d, err, loading, reload } = useLoad(`/admin/users/${id}`, [id]);
  const [dlg, setDlg] = useState(null); const [nr, setNr] = useState('editor'); const [busy, setBusy] = useState(false); const [e2, setE2] = useState(''); const [pw, setPw] = useState('');
  if (loading && !d) return <Loading />; if (err) return <Err>{err}</Err>;
  const u = d.user; const key = u.email || u.phone; const s = d.summary;
  const run = async (fn, ok, close = true) => { setBusy(true); setE2(''); try { await fn(); toast(ok); if (close) setDlg(null); reload(); } catch (x) { setE2(x.message); } finally { setBusy(false); } };
  return (
    <>
      <PageHead title={u.name} sub={`${key} · joined ${dt(Date.parse(u.createdAt))}`}>
        <Badge tone={statusTone[u.role]}>{u.role}</Badge><Badge tone={statusTone[u.status]}>{u.status}</Badge>
        <button className="btn btn-ghost" onClick={() => setDlg('rename')}>Rename</button>
        <button className="btn btn-ghost" onClick={() => setDlg(u.status === 'suspended' ? 'react' : 'suspend')}>{u.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
      </PageHead>
      <div className="ad-grid g4">
        <Stat icon="✎" label="Tests finished" value={s.completed} sub={`${s.started} started`} /><Stat icon="🏆" tone="good" label="Best score" value={s.best ?? '–'} /><Stat icon="🎯" label="Average score" value={s.completed ? `${s.avgPct}%` : '–'} /><Stat icon="🎚" label="Average accuracy" value={s.completed ? `${s.avgAccuracy}%` : '–'} sub={`${d.activeSessions} active session${d.activeSessions === 1 ? '' : 's'} · seen ${ago(u.lastSeen)}`} />
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Score trend</h3><Trend trend={d.trend} /></section>
        <section className="card"><h3>Section strengths</h3>{d.sections.length ? <div className="ad-sec-bars">{d.sections.map((x) => <div key={x.key} {...tip({ t: x.short, v: `${x.avgPct}% of marks`, tone: x.avgPct >= 60 ? 'good' : x.avgPct >= 35 ? 'warn' : 'bad', rows: [['Accuracy', `${x.avgAccuracy}%`]] })} tabIndex={0}><b>{x.short}</b><span className="ad-prog"><i style={{ width: `${x.avgPct}%` }} /></span><span>{x.avgPct}%</span></div>)}</div> : <Empty>Nothing to show yet.</Empty>}</section>
      </div>
      <div className="ad-grid g2" style={{ marginTop: 14 }}>
        <section className="card"><h3>Weakest topics</h3>{d.weakTopics.length ? <ul className="plain" style={{ margin: 0, paddingLeft: 18 }}>{d.weakTopics.map((t) => <li key={t.topic + t.section}>{t.topic} <Badge tone="bad">{t.accuracy}%</Badge> <small className="muted">{t.correct}/{t.total}</small></li>)}</ul> : <p className="muted">Needs at least 3 questions per topic.</p>}</section>
        <section className="card"><h3>Strongest topics</h3>{d.strongTopics.length ? <ul className="plain" style={{ margin: 0, paddingLeft: 18 }}>{d.strongTopics.map((t) => <li key={t.topic + t.section}>{t.topic} <Badge tone="good">{t.accuracy}%</Badge> <small className="muted">{t.correct}/{t.total}</small></li>)}</ul> : <p className="muted">Needs at least 3 questions per topic.</p>}</section>
      </div>
      <h2>Attempts</h2>
      <div className="card nopad">{d.attempts.length ? <div style={{ overflowX: 'auto' }}><table className="ad-table"><thead><tr><th>Mock</th><th>Status</th><th>Started</th><th className="num">Score</th><th className="num">Accuracy</th><th>Time</th><th /></tr></thead>
        <tbody>{d.attempts.map((a) => <tr key={a.id}><td><b>{a.mockName}</b></td><td><Badge tone={statusTone[a.status]}>{a.status === 'in_progress' ? 'in progress' : a.status}</Badge>{a.auto && <Badge tone="warn">auto</Badge>}</td><td>{dt(a.startedAt)}</td><td className="num">{a.score == null ? '–' : `${a.score}/${a.max}`}</td><td className="num">{a.accuracy == null ? '–' : `${a.accuracy}%`}</td><td>{mmss(a.timeSec)}</td><td><Link to={`/admin/attempts/${a.id}`}>Open</Link></td></tr>)}</tbody></table></div> : <Empty>This user has not started any test.</Empty>}</div>
      <NoteCard id={id} note={u.note} onSaved={reload} />
      <h2>Account actions</h2>
      <section className="card ad-pill-row" style={{ alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={() => setDlg('signout')}>Sign out everywhere</button><button className="btn btn-ghost" onClick={() => setDlg('password')}>Set new password</button>
        <button className="btn btn-ghost" onClick={() => setDlg('role')}>Change role ({u.role})</button><button className="btn btn-ghost dng" onClick={() => setDlg('delete')}>Delete user and data</button>
      </section>
      {dlg === 'rename' && <RenameDlg name={u.name} onClose={() => setDlg(null)} onSave={(name) => run(() => api.patch(`/admin/users/${id}`, { name }), 'Name updated')} busy={busy} error={e2} />}
      {dlg === 'suspend' && <ConfirmModal title="Suspend this user?" label="Suspend" danger busy={busy} error={e2} onClose={() => setDlg(null)} onConfirm={() => run(() => api.patch(`/admin/users/${id}`, { status: 'suspended' }), 'User suspended')}><p>{u.name} will be signed out and unable to log in until you reactivate the account. Their data is kept.</p></ConfirmModal>}
      {dlg === 'react' && <ConfirmModal title="Reactivate this user?" label="Reactivate" busy={busy} error={e2} onClose={() => setDlg(null)} onConfirm={() => run(() => api.patch(`/admin/users/${id}`, { status: 'active' }), 'User reactivated')}><p>{u.name} will be able to sign in again.</p></ConfirmModal>}
      {dlg === 'signout' && <ConfirmModal title="Sign out everywhere?" label="Sign out" busy={busy} error={e2} onClose={() => setDlg(null)} onConfirm={() => run(() => api.post(`/admin/users/${id}/signout`), 'Signed out')}><p>All {u.name}’s active sessions end immediately.</p></ConfirmModal>}
      {dlg === 'role' && <ConfirmModal title="Change role" word={key} label="Change role" danger busy={busy} error={e2} onClose={() => setDlg(null)} onConfirm={(c) => run(() => api.patch(`/admin/users/${id}`, { role: nr, confirm: c }), 'Role updated')}>
        <label className="ad-field">New role<select value={nr} onChange={(e) => setNr(e.target.value)}><option value="student">Student: takes tests only</option><option value="editor">Editor: manages mocks and questions, no student data</option><option value="admin">Admin: full access</option></select></label>
        <p className="small muted">Admins and editors use the admin console only and cannot take tests. Change the role back to Student to let this person take tests.</p></ConfirmModal>}
      {dlg === 'delete' && <ConfirmModal title="Delete this user?" word={key} label="Delete forever" danger busy={busy} error={e2} onClose={() => setDlg(null)} onConfirm={(c) => run(async () => { await api.del(`/admin/users/${id}`, { confirm: c }); nav('/admin/users'); }, 'User deleted', false)}><p>This permanently removes the account, all attempts and reports. It cannot be undone.</p></ConfirmModal>}
      {dlg === 'password' && <Dialog title="Set a new password" onClose={() => setDlg(null)}><label className="ad-field">New password (8+ characters)<input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label><p className="small muted">The user is signed out everywhere. Share the new password with them securely.</p><Err>{e2}</Err><div className="modal-act"><button className="btn btn-ghost" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || pw.length < 8} onClick={() => run(() => api.post(`/admin/users/${id}/password`, { password: pw }), 'Password updated')}>Save password</button></div></Dialog>}
    </>
  );
}
function NoteCard({ id, note, onSaved }) {
  const [v, setV] = useState(note || ''); const [busy, setBusy] = useState(false);
  return <><h2>Private admin note</h2><section className="card"><textarea rows={3} maxLength={600} value={v} onChange={(e) => setV(e.target.value)} placeholder="Only admins see this. e.g. Paid for coaching batch, asked for a mock reset." aria-label="Admin note" /><p style={{ margin: '8px 0 0' }}><button className="btn btn-ghost btn-sm" disabled={busy || v === (note || '')} onClick={async () => { setBusy(true); try { await api.patch(`/admin/users/${id}`, { note: v }); toast('Note saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } }}>Save note</button></p></section></>;
}
function RenameDlg({ name, onSave, onClose, busy, error }) {
  const [v, setV] = useState(name);
  return <Dialog title="Rename user" onClose={onClose}><label className="ad-field">Name<input value={v} onChange={(e) => setV(e.target.value)} autoFocus maxLength={80} /></label><Err>{error}</Err><div className="modal-act"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !v.trim()} onClick={() => onSave(v)}>Save</button></div></Dialog>;
}
