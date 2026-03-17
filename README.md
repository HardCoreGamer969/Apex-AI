# ApexAI — F1 Race Viewer

A **Windows desktop application** for visualizing Formula 1 race telemetry and replaying race sessions with smooth 60 FPS animation. Select a race weekend, pick a session, and watch drivers move around the track in real time.

**ApexAI** is a modified fork of [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev).

> **Web hosting is on hold.** Previous attempts to run on Render's free tier were too unreliable. The app now ships as a self-contained Windows .exe — no cloud, no cold starts, no timeouts.

---

## Features

- **Session Picker** — Browse race weekends by year and event, select Race or Sprint sessions
- **Track Visualization** — 2D circuit map with inner/outer boundaries and DRS zones
- **Live Leaderboard** — Driver positions, lap, speed, and tyre compound in real time
- **Smooth Playback** — 60 FPS interpolated car movement from telemetry keyframes
- **Playback Controls** — Play, pause, speed (0.5x–4x), and seek through the session
- **Local Cache** — Sessions are cached to disk after first load; subsequent loads are instant
- **System Tray** — Minimize to tray, restore with double-click

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Desktop shell | Electron 33 |
| UI | React 19, TypeScript, Vite |
| Backend | Python 3.11+, FastAPI, uvicorn |
| F1 data | FastF1 |
| Python bundling | PyInstaller 6 |
| Windows installer | electron-builder 25 (NSIS) |
| Local cache | Disk cache (`%APPDATA%\ApexAI\cache\`) |

---

## Windows Desktop App

### Install (pre-built)

Download `ApexAI-Setup-x.x.x.exe` from the [Releases](../../releases) page and run it. No Python or Node required.

**First run:** Electron starts the embedded backend, which downloads F1 session data on first access (2–5 minutes per session). Subsequent loads are instant from the local cache.

### Build from source

**Prerequisites:** Node.js 18+, Python 3.11+, [uv](https://docs.astral.sh/uv/)

```powershell
git clone https://github.com/HardCoreGamer969/Apex-AI
cd Apex-AI
uv sync
cd desktop && npm install && cd ..

# Build everything (frontend + PyInstaller backend + NSIS installer)
.\scripts\build-desktop.ps1
```

Output: `desktop\dist\ApexAI Setup 1.0.0.exe`

---

## Developer Setup (run without building)

Run the frontend and backend separately for development:

**1. Install dependencies**
```bash
git clone https://github.com/HardCoreGamer969/Apex-AI
cd Apex-AI
uv sync
cd frontend && npm install && cd ..
```

**2. Start the backend**
```bash
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

**3. Start Electron** (or the Vite dev server for browser testing)
```bash
# Option A: Electron (recommended)
cd desktop && npm install && npx electron .

# Option B: Browser
cd frontend && npm run dev
# Open http://localhost:5173
```

The backend defaults to `http://localhost:8765`. Override with `VITE_API_URL` in `frontend/.env`.

---

## API

| Endpoint | Description |
|----------|-------------|
| `GET /sessions?year=2024` | List race weekends by year |
| `GET /sessions?place=Monaco` | List weekends by place |
| `GET /sessions/race-names` | Unique race names for dropdowns |
| `GET /replay?year=2024&round=5&session=R` | Full replay payload (frames, track, driver colors) |
| `GET /health` | Health check — returns `{"status":"ok","mode":"desktop"}` |

Replay supports `stride` (1–25) to downsample frames; default `stride=5` yields ~5 FPS keyframes for smaller payloads.

---

## Project Structure

```
ApexAI/
├── backend/                  # FastAPI backend
│   ├── main.py               # App entry, CORS, APEX_MODE detection
│   ├── routers/              # sessions, replay, admin, websocket
│   └── services/
│       ├── cache.py          # L1 (TTL) + L2 (disk or Supabase)
│       └── f1_adapter.py     # Wraps src/f1_data.py
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── api/              # API client (polling, local timeouts)
│   │   ├── components/       # SessionPicker, ReplayViewer, TrackCanvas, etc.
│   │   ├── hooks/            # useReplayPlayback (60 FPS interpolation)
│   │   └── types/            # TypeScript interfaces
│   └── vite.config.ts        # base: './' for Electron file:// loading
├── desktop/                  # Electron shell
│   ├── main.js               # Main process: spawn backend, window, tray
│   ├── preload.js            # Context bridge
│   ├── package.json          # Electron + electron-builder deps
│   └── electron-builder.json # NSIS installer config
├── desktop-backend/          # PyInstaller bundle
│   ├── main.py               # Entry point (freeze_support + uvicorn)
│   └── apex-ai-backend.spec  # PyInstaller spec
├── src/                      # Shared F1 logic
│   ├── f1_data.py            # FastF1, telemetry, frame generation
│   └── track_geometry.py
├── scripts/
│   └── build-desktop.ps1     # One-command Windows build
├── documentation/            # Technical docs and plans
└── pyproject.toml            # Python deps (uv)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Windows EXE Plan](documentation/windows-exe-plan.md) | Current architecture, build steps, and verification checklist |
| [Desktop EXE and Pipeline](documentation/desktop-exe-and-pipeline.md) | Original Electron + PyInstaller design (reference) |
| [Render Memory Optimization](documentation/render-memory-optimization.md) | Backend memory work (archived — Render on hold) |
| [Offload Compute](documentation/offload-compute.md) | Pre-compute and keyframe strategy |

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for the full text.

### Attribution

ApexAI is a modified fork of **F1 Race Replay**.

> **Copyright (c) Tom Shaw**
> Original project: [F1 Race Replay](https://github.com/IAmTomShaw/f1-race-replay) by [Tom Shaw](https://tomshaw.dev)

## Disclaimer

Formula 1 and related trademarks are the property of their respective owners. All data is sourced from publicly available APIs and used for educational and non-commercial purposes only.
