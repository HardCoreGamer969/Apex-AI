# ApexAI — Docker Local Dev Setup

**Status:** Implemented (March 2026)
**Purpose:** Containerised local development environment for testing the backend and frontend without installing Python or Node on the host.

---

## Overview

Two containers orchestrated with Docker Compose:

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `apexai-backend` | `docker/backend.Dockerfile` | `8765` | FastAPI + uvicorn, hot-reload |
| `apexai-frontend` | `docker/frontend.Dockerfile` | `5173` | Vite dev server, HMR |

One named volume:

| Volume | Mount in container | Purpose |
|--------|--------------------|---------|
| `apexai_cache` | `/app/cache` | Persists F1 session data across container restarts |

---

## Quick Start

```bat
apexai.bat up
```

- Backend: http://localhost:8765
- Frontend: http://localhost:5173

First run pulls base images and builds both images (~2–5 min). Subsequent starts are fast.

---

## apexai.bat — Docker Manager

`apexai.bat` in the project root is the single management tool. All commands check that Docker is running before doing anything.

### Service management

| Command | What it does |
|---------|-------------|
| `apexai.bat up` | Start both services in the background |
| `apexai.bat dev` | Start with live logs in the foreground (Ctrl+C to stop) |
| `apexai.bat down` | Stop and remove containers (volumes kept) |
| `apexai.bat stop` | Stop containers, preserve state (quicker restart than `down`) |
| `apexai.bat start` | Start containers that were stopped |
| `apexai.bat restart` | Restart all services |
| `apexai.bat restart backend` | Restart only the backend |

### Build

| Command | What it does |
|---------|-------------|
| `apexai.bat build` | Build images using Docker cache |
| `apexai.bat rebuild` | Force rebuild from scratch (`--no-cache`), then start |
| `apexai.bat pull` | Pull the latest `python:3.11-slim` and `node:20-alpine` base images |

### Debugging

| Command | What it does |
|---------|-------------|
| `apexai.bat logs` | Tail logs from all containers |
| `apexai.bat logs backend` | Tail backend logs only |
| `apexai.bat logs frontend` | Tail frontend logs only |
| `apexai.bat shell backend` | Open `/bin/sh` inside the backend container |
| `apexai.bat shell frontend` | Open `/bin/sh` inside the frontend container |
| `apexai.bat ps` or `apexai.bat status` | Show container states, ports, and health status |
| `apexai.bat health` | `curl http://localhost:8765/health` |
| `apexai.bat open` | Open `http://localhost:5173` in your default browser |

### Cleanup

| Command | What it does |
|---------|-------------|
| `apexai.bat clean` | `docker compose down --rmi local` + `docker image prune -f` — removes containers and **locally-built** images only; pulled base images and named volumes are kept |
| `apexai.bat nuke` | `docker compose down --rmi all -v --remove-orphans` + image prune — removes **everything** including the `apexai_cache` volume; requires `YES` confirmation |
| `apexai.bat reset` | 3-step: nuke → `build --no-cache` → `up -d`; requires `YES` confirmation |

**`clean` vs `nuke`:** `clean` is safe for day-to-day tidying (volumes survive). `nuke` is the nuclear option — all cached F1 session data is deleted and will need to be re-downloaded.

### Cache management

| Command | What it does |
|---------|-------------|
| `apexai.bat cache show` | List all cached `.json.gz` files in the Docker volume |
| `apexai.bat cache size` | Show disk usage per session entry |
| `apexai.bat cache clear` | Delete all cached F1 data from the volume — requires `YES` confirmation |
| `apexai.bat cache inspect` | Show Docker volume metadata (`docker volume inspect apexai_cache`) |

---

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Orchestrates backend + frontend; defines the cache volume |
| `docker/backend.Dockerfile` | Python 3.11-slim + uv + FastAPI + hot-reload |
| `docker/frontend.Dockerfile` | Node 20-alpine + Vite dev server + HMR |
| `.dockerignore` | Excludes node_modules, dist, desktop, .venv, secrets, etc. |
| `apexai.bat` | Management script (all Docker commands in one place) |

