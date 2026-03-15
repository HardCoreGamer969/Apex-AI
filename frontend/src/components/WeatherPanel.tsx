import type { Frame } from '../types/api';

interface WeatherPanelProps {
  frame: Frame | null;
}

export default function WeatherPanel({ frame }: WeatherPanelProps) {
  const weather = frame?.weather;
  if (!weather) return null;

  return (
    <div className="weather-panel">
      <h3>Weather</h3>
      <div className="weather-grid">
        {weather.air_temp != null && (
          <div className="weather-item">
            <span className="weather-label">Air</span>
            <span className="weather-value">{Math.round(weather.air_temp)}°C</span>
          </div>
        )}
        {weather.track_temp != null && (
          <div className="weather-item">
            <span className="weather-label">Track</span>
            <span className="weather-value">{Math.round(weather.track_temp)}°C</span>
          </div>
        )}
        {weather.humidity != null && (
          <div className="weather-item">
            <span className="weather-label">Humidity</span>
            <span className="weather-value">{Math.round(weather.humidity)}%</span>
          </div>
        )}
        {weather.wind_speed != null && (
          <div className="weather-item">
            <span className="weather-label">Wind</span>
            <span className="weather-value">{Math.round(weather.wind_speed)} km/h</span>
          </div>
        )}
        {weather.rain_state && (
          <div className="weather-item">
            <span className="weather-label">Conditions</span>
            <span className={`weather-value ${weather.rain_state === 'RAINING' ? 'rain' : ''}`}>
              {weather.rain_state === 'RAINING' ? 'Wet' : 'Dry'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
