# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the ApexAI backend.
Produces a --onedir bundle: desktop-backend/dist/apex-ai-backend/
Run from the project root:
  pyinstaller desktop-backend/apex-ai-backend.spec
"""
import sys
import os
from pathlib import Path

block_cipher = None

# Locate FastF1 data files
import fastf1
FASTF1_DIR = Path(fastf1.__file__).parent

# Collect all data files from FastF1 (circuits, etc.)
fastf1_datas = []
for p in FASTF1_DIR.rglob("*"):
    if p.is_file() and p.suffix not in (".py", ".pyc"):
        rel = str(p.parent.relative_to(FASTF1_DIR.parent))
        fastf1_datas.append((str(p), rel))

a = Analysis(
    ["desktop-backend/main.py"],
    pathex=["."],
    binaries=[],
    datas=fastf1_datas + [
        ("backend", "backend"),
        ("src", "src"),
    ],
    hiddenimports=[
        # uvicorn internals
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # fastapi / starlette
        "fastapi",
        "starlette",
        "starlette.middleware.cors",
        "starlette.middleware.gzip",
        # data
        "orjson",
        "cachetools",
        "pandas",
        "numpy",
        "fastf1",
        "matplotlib",
        "matplotlib.backends.backend_agg",
        # multiprocessing support
        "multiprocessing",
        "multiprocessing.freeze_support",
    ],
    excludes=[
        "arcade", "pyside6", "pygame", "pyglet",
        "questionary", "rich", "tkinter", "wx",
        "PyQt5", "PyQt6", "PySide2",
        "supabase",  # not needed in desktop mode
        "IPython", "jupyter", "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="apex-ai-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # hide console window
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="apex-ai-backend",
)