---

## Architecture Detail

### Backend container

- **Base image:** `python:3.11-slim`
- **System packages installed:** `gcc`, `g++`, `curl` — required by native extensions (NumPy, pandas, orjson) and the healthcheck
- **Dependency layer:** `uv sync --no-dev`
  - Installs all main dependencies from `pyproject.toml` / `uv.lock` (including `supabase`, which is a main dep but is inactive without `SUPABASE_URL`)
  - `--no-dev` skips the `dev` group (`pytest`, `httpx`)
  - The optional `desktop` group (`arcade`, `pyside6`, `pyglet`, `questionary`, `rich`) is never installed because uv only installs optional groups when explicitly requested
- **Layer order (for Docker cache efficiency):**
  1. System packages
  2. Install uv
  3. Copy `pyproject.toml` + `uv.lock` → `uv sync` ← cached unless deps change
  4. Copy `backend/` and `src/` ← busted on every code change, but deps layer stays cached
- **Volume mounts:** `./backend → /app/backend` and `./src → /app/src` — any file save triggers uvicorn `--reload`
- **Cache volume:** `apexai_cache → /app/cache` — gzip JSON files persist between `down`/`up` cycles
- **Healthcheck:** `curl -sf http://localhost:8765/health` every 10s, 25s start period; frontend `depends_on: condition: service_healthy`
- **Env:** `APEX_MODE=desktop`, `APEX_CACHE_DIR=/app/cache`, `MPLBACKEND=Agg`, `MPLCONFIGDIR=/tmp/mpl`, `PYTHONUNBUFFERED=1`
- **Restart policy:** `unless-stopped` — survives Docker Desktop restarts

### Frontend container

- **Base image:** `node:20-alpine`
- **Dependency layer:** `npm install` on `package.json` / `package-lock.json*` (the `*` means it works even without a lockfile; cached separately from source)
- **Layer order:**
  1. Copy `package.json` + `package-lock.json*` → `npm install` ← cached unless deps change
  2. Copy `frontend/` ← busted on source changes, deps layer stays cached
- **Volume mounts:** `./frontend/src → /app/src` and `./frontend/public → /app/public` — Vite's HMR picks up changes immediately without rebuilding the image
- **`VITE_API_URL`:** Set to `http://localhost:8765` — Vite injects this at dev-time. The browser (running on the host) reaches the backend through the Docker port binding `localhost:8765`, not the Docker-internal hostname `backend`
- **`--host 0.0.0.0`:** Passed as a CLI flag to `vite` so it binds to all interfaces and is reachable from the host browser
- **Restart policy:** `unless-stopped`

### `.dockerignore`

Keeps the Docker build context lean and prevents secrets from leaking into images:

| Excluded | Reason |
|----------|--------|
| `node_modules/`, `frontend/node_modules/` | Reinstalled inside the image |
| `frontend/dist/`, `frontend/.vite/` | Build artefacts, not source |
| `.venv/` | Python venv — reinstalled by `uv sync` |
| `desktop/`, `desktop-backend/` | Electron/PyInstaller; irrelevant to Docker |
| `dist/`, `build/`, `*.spec` | Build artefacts |
| `.env`, `.env.*` | Secrets — never bake into images |
| `documentation/`, `docs/`, `*.md`, `images/`, `resources/` | Non-runtime files |
| `.git/` | Version control metadata |
| `scripts/`, `*.bat` | Local tooling |
| `.vscode/`, `.idea/`, `.cursor/` | Editor config |

### `shell` command behaviour

`apexai.bat shell <service>` runs `docker compose exec <service> /bin/sh`. If `/bin/sh` fails (unlikely with the chosen base images), it automatically falls back to `/bin/bash`.

### Network

```
Host machine
  ├─ browser → localhost:5173 → apexai-frontend (Vite)
  └─ browser → localhost:8765 → apexai-backend  (FastAPI)

Docker internal network (apexai_default)
  ├─ apexai-frontend → apexai-backend:8765  (depends_on healthcheck)
  └─ apexai-backend  → internet             (FastF1 downloads F1 data)
```

