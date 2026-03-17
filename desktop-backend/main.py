"""
PyInstaller entry point for the ApexAI desktop backend.
Spawned by Electron on port 8765.
"""
import multiprocessing
import os
import sys


def main():
    # Ensure correct working directory when frozen
    if getattr(sys, "frozen", False):
        os.chdir(sys._MEIPASS)

    os.environ.setdefault("APEX_MODE", "desktop")
    os.environ.setdefault("MPLBACKEND", "Agg")

    import uvicorn
    from backend.main import app

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("APEX_PORT", "8765")),
        log_level="warning",
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
