"""
Lightweight in-memory task tracker for long-running computations.

On Render free tier, FastF1 session loads can take 1-5 minutes.  Instead of
blocking the HTTP request (which risks timeout), the replay endpoint returns
a 202 with a task_id and kicks off computation in a background thread.  The
frontend polls /replay/status?task_id=... until the result is cached.
"""

import gc
import logging
import threading
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_tasks: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()

# Only one heavy computation at a time (Render free tier = 512MB)
_compute_semaphore = threading.Semaphore(1)

# Prevent duplicate computations for the same session
_active_keys: dict[str, str] = {}  # cache_key -> task_id


def _cache_key(year: int, round_number: int, session: str) -> str:
    return f"{year}/{round_number}/{session}"


def get_task(task_id: str) -> dict | None:
    with _lock:
        return _tasks.get(task_id)


def find_active_task(year: int, round_number: int, session: str) -> str | None:
    """Return the task_id if a computation for this session is already running."""
    key = _cache_key(year, round_number, session)
    with _lock:
        tid = _active_keys.get(key)
        if tid and tid in _tasks:
            status = _tasks[tid]["status"]
            if status in ("pending", "computing"):
                return tid
        return None


def create_task(year: int, round_number: int, session: str) -> str:
    task_id = uuid.uuid4().hex[:12]
    key = _cache_key(year, round_number, session)
    with _lock:
        _tasks[task_id] = {
            "status": "pending",
            "progress": None,
            "error": None,
            "year": year,
            "round": round_number,
            "session": session,
            "created_at": time.time(),
        }
        _active_keys[key] = task_id
    return task_id


def update_task(task_id: str, **kwargs) -> None:
    with _lock:
        if task_id in _tasks:
            _tasks[task_id].update(kwargs)


def start_replay_task(
    task_id: str,
    year: int,
    round_number: int,
    session: str,
) -> None:
    """Run replay computation in a background thread, storing result in Supabase."""

    def _worker():
        with _compute_semaphore:
            from backend.services.cache import replay_set
            from backend.services.f1_adapter import get_replay_data

            update_task(task_id, status="computing", progress="Loading session...")
            try:
                data = get_replay_data(
                    year=year,
                    round_number=round_number,
                    session_type=session,
                    keyframe_interval=5,
                )
                update_task(task_id, progress="Saving to cache...")
                try:
                    replay_set(year, round_number, session, data)
                except Exception as e:
                    logger.warning("Cache write failed for task %s: %s", task_id, e)

                update_task(task_id, status="ready", progress="Done")
                gc.collect()
            except Exception as e:
                logger.exception("Task %s failed: %s", task_id, e)
                update_task(task_id, status="error", error=str(e))
            finally:
                key = _cache_key(year, round_number, session)
                with _lock:
                    _active_keys.pop(key, None)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def start_qualifying_task(
    task_id: str,
    year: int,
    round_number: int,
    session: str,
) -> None:
    """Run qualifying computation in a background thread, storing result in Supabase."""

    def _worker():
        with _compute_semaphore:
            from backend.services.cache import quali_set
            from backend.services.f1_adapter import get_qualifying_data

            update_task(task_id, status="computing", progress="Loading qualifying session...")
            try:
                data = get_qualifying_data(
                    year=year,
                    round_number=round_number,
                    session_type=session,
                )
                update_task(task_id, progress="Saving to cache...")
                try:
                    quali_set(year, round_number, session, data)
                except Exception as e:
                    logger.warning("Cache write failed for quali task %s: %s", task_id, e)

                update_task(task_id, status="ready", progress="Done")
                gc.collect()
            except Exception as e:
                logger.exception("Qualifying task %s failed: %s", task_id, e)
                update_task(task_id, status="error", error=str(e))
            finally:
                key = _cache_key(year, round_number, session)
                with _lock:
                    _active_keys.pop(key, None)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def cleanup_old_tasks(max_age_seconds: int = 3600) -> None:
    """Remove completed/errored tasks older than max_age_seconds."""
    now = time.time()
    with _lock:
        to_remove = [
            tid
            for tid, t in _tasks.items()
            if t["status"] in ("ready", "error")
            and (now - t.get("created_at", 0)) > max_age_seconds
        ]
        for tid in to_remove:
            del _tasks[tid]
