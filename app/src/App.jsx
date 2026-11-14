import { lazy, Suspense } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import Header from './components/Header.jsx';
import TipLayer from './components/Tip.jsx';
import AnnouncementBar from './components/AnnouncementBar.jsx';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Instructions = lazy(() => import('./pages/Instructions.jsx'));
const ExamPage = lazy(() => import('./pages/ExamPage.jsx'));
const ResultPage = lazy(() => import('./pages/ResultPage.jsx'));
const ReviewPage = lazy(() => import('./pages/ReviewPage.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Toolkit = lazy(() => import('./pages/Toolkit.jsx'));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function Guard() {
  const { user } = useAuth(); const loc = useLocation();
  if (user === undefined) return <div className="center-page" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if ((user.role === 'admin' || user.role === 'editor') && !loc.pathname.startsWith('/admin')) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
const Shell = ({ children }) => (<><a className="skip" href="#main">Skip to content</a><Header /><AnnouncementBar /><div className="shell" id="main">{children ?? <Outlet />}<footer className="site-foot"><span><b>MockDesk</b> · Online mock tests for government exams</span><span><Link to="/">Dashboard</Link><Link to="/profile">Profile</Link></span></footer></div></>);

// "/" is public: visitors see the landing page, signed-in students see their dashboard.
function Root() {
  const { user } = useAuth();
  if (user === undefined) return <div className="center-page" role="status">Loading…</div>;
  if (!user) return <Landing />;
  if (user.role === 'admin' || user.role === 'editor') return <Navigate to="/admin" replace />;
  return <Shell><Dashboard /></Shell>;
}

export default function App() {
  return (
    <AuthProvider>
      <TipLayer />
      <Suspense fallback={<div className="center-page" role="status">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<Guard />}>
            <Route path="/exam/:attemptId" element={<ExamPage />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route element={<Shell />}>
              <Route path="/profile" element={<Profile />} />
              <Route path="/toolkit" element={<Toolkit />} />
              <Route path="/mock/:mockId" element={<Instructions />} />
              <Route path="/results/:attemptId" element={<ResultPage />} />
              <Route path="/review/:attemptId" element={<ReviewPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
