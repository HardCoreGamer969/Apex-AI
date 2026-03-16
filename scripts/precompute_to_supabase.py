#!/usr/bin/env python3
"""
Pre-compute replay data and upload to Supabase.

Runs in GitHub Actions (or locally) to populate the cache so Render serves
cache hits with minimal memory. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY.

Usage:
  uv run python scripts/precompute_to_supabase.py

Env:
  PRECOMPUTE_SESSIONS: JSON array of {"year": 2024, "round": 1, "session": "R"}, ...
  Default: 2024 rounds 1-6 (Race only)
"""

import json
import os
import sys

# Must set before importing fastf1/matplotlib
os.environ.setdefault("RENDER", "1")
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/mpl")

# Default sessions: 2024 rounds 1-6 (Race)
DEFAULT_SESSIONS = [
    {"year": 2024, "round": r, "session": "R"} for r in range(1, 7)
]


def main():
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    raw = os.environ.get("PRECOMPUTE_SESSIONS")
    if raw:
        try:
            sessions = json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid PRECOMPUTE_SESSIONS JSON: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        sessions = DEFAULT_SESSIONS

    from backend.services.f1_adapter import get_replay_data
    from backend.services.cache import replay_set

    for item in sessions:
        year = item.get("year")
        round_number = item.get("round")
        session = item.get("session", "R")

        if not isinstance(year, int) or not isinstance(round_number, int):
            print(f"Skipping invalid session: {item}")
            continue

        if session not in ("R", "S"):
            print(f"Skipping non-race session: {year}/{round_number}/{session}")
            continue

        print(f"Precomputing {year} round {round_number} {session}...")
        try:
            data = get_replay_data(
                year=year,
                round_number=round_number,
                session_type=session,
                keyframe_interval=5,
            )
            replay_set(year, round_number, session, data)
            print(f"  Done: {year}/{round_number}/{session}")
        except Exception as e:
            print(f"  Failed: {e}", file=sys.stderr)

    print("Precompute complete.")


if __name__ == "__main__":
    main()
