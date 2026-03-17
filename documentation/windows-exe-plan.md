# ApexAI — Windows .exe Race Viewer

**Status:** Implemented (March 2026)
**Decision:** Pivot from Render/Vercel cloud hosting to a local Windows .exe desktop application.

---

## Background & Why

### Prior optimization history

Before this pivot, four phases of work targeted Render's free tier (512MB RAM):

| Phase | Work | Outcome |
|-------|------|---------|
| Phase 1 | Initial FastAPI + React web app on Render/Vercel | Functional but slow cold starts |
| Phase 2 | Supabase L2 cache, columnar replay format, stride/5fps | Smaller payloads, faster repeat loads |
| Phase 3 | Background task queue, frontend polling `/replay/status` | Non-blocking loads |
| Phase 4 | Gzip passthrough, sequential driver processing, 3fps target, skip L2 memory when Supabase set | Saved ~100–200MB |
| Patch | Frontend timeout resilience: 8-min timeout, auto-retry (2 cycles), tiered progress messages | Masked the underlying problem |

**Conclusion:** Render's free tier remained too constrained. Cold starts (30–60s), computation timeouts, and queue buildup made the app unreliable. The patches were working around infrastructure limits rather than fixing the experience.

**Decision:** Ship a self-contained Windows .exe. Local machine has ample RAM, no cold starts, no cloud latency. Web/cloud hosting is pinned for now.

---

## Architecture

```
ApexAI-Setup-x.x.x.exe   (electron-builder NSIS installer)
└── ApexAI/
    ├── ApexAI.exe             (Electron 33 shell)
    │   ├── Splash BrowserWindow  (shown during backend startup)
    │   ├── Main BrowserWindow    (loads frontend-dist/index.html)
    │   ├── System tray
    │   └── spawns ──────────→  apex-ai-backend.exe on port 8765
    └── resources/
        ├── frontend-dist/     (Vite-built React SPA)
        └── apex-ai-backend/   (PyInstaller --onedir bundle)
```

### Startup sequence

1. User double-clicks `ApexAI.exe`
2. Electron shows a splash screen (dark, animated dots)
3. Electron spawns `apex-ai-backend.exe` with `APEX_MODE=desktop` and `windowsHide: true`
4. Electron polls `http://127.0.0.1:8765/health` every 500ms (60s timeout)
5. Once healthy: splash closes, main `BrowserWindow` opens and loads `frontend-dist/index.html`
6. React app communicates with `http://localhost:8765` for all API calls
7. Session data is cached to `%APPDATA%\ApexAI\cache\` as gzip JSON files
8. On quit (or tray → Quit): Electron kills the backend process and destroys the tray icon

### Dev fallback (no PyInstaller build)

If `desktop-backend/dist/` does not exist, `desktop/main.js` falls back to:
```
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765
```
This lets you run Electron during development without a full PyInstaller build.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop shell | Electron 33 | Subprocess management, window lifecycle, tray |
| UI | React 19 + TypeScript + Vite | Unchanged from web version |
| Backend | Python 3.11+, FastAPI, uvicorn | Same API; bound to `127.0.0.1:8765` |
| F1 data | FastF1 | Downloads from F1 telemetry API; cached locally |
| Python bundling | PyInstaller 6.x `--onedir` | All deps bundled; no Python install required |
| Windows installer | electron-builder 25, NSIS | Start Menu + Desktop shortcut, custom install dir |
| L1 cache | In-memory TTL (24h, maxsize=50) | Session lists and race names |
| L2 cache | Disk — `%APPDATA%\ApexAI\cache\` | gzip JSON; replaces Supabase for desktop |

---

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `desktop/main.js` | Electron main process |
| `desktop/package.json` | `electron` + `electron-builder` devDeps |
| `desktop/electron-builder.json` | NSIS + portable build config; bundles backend + frontend dist as extraResources |
| `desktop/preload.js` | `contextBridge` exposing `apexai.version` |
| `desktop/installer-extras.nsh` | NSIS include script — prerequisite checks (Windows version, VC++ redist, disk space) |
| `desktop-backend/main.py` | PyInstaller entry: `freeze_support()` + `uvicorn.run(app, host="127.0.0.1", port=8765)` |
| `desktop-backend/apex-ai-backend.spec` | PyInstaller `--onedir` spec: hidden imports, FastF1 datas, excludes Supabase/GUI libs |
| `scripts/build-desktop.ps1` | PowerShell: frontend build → PyInstaller → electron-builder, with `-Skip*` flags |
| `documentation/workflows/desktop-build.yml` | GitHub Actions CI on `v*` tags; outputs `ApexAI Setup*.exe` as artifact |
| `documentation/windows-exe-plan.md` | This file |

### Modified files

#### `backend/services/cache.py`

- **Added `LocalDiskCache` functions** (`disk_get`, `disk_set`, `disk_delete`, `disk_list_keys`):
  - Cache dir: `%APPDATA%\ApexAI\cache\` (or `APEX_CACHE_DIR` env override)
  - Keys map directly to file paths: `replay/2024/5/R.json.gz`
  - Reads/writes raw gzip bytes — same format as Supabase, fully compatible
- **Updated `replay_get`**: when Supabase absent, checks L1 memory → disk → promotes disk hit to L1
- **Updated `replay_set`**: when Supabase absent, writes compressed bytes to disk + stores parsed payload in L1
- **Updated `replay_get_compressed`**: returns disk bytes directly (avoids decompress+parse+re-encode)
- **Updated `quali_get` / `quali_set` / `quali_get_compressed`**: same disk-backed pattern
- **Updated `task_status_get/set/delete`**: persists task status to disk (`tasks/{id}.json`) when Supabase absent
- **Changed `_l2_memory` LRU maxsize**: `1→3` when Supabase absent (hot layer over disk)

#### `backend/main.py`

- **Windows MPLCONFIGDIR**: on `os.name == "nt"`, sets `MPLCONFIGDIR` to `%LOCALAPPDATA%\ApexAI\mpl` (writable) instead of `/tmp/mpl`
- **`APEX_MODE` detection**: reads `os.environ.get("APEX_MODE", "")`
- **CORS origin regex**: in desktop mode, extends regex to also match `http://localhost:\d+` and `file://.*`
- **`/health` response**: now returns `{"status": "ok", "mode": "<web|desktop>"}` — Electron uses this to detect readiness
- **Default CORS origins**: added `http://localhost:8765` to the default list

