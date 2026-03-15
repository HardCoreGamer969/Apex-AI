import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRaceNames, fetchSessions } from '../api/client';
import type { Session } from '../types/api';

const currentYear = new Date().getFullYear();
const LABEL_TO_CODE: Record<string, string> = { Race: 'R', Sprint: 'S', Qualifying: 'Q', 'Sprint Qualifying': 'SQ' };
const QUALIFYING_SESSIONS = new Set(['Qualifying', 'Sprint Qualifying']);

function isSessionAvailable(sessionDates: Record<string, string>, label: string): boolean {
  const dateStr = sessionDates[label];
  if (!dateStr) return false;
  try {
    const sessionDate = new Date(dateStr);
    return sessionDate <= new Date();
  } catch {
    return true;
  }
}

export default function SessionPicker() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [raceNames, setRaceNames] = useState<string[]>([]);
  const [year, setYear] = useState(currentYear);
  const [place, setPlace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Session | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSessions(place ? undefined : year, place || undefined)
      .then((data) => {
        setSessions(data);
        if (data.length > 0 && !selectedEvent) setSelectedEvent(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, place]);

  useEffect(() => {
    fetchRaceNames(2018, currentYear)
      .then(setRaceNames)
      .catch(() => {});
  }, []);

  const getEventYear = (ev: Session) => ev.year ?? year;

  const availableSessions = selectedEvent
    ? (['Race', 'Sprint', 'Qualifying', 'Sprint Qualifying'] as const).filter((label) =>
        isSessionAvailable(selectedEvent.session_dates || {}, label)
      )
    : [];

  const handleSessionClick = (label: string) => {
    if (!selectedEvent) return;
    const code = LABEL_TO_CODE[label];
    const evYear = getEventYear(selectedEvent);
    if (QUALIFYING_SESSIONS.has(label)) {
      navigate(`/qualifying/${evYear}/${selectedEvent.round_number}/${code}`);
    } else {
      navigate(`/replay/${evYear}/${selectedEvent.round_number}/${code}`);
    }
  };

  return (
    <div className="session-picker">
      <header className="picker-header">
        <h1>ApexAI</h1>
        <p className="subtitle">F1 Race Replay</p>
      </header>

      <div className="picker-filters">
        <div className="filter-group">
          <label>Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={!!place}
          >
            {Array.from({ length: currentYear - 2017 }, (_, i) => 2018 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Race</label>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">All Races</option>
            {raceNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading schedule...</div>
      ) : (
        <div className="picker-content">
          <div className="schedule-list">
            <h2>Schedule</h2>
            <ul>
              {sessions.map((ev, i) => (
                <li
                  key={`${getEventYear(ev)}-${ev.round_number}-${i}`}
                  className={selectedEvent === ev ? 'selected' : ''}
                  onClick={() => setSelectedEvent(ev)}
                >
                  <span className="round">R{ev.round_number}</span>
                  <span className="event">{ev.event_name}</span>
                  <span className="meta">{ev.country} · {ev.date}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="session-panel">
            <h2>Sessions</h2>
            {selectedEvent ? (
              <>
                <p className="event-name">{selectedEvent.event_name}</p>
                {availableSessions.length === 0 ? (
                  <p className="muted">No Race or Sprint data available</p>
                ) : (
                  <div className="session-buttons">
                    {availableSessions.map((label) => (
                      <button
                        key={label}
                        className="session-btn"
                        onClick={() => handleSessionClick(label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Select an event</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
