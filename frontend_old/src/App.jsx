import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import OnboardPage from './pages/OnboardPage';
import ChatPage from './pages/ChatPage';
import RoutePage from './pages/RoutePage';
import BystanderPage from './pages/BystanderPage';
import SimulatePage from './pages/SimulatePage';
import PatientPage from './pages/PatientPage';
import MemoriesAdminPage from './pages/MemoriesAdminPage';
import MemoryTheaterPage from './pages/MemoryTheaterPage';
import { ToastProvider } from './components/Toast';
import './index.css';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const DEMO_CAREGIVER_ID = 'demo-caregiver-001';
export const DEMO_PATIENT_ID = 'demo-patient-001';

const DOCK_ITEMS = [
  { to: '/', icon: '⌂', label: 'Home', end: true },
  { to: '/onboard', icon: '◎', label: 'Setup' },
  { to: '/chat', icon: '◈', label: 'Talk' },
  { to: '/memories', icon: '❐', label: 'Memories' },
  { to: '/patient', icon: '◉', label: 'Patient', highlight: true },
];

function WordmarkBar() {
  return (
    <header className="wordmark-bar">
      <div className="wordmark">SA<span>H</span>AY · सहाय</div>
      <div className="wordmark-bar__badge">AWS Hackathon 2026</div>
    </header>
  );
}

function Dock() {
  return (
    <nav className="dock">
      {DOCK_ITEMS.map((item, i) => (
        <>
          {i === DOCK_ITEMS.length - 1 && <div key="div" className="dock__divider" />}
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `dock__item${isActive ? ' active' : ''}`}
            style={item.highlight ? { color: 'var(--signal)' } : {}}
          >
            <span className="dock__icon">{item.icon}</span>
            <span className="dock__label">{item.label}</span>
          </NavLink>
        </>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-shell">
          <Routes>
            {/* Full-screen pages — no chrome */}
            <Route path="/bystander/:patientId" element={<BystanderPage />} />
            <Route path="/patient" element={<PatientPage />} />
            <Route path="/memories/theater" element={<MemoryTheaterPage />} />

            {/* Main app with wordmark + dock */}
            <Route path="*" element={
              <>
                <WordmarkBar />
                <Dock />
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/onboard" element={<OnboardPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/route" element={<RoutePage />} />
                  <Route path="/simulate" element={<SimulatePage />} />
                  <Route path="/memories" element={<MemoriesAdminPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </>
            } />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