#### `frontend/vite.config.ts`

- Added `base: './'` — makes all asset paths relative so the app loads correctly from `file://` in Electron

#### `frontend/src/api/client.ts`

- **Default `API_BASE`**: changed from `http://localhost:8000` → `http://localhost:8765`
- **`REPLAY_TIMEOUT_MS`**: `480_000` → `600_000` (10 min; first load downloads F1 data)
- **`POLL_INTERVAL_MS`**: `4_000` → `2_000` (faster polling locally, no server load concern)
- **`RETRY_EXTENSION_MS`**: `120_000` → `60_000`
- **`MAX_RETRY_CYCLES`**: `2` → `1`
- **Error messages**: removed references to Render cold starts and spin-down; replaced with generic local backend messages
- **Progress messages**: tiered thresholds updated (30s / 120s) to match typical local computation times

#### `README.md`

- Leads with Windows desktop app download, not web hosting
- Marks Render/Vercel as "on hold"
- Rewrites Quick Start as "Developer Setup"
- Updates Tech Stack table (Electron/PyInstaller replaces Render/Vercel)
- New "Windows Desktop App" section (download + build from source)
- New Project Structure section reflecting `desktop/` and `desktop-backend/`

---

## Local Disk Cache Detail

Cache directory: `%APPDATA%\ApexAI\cache\`
Override: set `APEX_CACHE_DIR` env var before launching.

```
%APPDATA%\ApexAI\cache\
├── replay\
│   └── {year}\
│       └── {round}\
│           └── {session}.json.gz   ← full replay payload, gzip-compressed orjson
├── qualifying\
│   └── {year}\
│       └── {round}\
│           └── {session}.json.gz
└── tasks\
    └── {task_id}.json              ← task status (plain orjson, not compressed)
