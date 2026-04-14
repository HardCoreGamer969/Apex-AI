# ApexAI

A full-stack web application for visualizing Formula 1 race telemetry and replaying race events in the browser. Select a race weekend, pick a session, and watch drivers move around the track with smooth interpolated animation.

**ApexAI** is a modified fork of [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev).

## Features

- **Dashboard** — Featured race card, recent sessions grid, saved-session strip, WebGL hero (Three.js, SVG fallback on low-end devices)
- **Replay Viewer** — 60 FPS interpolated car movement from 5 FPS telemetry, live leaderboard, weather, DRS zones
- **Head-to-Head Compare** — Two-driver synchronized playback with live gap chart
- **Lap Analysis** — Isolated single-lap replay with telemetry sparklines and sector times
- **Tyre Strategy Timeline** — Gantt chart of driver stints with compound-colored bars, pit-stop markers, and a lap scrubber that updates grid order
- **Telemetry Overlays** — Speed, throttle, brake, gear, and DRS traces over the replay track
- **Saved Sessions** — Bookmark sessions locally (Zustand + localStorage persistence)
- **Glassmorphism UI** — Tailwind + Framer Motion throughout with heavy motion and glass panels

## Tech Stack

| Layer   | Stack                                                                 |
|---------|-----------------------------------------------------------------------|
| Backend | Python, FastAPI, FastF1, Redis (with in-memory fallback), Supabase L2 |
| Frontend| React 19, TypeScript, Vite, Tailwind, Framer Motion, Three.js, Zustand, TanStack Query |
| Deploy  | Railway (backend), Vercel (frontend)                                  |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (recommended for Python)

### Run Locally

**1. Clone and install**

```bash
git clone https://github.com/HardCoreGamer969/Apex-AI
cd Apex-AI
uv sync
cd frontend && npm install
```

**2. Start the backend**

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**3. Start the frontend** (in a new terminal)

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend expects the API at `http://localhost:8000` by default. Override with `VITE_API_URL` in `frontend/.env` if needed.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /sessions?year=2024` | List race weekends by year |
| `GET /sessions/race-names` | Unique race names for dropdowns |
| `GET /replay?year=2024&round=5&session=R` | Full replay payload (frames, track, driver colors) |
| `GET /compare?year=...&driver_a=VER&driver_b=HAM` | Two-driver aligned frames + gap series |
| `GET /telemetry?year=...&driver=VER` | Per-lap telemetry (speed/throttle/brake/gear/DRS) |
| `GET /lap?year=...&driver=VER&lap=45` | Single-lap frames + telemetry + sector times |
| `GET /strategy?year=...&session=R` | Stint list per driver (compound, lap range, pit stops) |
| `GET /health` | Health check |

Replay supports `stride` (1–25) to downsample frames; default `stride=1` for full-fidelity playback.

## Project Structure

```
Apex-AI/
├── backend/                 # FastAPI backend
│   ├── main.py              # App entry, CORS, routers
│   ├── routers/             # sessions, replay, compare, telemetry, lap, strategy
│   └── services/            # f1_adapter, cache (Redis + in-memory fallback)
├── frontend/                # React + Vite SPA
│   ├── src/
│   │   ├── api/             # client + TanStack Query hooks
│   │   ├── components/
│   │   │   ├── glass/       # GlassPanel primitive
│   │   │   ├── hero/        # TrackHero (Three.js) + SVG fallback
│   │   │   ├── nav/         # NavBar
│   │   │   └── replay/      # TrackCanvas, Leaderboard, TelemetryOverlay, etc.
│   │   ├── pages/           # Dashboard, ReplayViewer, Compare, Lap, Strategy, Saved
│   │   ├── store/           # Zustand stores (replay, saved)
│   │   └── styles/          # tokens.css
│   └── vercel.json          # SPA routing
├── src/                     # Shared F1 logic (used by backend)
│   ├── f1_data.py           # FastF1, telemetry, frame generation
│   ├── ui_components.py     # Track geometry
│   └── lib/                 # settings, time, tyres, season helpers
├── pyproject.toml           # Python deps (uv)
└── railway.toml             # Railway deployment config
```

## Deployment

- **Frontend:** Deploy `frontend/` to Vercel. Set `VITE_API_URL` to your backend URL.
- **Backend:** Deploy to Railway using `railway.toml`. Set `CORS_ORIGINS` to your frontend URL(s); optionally add `REDIS_URL` (Railway Redis plugin) and Supabase vars (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CACHE_BUCKET`) for the L2 cache. If `REDIS_URL` is unset the backend falls back to an in-memory TTL cache.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for the full text.

### Attribution

ApexAI is a modified fork of **F1 Race Replay**. The following attribution must be preserved:

> **Copyright (c) Tom Shaw**  
> Original project: [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev)

## Disclaimer

Formula 1 and related trademarks are the property of their respective owners. All data is sourced from publicly available APIs and used for educational and non-commercial purposes only.
