import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Home, Settings, Mic, ImageIcon, User } from 'lucide-react';
import HomePage from './pages/HomePage';
import OnboardPage from './pages/OnboardPage';
import ChatPage from './pages/ChatPage';
import MemoriesAdminPage from './pages/MemoriesAdminPage';
import MemoryTheaterPage from './pages/MemoryTheaterPage';
import PatientPage from './pages/PatientPage';
import BystanderPage from './pages/BystanderPage';

export const API_BASE = import.meta.env.VITE_API_URL || 'https://rls7o3d7d8.execute-api.ap-south-1.amazonaws.com/prod';
export const DEMO_CAREGIVER_ID = 'demo-caregiver-001';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/setup', icon: Settings, label: 'Setup' },
  { to: '/chat', icon: Mic, label: 'Talk' },
  { to: '/memories', icon: ImageIcon, label: 'Memories' },
];

function Dock() {
  return (
    <nav className="dock" role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `dock-item${isActive ? ' active' : ''}`}
          aria-label={item.label}
        >
          <item.icon size={17} strokeWidth={1.6} />
          <span className="dock-label">{item.label}</span>
        </NavLink>
      ))}
      <div className="dock-divider" aria-hidden="true" />
      <NavLink
        to="/patient"
        className={({ isActive }) => `dock-item dock-patient-item${isActive ? ' active' : ''}`}
        aria-label="Patient Mode"
        title="Open Patient Mode"
      >
        <User size={17} strokeWidth={1.6} />
        <span className="dock-label">Patient</span>
      </NavLink>
    </nav>
  );
}

function WordmarkBar() {
  return (
    <header className="wordmark-bar">
      {/* Logo + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Glyph mark */}
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg, #7c6ffa 0%, #9b8ffc 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(124,111,250,0.4)',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="2.5" fill="white" opacity="0.9" />
            <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>
        <span
          className="font-display"
          style={{ fontSize: 15, letterSpacing: '0.04em', color: 'var(--c-text-1)', fontWeight: 400 }}
        >
          Sahay{' '}
          <span style={{ color: 'var(--c-text-3)', fontSize: 13 }}>·</span>{' '}
          <span style={{ fontFamily: "'Noto Sans Devanagari', serif", color: 'var(--c-text-2)', fontSize: 14 }}>सहाय</span>
        </span>
      </div>

      {/* Hackathon badge */}
      <span className="badge badge-accent hide-mobile" style={{ fontSize: 10 }}>
        AWS Hackathon 2026
      </span>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Full-screen pages — no chrome */}
        <Route path="/patient" element={<PatientPage />} />
        <Route path="/bystander/:patientId" element={<BystanderPage />} />
        <Route path="/memories/theater" element={<MemoryTheaterPage />} />

        {/* Main app with chrome */}
        <Route path="*" element={
          <>
            <WordmarkBar />
            <Dock />
            <main style={{ paddingTop: 54, paddingBottom: 108, position: 'relative', zIndex: 1 }}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/setup" element={<OnboardPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/memories" element={<MemoriesAdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </>
        } />
      </Routes>
    </BrowserRouter>
  );
}
