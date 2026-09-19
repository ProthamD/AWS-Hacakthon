import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Home, Settings, Mic, ImageIcon, User } from 'lucide-react';
import HomePage from './pages/HomePage';
import OnboardPage from './pages/OnboardPage';
import ChatPage from './pages/ChatPage';
import MemoriesAdminPage from './pages/MemoriesAdminPage';
import MemoryTheaterPage from './pages/MemoryTheaterPage';
import PatientPage from './pages/PatientPage';
import BystanderPage from './pages/BystanderPage';

export const API_BASE = import.meta.env.VITE_API_URL || 'https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/';
export const DEMO_CAREGIVER_ID = 'demo-caregiver-001';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/setup', icon: Settings, label: 'Setup' },
  { to: '/chat', icon: Mic, label: 'Talk' },
  { to: '/memories', icon: ImageIcon, label: 'Memories' },
];

function Dock() {
  return (
    <nav className="dock">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `dock-item${isActive ? ' active' : ''}`}
        >
          <item.icon size={16} strokeWidth={1.5} />
          <span className="dock-label">{item.label}</span>
        </NavLink>
      ))}
      <div className="dock-divider" />
      <NavLink
        to="/patient"
        className={({ isActive }) => `dock-item${isActive ? ' active' : ''}`}
        style={{ color: 'rgba(99,102,241,0.7)' }}
      >
        <User size={16} strokeWidth={1.5} />
        <span className="dock-label">Patient</span>
      </NavLink>
    </nav>
  );
}

function WordmarkBar() {
  return (
    <header
      className="font-ui"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 52,
        background: 'rgba(10,10,18,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span
        className="font-display"
        style={{ fontSize: 15, letterSpacing: '0.08em', color: '#fff', fontWeight: 400 }}
      >
        Sahay · <span style={{ fontFamily: "'Noto Sans Devanagari', serif" }}>सहाय</span>
      </span>
      <span
        style={{
          fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          border: '1px solid rgba(255,255,255,0.14)',
          padding: '3px 10px', borderRadius: 4,
          fontFamily: 'Manrope, sans-serif', fontWeight: 500,
        }}
      >
        AWS Hackathon 2026
      </span>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Full-screen, no chrome */}
        <Route path="/patient" element={<PatientPage />} />
        <Route path="/bystander/:patientId" element={<BystanderPage />} />
        <Route path="/memories/theater" element={<MemoryTheaterPage />} />

        {/* Main app with chrome */}
        <Route path="*" element={
          <>
            <WordmarkBar />
            <Dock />
            <main style={{ paddingTop: 52, paddingBottom: 110 }}>
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