The browser always talks to `localhost` (host ports). It never uses the Docker internal hostname `backend`.

### Cache persistence

```
apexai_cache volume
└── replay/
    └── {year}/{round}/{session}.json.gz   ← survives container restarts
```

`apexai.bat down` removes containers but **not** the volume. F1 sessions downloaded once stay cached until `apexai.bat nuke` or `apexai.bat cache clear`.

---

## Common Workflows

### Start developing
```bat
apexai.bat up         :: start in background
apexai.bat open       :: open browser
apexai.bat logs       :: watch logs
```

### Edit code
Edit anything in `backend/`, `src/`, or `frontend/src/` — changes apply instantly via hot-reload / HMR. No restart needed.

### Dependency changed (pyproject.toml or package.json)
```bat
apexai.bat rebuild    :: force image rebuild to pick up new deps
```

### Something broken, start completely fresh
```bat
apexai.bat reset      :: nuke + rebuild + start (prompts for confirmation)
```

### Check if backend is healthy
```bat
apexai.bat health
:: → {"status":"ok","mode":"desktop"}
```

### Inspect cached sessions
```bat
apexai.bat cache show
apexai.bat cache size
```

### Free up disk space
```bat
apexai.bat clean      :: remove images, keep volumes
apexai.bat nuke       :: remove everything including F1 cache
```

---

## Differences from Desktop .exe Mode

| Aspect | Docker dev | Windows .exe |
|--------|-----------|-------------|
| Cache location | Docker volume `apexai_cache` | `%APPDATA%\ApexAI\cache\` |
| Hot-reload | Yes (volume mounts) | No (compiled) |
| Backend port | 8765 (same) | 8765 (same) |
| `APEX_MODE` | `desktop` | `desktop` |
| Python runtime | Bundled in Docker image | Bundled by PyInstaller |
| Frontend | Vite dev server (port 5173) | Served by Electron from `file://` |
| Supabase | Not used (no `SUPABASE_URL`) | Not used |

The API contract and data format are identical — the Docker setup is a faithful dev environment for the desktop app.

---

## Prerequisites

- Docker Desktop for Windows (with WSL 2 backend recommended)
- Docker Engine 24+ / Compose v2
- No Python or Node required on the host

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `docker info` fails | Docker Desktop not running | Start Docker Desktop |
| Frontend never becomes healthy | Backend still starting (FastF1 import is slow) | Wait — start period is 25s; check `apexai.bat logs backend` |
| `VITE_API_URL` not picked up | Stale container from before the env var was set | `apexai.bat rebuild` |
| Port 8765 or 5173 already in use | Another process holds the port | Stop the other process, or change the port in `docker-compose.yml` and `frontend/src/api/client.ts` |
| Dependency change not reflected | Docker used the cached layer | `apexai.bat rebuild` (forces `--no-cache`) |
| Cache volume missing | Was deleted by a previous `nuke` | Normal — it's recreated empty on next `up` |
| `apexai.bat shell` exits immediately | Container not running | Run `apexai.bat up` first, then retry |
| NumPy/pandas import error in backend | Native extension ABI mismatch | `apexai.bat rebuild` to recompile from scratch |

---

## Verification Checklist

- [ ] `apexai.bat up` — both containers start, no errors
- [ ] `apexai.bat ps` — both show status `healthy` / `running`
- [ ] `apexai.bat health` → `{"status":"ok","mode":"desktop"}`
- [ ] Open `http://localhost:5173` — session picker loads
- [ ] Load a session → data downloads and replays
- [ ] `apexai.bat cache show` → `.json.gz` file present
- [ ] `apexai.bat down` then `apexai.bat up` — cached session loads instantly
- [ ] Edit a file in `backend/` → uvicorn reloads (visible in `apexai.bat logs backend`)
- [ ] Edit a file in `frontend/src/` → Vite HMR updates browser automatically
- [ ] `apexai.bat shell backend` → shell opens inside container
- [ ] `apexai.bat clean` → containers and images removed, volume intact
- [ ] `apexai.bat nuke` → everything removed including volume (after YES confirmation)
