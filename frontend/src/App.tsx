import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/nav/NavBar';
import Dashboard from './pages/Dashboard';
import SessionPicker from './pages/SessionPicker';
import ReplayViewer from './pages/ReplayViewer';
import QualifyingViewer from './pages/QualifyingViewer';
import CompareView from './pages/CompareView';
import LapAnalysis from './pages/LapAnalysis';
import StrategyTimeline from './pages/StrategyTimeline';
import SavedSessions from './pages/SavedSessions';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-[#0A0B14]">
        <NavBar />
        <div className="flex-1 flex flex-col min-h-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions" element={<SessionPicker />} />
            <Route path="/replay/:year/:round/:session" element={<ReplayViewer />} />
            <Route path="/qualifying/:year/:round/:session" element={<QualifyingViewer />} />
            <Route path="/compare/:year/:round/:session" element={<CompareView />} />
            <Route path="/lap/:year/:round/:session" element={<LapAnalysis />} />
            <Route path="/strategy/:year/:round/:session" element={<StrategyTimeline />} />
            <Route path="/saved" element={<SavedSessions />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
