import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import ThemeToggle from './ThemeToggle.jsx';
export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link to="/" className="brand" aria-label="MockDesk home"><span className="brand-mark" aria-hidden="true">✓</span><span>MockDesk</span></Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/toolkit">Toolkit</NavLink>
          <NavLink to="/profile">Profile</NavLink>
        </nav>
        <div className="topbar-user">
          <ThemeToggle /><span className="who" title={user?.email}>{user?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