```

**Two-tier read path (no Supabase):**
1. Check L1 in-memory LRU (maxsize=3)
2. Check disk — if hit, decompress, validate `cache_version`, promote to L1
3. Miss → compute, write to disk + L1

**Version gating:** `REPLAY_CACHE_VERSION = 2`. On disk hit, if `payload["cache_version"] != 2` the file is deleted and recomputed. This prevents stale data after schema changes.

**Survival across reinstall:** Cache lives in AppData (not the app install dir), so it survives uninstalls. Users don't re-download session data after reinstalling.

---

## Electron Shell Detail

`desktop/main.js` key behaviours:

| Behaviour | Implementation |
|-----------|---------------|
| Splash screen | `BrowserWindow` with `loadURL('data:text/html;...')` — no external file needed |
| Backend path | Dev: `../desktop-backend/dist/apex-ai-backend/apex-ai-backend.exe`; Prod: `process.resourcesPath/apex-ai-backend/` |
| Dev fallback | If no compiled backend found, spawns `uv run uvicorn ...` instead |
| Health poll | `http.get(HEALTH_URL)` every 500ms, 60s timeout; on failure shows `dialog.showErrorBox` |
| System tray | `Tray` with right-click menu: Show / Quit; double-click restores window |
| Close to tray | `mainWindow.on('close')` → `e.preventDefault(); mainWindow.hide()` unless `quitting=true` |
| Crash detection | `backendProcess.on('exit')` → error dialog + `app.quit()` if not intentionally quitting |
| App menu | File (Quit), View (Reload, Fullscreen, DevTools in dev), Help (Open Cache Folder, Version) |
| Backend env | `APEX_MODE=desktop`, `APEX_PORT=8765`, `windowsHide: true` |

---

## PyInstaller Spec Detail

`desktop-backend/apex-ai-backend.spec`:

- **Mode:** `--onedir` (avoids uvicorn `--onefile` bugs with worker processes)
- **Entry:** `desktop-backend/main.py`
- **Hidden imports:** `uvicorn.loops.auto`, `uvicorn.protocols.http.auto`, `uvicorn.lifespan.on`, `fastf1`, `orjson`, `starlette.middleware.*`, `matplotlib.backends.backend_agg`
- **Datas:** All non-`.py` files from the FastF1 package tree (circuits, etc.) + `backend/` + `src/`
- **Excludes:** `arcade`, `pyside6`, `pygame`, `pyglet`, `questionary`, `rich`, `supabase`, `IPython`, `jupyter`, `tkinter`, `wx`, `PyQt5/6`, `PySide2`
- **Console:** `False` (no terminal window shown to user)
- **UPX:** enabled for compression

Expected bundle size: ~200–400MB (NumPy, pandas, matplotlib, FastF1 dominate).

---

## Build Instructions

### Quick build (all steps)
```powershell
.\scripts\build-desktop.ps1
```

### Selective rebuild
```powershell
.\scripts\build-desktop.ps1 -SkipFrontend   # only rebuild backend + package
.\scripts\build-desktop.ps1 -SkipBackend    # only rebuild frontend + package
.\scripts\build-desktop.ps1 -SkipPackage    # build frontend + backend but don't package
```

### Step-by-step (troubleshooting)
```powershell
# 1. Frontend
cd frontend
npm run build         # output: frontend/dist/

# 2. Backend (PyInstaller)
uv run pip install pyinstaller
uv run pyinstaller desktop-backend/apex-ai-backend.spec `
    --distpath desktop-backend/dist `
    --workpath desktop-backend/build `
    --noconfirm
# output: desktop-backend/dist/apex-ai-backend/

# 3. Electron package
cd desktop
npm install
npx electron-builder --win
# output: desktop/dist/ApexAI Setup 1.0.0.exe
```

### Dev mode (no build required)
```powershell
# Terminal 1: backend
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765

# Terminal 2: Electron (auto-falls back to uv if no compiled backend)
cd desktop && npm install && npx electron .

# Optional — Terminal 3: Vite dev server (for HMR)
cd frontend && npm run dev
```

---

## CI/CD (GitHub Actions)

Workflow at `documentation/workflows/desktop-build.yml`.
**To activate:** copy/move to `.github/workflows/desktop-build.yml`.

- **Trigger:** push to `v*` tag or manual `workflow_dispatch`
- **Runner:** `windows-latest`
- **Steps:** checkout → Node 20 → Python 3.11 → uv → `uv sync` → PyInstaller → frontend build → electron-builder
- **Artifact:** `ApexAI Setup*.exe` uploaded, retained 30 days

