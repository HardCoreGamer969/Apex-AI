# Build script for ApexAI Windows Desktop (.exe)
# Run from the project root: .\scripts\build-desktop.ps1
#
# Prerequisites:
#   - Node.js 18+, npm
#   - Python 3.11+ with uv installed
#   - pyinstaller: uv run pip install pyinstaller
#   - Run: cd desktop && npm install (first time)

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipPackage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=== ApexAI Desktop Build ===" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Frontend ──────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host "[1/3] Building frontend (Vite)..." -ForegroundColor Yellow
    Push-Location "$Root\frontend"
    npm install --silent
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
    Pop-Location
    Write-Host "      Frontend built -> frontend/dist/" -ForegroundColor Green
} else {
    Write-Host "[1/3] Skipping frontend build (-SkipFrontend)" -ForegroundColor Gray
}

# ── Step 2: PyInstaller backend ───────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Host "[2/3] Building Python backend (PyInstaller)..." -ForegroundColor Yellow
    Push-Location $Root

    # Install pyinstaller if not present
    $pip = uv run python -c "import PyInstaller" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      Installing PyInstaller..." -ForegroundColor Gray
        uv run pip install pyinstaller
    }

    uv run pyinstaller `
        desktop-backend/apex-ai-backend.spec `
        --distpath desktop-backend/dist `
        --workpath desktop-backend/build `
        --noconfirm
    if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller build failed"; exit 1 }
    Pop-Location
    Write-Host "      Backend built -> desktop-backend/dist/apex-ai-backend/" -ForegroundColor Green
} else {
    Write-Host "[2/3] Skipping backend build (-SkipBackend)" -ForegroundColor Gray
}

# ── Step 3: Electron package ──────────────────────────────────────────────────
if (-not $SkipPackage) {
    Write-Host "[3/3] Packaging with electron-builder..." -ForegroundColor Yellow
    Push-Location "$Root\desktop"
    npm install --silent
    npx electron-builder --win
    if ($LASTEXITCODE -ne 0) { Write-Error "electron-builder failed"; exit 1 }
    Pop-Location
    Write-Host "      Installer -> desktop/dist/" -ForegroundColor Green
} else {
    Write-Host "[3/3] Skipping electron-builder (-SkipPackage)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Build complete! ===" -ForegroundColor Cyan
Write-Host "Installer: $Root\desktop\dist\ApexAI Setup*.exe" -ForegroundColor White
Write-Host ""
