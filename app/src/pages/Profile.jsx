import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { useTheme, savedChoice } from '../lib/theme.js';
import { ActivityMap } from '../components/Insights.jsx';
import { InviteCard, NotificationPrefs, MyBatches } from '../components/ProfileExtras.jsx';

const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const since = (iso) => { try { return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); } catch { return ''; } };
function streakOf(stamps) {
  const days = new Set((stamps || []).map(dayKey)); const p = new Date(); p.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(p))) p.setDate(p.getDate() - 1);
  let n = 0; while (days.has(dayKey(p))) { n++; p.setDate(p.getDate() - 1); } return n;
}
const LEVELS = [[0, 'Newcomer'], [1, 'Learner'], [3, 'Regular'], [5, 'Mock master']];
const levelOf = (n) => [...LEVELS].reverse().find(([k]) => n >= k)[1];

function badges(stats, mocksTotal, streak) {
  const done = stats?.completed || 0; const t = stats?.trend || [];
  const best = t.length ? Math.max(...t.map((x) => x.percentage)) : 0;
  const improved = t.length >= 2 && t.at(-1).percentage > t[0].percentage;
  return [
    { id: 'first', icon: '🚀', name: 'First step', hint: 'Finish your first mock', got: done >= 1 },
    { id: 'three', icon: '🔥', name: 'Hat-trick', hint: 'Finish 3 mocks', got: done >= 3 },
    { id: 'all', icon: '🏆', name: 'Full set', hint: `Finish all ${mocksTotal} mocks`, got: mocksTotal > 0 && done >= mocksTotal },
    { id: 'sharp', icon: '🎯', name: 'Sharpshooter', hint: 'Average accuracy of 75% or more', got: done >= 2 && (stats?.avgAccuracy || 0) >= 75 },
    { id: 'high', icon: '⭐', name: 'High scorer', hint: 'Score 70% or more in a mock', got: best >= 70 },
    { id: 'up', icon: '📈', name: 'On the rise', hint: 'Beat your first mock score', got: improved },
    { id: 'roll', icon: '⚡', name: 'On a roll', hint: 'Practise 3 days in a row', got: streak >= 3 },
    { id: 'week', icon: '🗓️', name: 'Week warrior', hint: 'Practise 7 days in a row', got: streak >= 7 },
  ];
}

const LOCAL_PREFIXES = ['mockdesk-saved-', 'mockdesk-notes-', 'mockdesk-plan-done'];
const localCount = () => { try { return Object.keys(localStorage).filter((k) => LOCAL_PREFIXES.some((p) => k.startsWith(p))).length; } catch { return 0; } };

