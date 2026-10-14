import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, auth } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Registrations from './pages/Registrations.jsx';

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(!!auth.token);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.token) return;
    api
      .me()
      .then((r) => setAdmin(r.admin))
      .catch(() => auth.clear())
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onLogout = () => {
      setAdmin(null);
      navigate('/login');
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [navigate]);

  if (checking) return <div className="center-screen">Loading…</div>;

  if (!admin) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <Login
              onLogin={(a) => {
                setAdmin(a);
                navigate('/');
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const logout = () => {
    auth.clear();
    setAdmin(null);
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFC83D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5l8 5 8-5v14" /></svg>
          </span>
          <span>Admin</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/registrations">Registrations</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{admin.name}</strong>
            <span>{admin.email}</span>
          </div>
          <button type="button" className="btn btn-ghost-light" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registrations" element={<Registrations />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
