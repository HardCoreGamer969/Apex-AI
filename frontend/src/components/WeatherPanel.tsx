import type { WeatherTimeline } from '../types/api';

interface WeatherPanelProps {
  weather: WeatherTimeline | null | undefined;
  frameIndex: number;
}

export default function WeatherPanel({ weather, frameIndex }: WeatherPanelProps) {
  if (!weather) return null;

  const airTemp = weather.air_temp?.[frameIndex];
  const trackTemp = weather.track_temp?.[frameIndex];
  const humidity = weather.humidity?.[frameIndex];
  const windSpeed = weather.wind_speed?.[frameIndex];
  const rainState = weather.rain_state?.[frameIndex];

  return (
    <div className="weather-panel">
      <h3>Weather</h3>
      <div className="weather-grid">
        {airTemp != null && (
          <div className="weather-item">
            <span className="weather-label">Air</span>
            <span className="weather-value">{Math.round(airTemp)}°C</span>
          </div>
        )}
        {trackTemp != null && (
          <div className="weather-item">
            <span className="weather-label">Track</span>
            <span className="weather-value">{Math.round(trackTemp)}°C</span>
          </div>
        )}
        {humidity != null && (
          <div className="weather-item">
            <span className="weather-label">Humidity</span>
            <span className="weather-value">{Math.round(humidity)}%</span>
          </div>
        )}
        {windSpeed != null && (
          <div className="weather-item">
            <span className="weather-label">Wind</span>
            <span className="weather-value">{Math.round(windSpeed)} km/h</span>
          </div>
        )}
        {rainState && (
          <div className="weather-item">
            <span className="weather-label">Conditions</span>
            <span className={`weather-value ${rainState === 'RAINING' ? 'rain' : ''}`}>
              {rainState === 'RAINING' ? 'Wet' : 'Dry'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