export default function Profile() {
  const { user, updateProfile, logout, config } = useAuth();
  const [, , choose] = useTheme(); const [choice, setChoice] = useState(savedChoice);
  const [stats, setStats] = useState(null); const [mocks, setMocks] = useState([]);
  const [name, setName] = useState(user.name); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false); const [saved, setSaved] = useState(localCount);
  useEffect(() => { api.get('/stats').then(setStats).catch(() => setStats({ completed: 0, trend: [], activity: [] })); api.get('/mocks').then((r) => setMocks(r.mocks || [])).catch(() => {}); }, []);

  const streak = useMemo(() => streakOf(stats?.activity), [stats]);
  const list = useMemo(() => badges(stats, mocks.length || 5, streak), [stats, mocks, streak]);
  const earned = list.filter((b) => b.got).length;
  const done = stats?.completed || 0;
  const welcome = new URLSearchParams(window.location.search).get('welcome');
  const contact = user.email || user.phone;
  const dirty = name.trim() !== user.name;

  const save = async (e) => { e.preventDefault(); setErr(''); setMsg(''); setBusy(true); try { await updateProfile({ name }); setMsg('Saved'); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const pick = (c) => { setChoice(c); choose(c); };
  const download = async () => {
    try {
      const attempts = await api.get('/attempts'); const out = { exportedAt: new Date().toISOString(), account: { name: user.name, email: user.email, phone: user.phone }, summary: stats, attempts: [] };
      for (const a of (attempts.attempts || []).filter((x) => x.status === 'submitted')) { try { const r = await api.get(`/attempts/${a.id}/result`); out.attempts.push({ id: a.id, mock: r.attempt?.mockName, submittedAt: r.attempt?.submittedAt, summary: r.summary, sections: r.sections }); } catch { /* skip */ } }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'mockdesk-my-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (x) { setErr(x.message); }
  };
  const clearLocal = () => {
    if (!window.confirm('Remove all bookmarks, notes and study-plan ticks saved on this device? Your mock results are not affected.')) return;
    try { Object.keys(localStorage).filter((k) => LOCAL_PREFIXES.some((p) => k.startsWith(p))).forEach((k) => localStorage.removeItem(k)); } catch { /* blocked */ }
    setSaved(0); setCleared(true);
  };

  return (
    <div className="pf">
      {welcome && <div className="okmsg" role="status">Welcome to MockDesk! Add your name below, then start your first mock.</div>}

      <section className="pf-hero" aria-label="Profile summary">
        <div className="pf-avatar" aria-hidden="true">{initials(user.name)}</div>
        <div className="pf-id">
          <h1>{user.name}</h1>
          <p>{contact}{user.createdAt ? ` · Member since ${since(user.createdAt)}` : ''}</p>
          <span className="pf-level">{levelOf(done)}</span>
        </div>
        <Link to="/" className="pf-cta">{done ? 'Continue practising' : 'Take your first mock'} →</Link>
      </section>

      <section className="pf-stats" aria-label="Your numbers">
        <div><b>{done}<small>/{mocks.length || 5}</small></b><span>Mocks completed</span></div>
        <div><b>{stats?.bestScore ?? '–'}<small>{stats?.bestScore != null ? `/${config?.scoredMarks || 390}` : ''}</small></b><span>Best score</span></div>
        <div><b>{done ? `${Math.round(stats.avgAccuracy)}%` : '–'}</b><span>Average accuracy</span></div>
        <div><b>{streak}<small> day{streak === 1 ? '' : 's'}</small></b><span>Practice streak</span></div>
      </section>

      <div className="pf-grid">
        <section className="card pf-wide">
          <div className="pf-head"><h2>Achievements</h2><span className="pf-count">{earned} of {list.length} earned</span></div>
          <ul className="pf-badges">
            {list.map((b) => (
              <li key={b.id} className={b.got ? 'got' : ''}>
                <span className="pf-ico" aria-hidden="true">{b.icon}</span>
                <b>{b.name}</b><small>{b.got ? 'Earned' : b.hint}</small>
                <span className="sr-only">{b.got ? 'Earned' : 'Locked'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card pf-wide">
          <div className="pf-head"><h2>Practice activity</h2><span className="pf-count">Last 15 weeks</span></div>
          <ActivityMap stamps={stats?.activity || []} bare />
        </section>

        <section className="card">
          <h2>Account</h2>
          <form className="form" onSubmit={save}>
            {err && <div className="alert" role="alert">{err}</div>}{msg && <div className="okmsg" role="status">{msg}</div>}
            <label>Name<input value={name} onChange={(e) => { setName(e.target.value); setMsg(''); }} required maxLength={80} autoComplete="name" /></label>
            {user.email && <label>Email<input value={user.email} disabled /></label>}
            {user.phone && <label>Mobile<input value={user.phone} disabled /></label>}
            <button className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
          </form>
        </section>

        <section className="card">
          <h2>Appearance</h2>
          <p className="muted pf-note">Choose how MockDesk looks. “Device” follows your phone or laptop setting.</p>
          <div className="theme-seg wide" role="radiogroup" aria-label="Theme">
            {[['light', '☀ Light'], ['dark', '☾ Dark'], ['system', '🖥 Device']].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={choice === k} className={choice === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>
            ))}
          </div>

          <h2 className="pf-sub">Your data</h2>
          <p className="muted pf-note">Download every result as a file, or clear the bookmarks, notes and study-plan ticks stored on this device.</p>
          <div className="pf-actions">
            <button type="button" className="btn btn-ghost" onClick={download} disabled={!done}>Download my results</button>
            <button type="button" className="btn btn-ghost" onClick={clearLocal} disabled={!saved}>Clear saved notes ({saved})</button>
          </div>
          {cleared && <p className="okmsg" role="status">Cleared from this device.</p>}
        </section>

        <InviteCard />
        <NotificationPrefs />
        <MyBatches />
        <section className="card pf-wide pf-out">
          <div><h2>Sign out</h2><p className="muted pf-note">You’ll need your password or a one-time code to come back. Mocks in progress are kept.</p></div>
          <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
        </section>
      </div>
    </div>
  );
}
