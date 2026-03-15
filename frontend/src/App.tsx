import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SessionPicker from './components/SessionPicker';
import ReplayViewer from './components/ReplayViewer';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionPicker />} />
        <Route path="/replay/:year/:round/:session" element={<ReplayViewer />} />
      </Routes>
    </BrowserRouter>
  );
}