To cut a release:
```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## Installer Outputs

Running `.\scripts\build-desktop.ps1` (or `npx electron-builder --win` in `desktop/`) produces two files in `desktop\dist\`:

| File | Type | Use case |
|------|------|---------|
| `ApexAI Setup 1.0.0.exe` | NSIS installer | Standard install — adds Start Menu + Desktop shortcut, appears in Add/Remove Programs |
| `ApexAI-portable.exe` | Portable | No install needed — extract and run from anywhere (USB drive, etc.) |

The portable build self-extracts to a temp folder on first launch (a few seconds slower first time), then runs identically to the installed version.

---

## Installer Prerequisite Checks

`desktop/installer-extras.nsh` is injected into the NSIS installer via `electron-builder.json`'s `"include"` field. It runs three checks:

### 1. Windows version (hard block)

Checked in `!macro customInit` (before installer UI appears). Uses NSIS `${AtLeastWin10}`. If the system is older than Windows 10, the installer aborts with an error — no bypass.

### 2. Visual C++ 2015-2022 Redistributable (soft, with options)

Required by the PyInstaller bundle's native extensions (NumPy, pandas). Checked via registry:
- `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64 → Installed = 1`
- Also checks `WOW6432Node` path as a fallback

If missing, the user sees a three-option dialog:

```
"VC++ Runtime not found. What would you like to do?"

  YES    → Download & install automatically (silent, from https://aka.ms/vs/17/release/vc_redist.x64.exe)
  NO     → Open download page in browser; OK to re-check, Cancel to skip
  CANCEL → Check again (for if they just installed it in another window)
```

- Exit code `0` = success
- Exit code `3010` = success, reboot recommended (user is informed)
- Any other exit code = offers manual fallback
- Download failure = offers manual fallback
- Skipping = warns the user, continues install

### 3. Disk space (soft, with retry)

Checked in `!macro customInstall` (during install, after the user has chosen their install directory). Requires ~700MB free on the target drive.

If insufficient:
```
"Not enough space on C: (need ~700MB, have 400MB)"

  OK     → Re-check (user freed up space)
  Cancel → Install anyway
```

### Flow diagram

```
Installer starts
    │
    ▼
[customInit]
    ├─ Windows < 10? → ABORT (hard block)
    └─ VC++ missing?
           ├─ YES (auto) → Download + install silently → continue
           ├─ NO (manual) → Open browser → loop back to re-check
           ├─ CANCEL → Re-check immediately
           └─ Skip → warn, continue
    │
    ▼
[User picks install directory]
    │
    ▼
[customInstall]
    └─ Disk space < 700MB?
           ├─ OK → Re-check
           └─ Cancel → install anyway
    │
    ▼
Files extracted, shortcuts created
```

---

## What's Pinned

| Feature | Status | Notes |
|---------|--------|-------|
| Render backend | On hold | `render.yaml` kept, untouched |
| Vercel frontend | On hold | `vercel.json` kept, untouched |
| Supabase cache | On hold | `LocalDiskCache` handles desktop; Supabase still works if `SUPABASE_URL` is set |
| Auto-updater | Phase 2 | `electron-updater` integration |
| macOS / Linux | Phase 2 | electron-builder supports both |
| Tauri migration | Phase 2 | ~10MB bundle vs ~300MB Electron; requires Rust toolchain |

---

## Verification Checklist

**Dev**
- [ ] `cd desktop && npx electron .` — splash appears, backend starts, session picker loads
- [ ] `curl http://localhost:8765/health` → `{"status":"ok","mode":"desktop"}`
- [ ] Load a session → check `%APPDATA%\ApexAI\cache\replay\` for `.json.gz` file
- [ ] Reload same session → instant load (L1/disk cache hit; no "Computing..." message)
- [ ] Close window → minimizes to tray (not fully quit)
- [ ] Tray double-click → window restores
- [ ] Tray → Quit → app fully exits, backend process gone

**Build**
- [ ] `.\scripts\build-desktop.ps1` completes without errors
- [ ] `desktop\dist\` contains both `ApexAI Setup*.exe` and `ApexAI-portable.exe`

**NSIS installer**
- [ ] Run installer on a clean machine — VC++ check fires if redistributable is absent
- [ ] VC++ "YES" path: downloads, installs silently, install continues
- [ ] VC++ "NO" path: opens browser, loops back to re-check after user clicks OK
- [ ] VC++ "CANCEL" path: re-checks registry immediately
- [ ] Disk space check fires if drive has < 700MB free
- [ ] Install completes → app launches from Start Menu shortcut
- [ ] Uninstall → `%APPDATA%\ApexAI\` still present with cached sessions

**Portable**
- [ ] `ApexAI-portable.exe` runs without installation
- [ ] Works from a directory with no write permissions to Program Files
