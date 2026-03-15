# ApexAI

A full-stack web application for visualizing Formula 1 race telemetry and replaying race events in the browser. Select a race weekend, pick a session, and watch drivers move around the track with smooth interpolated animation.

**ApexAI** is a modified fork of [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev).

## Features

- **Session Picker** — Browse race weekends by year and event, then select Race or Sprint sessions
- **Track Visualization** — 2D circuit map with inner/outer boundaries and DRS zones
- **Live Leaderboard** — Driver positions, lap, speed, and tyre compound in real time
- **Smooth Playback** — 60 FPS interpolated car movement from 5 FPS telemetry data
- **Playback Controls** — Play, pause, speed (0.5x–4x), and seek through the session

## Tech Stack

| Layer   | Stack                          |
|---------|--------------------------------|
| Backend | Python, FastAPI, FastF1        |
| Frontend| React, TypeScript, Vite        |
| Deploy  | Render (backend), Vercel (frontend) |

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
| `GET /sessions?place=Monaco` | List weekends by place |
| `GET /sessions/race-names` | Unique race names for dropdowns |
| `GET /replay?year=2024&round=5&session=R` | Full replay payload (frames, track, driver colors) |
| `GET /health` | Health check |

Replay supports `stride` (1–25) to downsample frames; default `stride=5` yields ~5 FPS data for smaller payloads.

## Project Structure

```
Apex-AI/
├── backend/                 # FastAPI backend
│   ├── main.py              # App entry, CORS, routers
│   ├── routers/             # sessions, replay
│   └── services/            # f1_adapter (wraps src/)
├── frontend/                # React + Vite SPA
│   ├── src/
│   │   ├── api/             # API client
│   │   ├── components/      # SessionPicker, ReplayViewer, TrackCanvas, etc.
│   │   ├── hooks/           # useReplayPlayback (interpolation)
│   │   └── types/           # API types
│   └── vercel.json          # SPA routing
├── src/                     # Shared F1 logic (used by backend)
│   ├── f1_data.py           # FastF1, telemetry, frame generation
│   └── ui_components.py      # Track geometry
├── pyproject.toml           # Python deps (uv)
├── render.yaml              # Render deployment config
└── main.py                  # Legacy desktop viewer (Arcade)
```

## Deployment

- **Frontend:** Deploy `frontend/` to Vercel. Set `VITE_API_URL` to your backend URL.
- **Backend:** Deploy to Render (or similar) using `render.yaml`. Set `CORS_ORIGINS` to your frontend URL(s).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for the full text.

### Attribution

ApexAI is a modified fork of **F1 Race Replay**. The following attribution must be preserved:

> **Copyright (c) Tom Shaw**  
> Original project: [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev)

## Disclaimer

Formula 1 and related trademarks are the property of their respective owners. All data is sourced from publicly available APIs and used for educational and non-commercial purposes only.
