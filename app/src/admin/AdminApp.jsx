import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { ToastHost, Loading } from './ui.jsx';

const Overview = lazy(() => import('./Overview.jsx'));
const Users = lazy(() => import('./Users.jsx'));
const UserDetail = lazy(() => import('./UserDetail.jsx'));
const Attempts = lazy(() => import('./Attempts.jsx'));
const AttemptDetail = lazy(() => import('./AttemptDetail.jsx'));
const Mocks = lazy(() => import('./Mocks.jsx'));
const MockEditor = lazy(() => import('./MockEditor.jsx'));
const Bank = lazy(() => import('./Bank.jsx'));
const Analytics = lazy(() => import('./Analytics.jsx'));
const Reports = lazy(() => import('./Reports.jsx'));
const Settings = lazy(() => import('./Settings.jsx'));
const Live = lazy(() => import('./Live.jsx'));
const Ask = lazy(() => import('./Ask.jsx'));
const Integrity = lazy(() => import('./Integrity.jsx'));
const Coverage = lazy(() => import('./Coverage.jsx'));
const System = lazy(() => import('./System.jsx'));
const Preview = lazy(() => import('./Preview.jsx'));
const Announcements = lazy(() => import('./Announcements.jsx'));
const Notifications = lazy(() => import('./Notifications.jsx'));
const Quality = lazy(() => import('./Quality.jsx'));
const Referrals = lazy(() => import('./Referrals.jsx'));
const BatchList = lazy(() => import('./Batches.jsx').then((m) => ({ default: m.BatchList })));
const BatchDetail = lazy(() => import('./Batches.jsx').then((m) => ({ default: m.BatchDetail })));
import Search from './Search.jsx';

const NAV = [
  ['', 'Overview', '▦', true], ['ask', 'Ask your data', '💬'], ['live', 'Live tests', '🟢'], ['users', 'Users', '👥'], ['attempts', 'Attempts', '✎'], ['integrity', 'Integrity', '🛡'],
  ['mocks', 'Mocks', '🗂'], ['bank', 'Question bank', '❓'], ['quality', 'Question quality', '✅'], ['coverage', 'Coverage', '🧭'], ['batches', 'Batches', '🏫'], ['announcements', 'Announcements', '📢'], ['notifications', 'Notifications', '🔔'], ['referrals', 'Referrals', '🎁'], ['analytics', 'Analytics', '📈'], ['reports', 'Reports', '🚩'], ['system', 'System', '🩺'], ['settings', 'Settings', '⚙'],
];
// Editors only get the content tools.
const EDITOR_NAV = ['mocks', 'bank', 'quality', 'coverage', 'reports'];

export default function AdminApp() {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(0); const [find, setFind] = useState(false);
  useEffect(() => { const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setFind(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { if (user?.role === 'admin' || user?.role === 'editor') { const f = () => api.get('/admin/reports?status=open').then((d) => setOpen(d.open ?? d.reports?.length ?? 0)).catch(() => {}); f(); window.addEventListener('ad-reports', f); const t = setInterval(f, 60000); return () => { window.removeEventListener('ad-reports', f); clearInterval(t); }; } }, [user]);
  const editor = user?.role === 'editor';
  if (user?.role !== 'admin' && !editor) return <Navigate to="/" replace />;
  const nav = editor ? NAV.filter((n) => EDITOR_NAV.includes(n[0])) : NAV;
  return (
    <div className="ad">
      <aside className="ad-side">
        <Link to="/admin" className="ad-brand"><span className="brand-mark" aria-hidden="true">✓</span><span>MockDesk<small>{editor ? 'Editor' : 'Admin'}</small></span></Link>
        <nav className="ad-nav" aria-label="Admin">
          {nav.map(([to, label, ico, end]) => <NavLink key={to} to={`/admin${to ? '/' + to : ''}`} end={!!end}><span className="ico" aria-hidden="true">{ico}</span>{label}{to === 'reports' && open > 0 && <span className="cnt">{open}</span>}</NavLink>)}
        </nav>
        <div className="ad-side-foot"><span>Signed in as <b>{user.name}</b><br /><small>{user.email}</small></span><button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)', background: 'transparent' }}>Sign out</button></div>
      </aside>
      <main className="ad-main" id="main">
        <div className="ad-top"><button className="ad-find" onClick={() => setFind(true)} aria-label="Search everything"><span aria-hidden="true">🔍</span><span className="ad-find-t">Search users, mocks, questions…</span><kbd>Ctrl K</kbd></button><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><ThemeToggle /><button className="btn btn-ghost btn-sm ad-out" onClick={logout}>Sign out</button></span></div>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={editor ? <Navigate to="/admin/mocks" replace /> : <Overview />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="attempts" element={<Attempts />} />
            <Route path="attempts/:id" element={<AttemptDetail />} />
            <Route path="mocks" element={<Mocks />} />
            <Route path="mocks/:id" element={<MockEditor />} />
            <Route path="mocks/:id/preview" element={<Preview />} />
            <Route path="live" element={<Live />} />
            <Route path="ask" element={<Ask />} />
            <Route path="integrity" element={<Integrity />} />
            <Route path="coverage" element={<Coverage />} />
            <Route path="system" element={<System />} />
            <Route path="bank" element={<Bank />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="reports" element={<Reports />} />
            <Route path="quality" element={<Quality />} />
            <Route path="batches" element={<BatchList />} />
            <Route path="batches/:id" element={<BatchDetail />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Suspense>
      </main>
      {find && <Search onClose={() => setFind(false)} />}
      <ToastHost />
    </div>
  );
}
