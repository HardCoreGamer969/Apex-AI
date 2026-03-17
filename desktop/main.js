'use strict';

const { app, BrowserWindow, Menu, Tray, shell, dialog, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const BACKEND_PORT = 8765;
const BACKEND_HOST = '127.0.0.1';
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const POLL_INTERVAL_MS = 500;
const STARTUP_TIMEOUT_MS = 60_000; // 60s to start backend
const IS_DEV = !app.isPackaged;

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let tray = null;
let backendProcess = null;
let backendReady = false;
let quitting = false;

// ─── Backend path resolution ─────────────────────────────────────────────────
function getBackendExe() {
  if (IS_DEV) {
    // Dev: look for PyInstaller output relative to this file
    const devPath = path.join(__dirname, '..', 'desktop-backend', 'dist', 'apex-ai-backend', 'apex-ai-backend.exe');
    if (fs.existsSync(devPath)) return devPath;
    // Fallback: run Python directly in dev if PyInstaller build isn't ready
    return null;
  }
  return path.join(process.resourcesPath, 'apex-ai-backend', 'apex-ai-backend.exe');
}

function getFrontendPath() {
  if (IS_DEV) {
    return path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  }
  return path.join(process.resourcesPath, 'frontend-dist', 'index.html');
}

// ─── Backend process management ──────────────────────────────────────────────
function startBackend() {
  const exePath = getBackendExe();

  if (!exePath) {
    // Dev fallback: run via uv if no PyInstaller build
    console.log('[backend] No compiled backend found — running via uv (dev mode)');
    const projectRoot = path.join(__dirname, '..');
    backendProcess = spawn('uv', [
      'run', 'uvicorn', 'backend.main:app',
      '--host', BACKEND_HOST,
      '--port', String(BACKEND_PORT),
      '--log-level', 'warning',
    ], {
      cwd: projectRoot,
      env: { ...process.env, APEX_MODE: 'desktop' },
      windowsHide: true,
    });
  } else {
    console.log('[backend] Starting:', exePath);
    backendProcess = spawn(exePath, [], {
      env: { ...process.env, APEX_MODE: 'desktop', APEX_PORT: String(BACKEND_PORT) },
      windowsHide: true,
    });
  }

  backendProcess.stdout?.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', (d) => console.error('[backend]', d.toString().trim()));

  backendProcess.on('exit', (code) => {
    if (!quitting) {
      dialog.showErrorBox(
        'ApexAI — Backend Crashed',
        `The backend process exited unexpectedly (code ${code}).\n\nPlease restart the app.`,
      );
      app.quit();
    }
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// ─── Health polling ───────────────────────────────────────────────────────────
function pollBackendHealth(resolve, reject, deadline) {
  if (Date.now() > deadline) {
    reject(new Error('Backend did not start within the timeout.'));
    return;
  }
  http.get(HEALTH_URL, (res) => {
    if (res.statusCode === 200) {
      resolve();
    } else {
      setTimeout(() => pollBackendHealth(resolve, reject, deadline), POLL_INTERVAL_MS);
    }
    res.resume();
  }).on('error', () => {
    setTimeout(() => pollBackendHealth(resolve, reject, deadline), POLL_INTERVAL_MS);
  });
}

function waitForBackend() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    pollBackendHealth(resolve, reject, deadline);
  });
}

// ─── Splash window ───────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 240,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0f0f0f',
  });

  const splashHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0f0f0f;
    color: #fff;
    font-family: -apple-system, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 20px;
  }
  h1 { font-size: 2rem; font-weight: 700; letter-spacing: 2px; color: #e10600; }
  p  { font-size: 0.85rem; color: #888; }
  .dots { display: flex; gap: 8px; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%; background: #e10600;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
</style>
</head>
<body>
  <h1>APEX AI</h1>
  <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  <p>Starting race viewer...</p>
</body>
</html>`;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
}

// ─── Main window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'ApexAI — F1 Race Viewer',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const frontendPath = getFrontendPath();
  if (fs.existsSync(frontendPath)) {
    mainWindow.loadFile(frontendPath);
  } else if (IS_DEV) {
    // Dev: load from Vite dev server if dist not built
    mainWindow.loadURL('http://localhost:5173');
  } else {
    dialog.showErrorBox('ApexAI', 'Frontend assets not found. Please reinstall.');
    app.quit();
    return;
  }

  buildMenu();

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
    if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── System tray ─────────────────────────────────────────────────────────────
function createTray() {
  // Use a simple 16x16 blank icon if no icon file exists
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('ApexAI — F1 Race Viewer');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show ApexAI', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Minimize to Tray', click: () => mainWindow?.hide() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Cache Folder',
          click: () => {
            const cacheDir = path.join(
              process.env.APPDATA || require('os').homedir(),
              'ApexAI', 'cache',
            );
            shell.openPath(cacheDir);
          },
        },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  startBackend();
  createTray();

  try {
    await waitForBackend();
    backendReady = true;
    createMainWindow();
  } catch (err) {
    dialog.showErrorBox(
      'ApexAI — Startup Failed',
      `Could not start the backend server.\n\n${err.message}\n\nPlease check that no other app is using port ${BACKEND_PORT}.`,
    );
    quitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (quitting) {
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  stopBackend();
  tray?.destroy();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});
