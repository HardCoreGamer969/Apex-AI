"""Admin endpoints for cache management and pre-computation.

Protected by ADMIN_SECRET env var.  Trigger via cron service (e.g.
cron-job.org, GitHub Actions) to pre-populate the Supabase cache for
recent/popular sessions so user requests are instant.
"""

import logging
import os

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from backend.services import tasks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")


def _check_auth(authorization: str | None):
    if not ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="ADMIN_SECRET not configured")
    if authorization != f"Bearer {ADMIN_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


class PrecomputeRequest(BaseModel):
    sessions: list[dict]  # [{"year": 2024, "round": 1, "session": "R"}, ...]


@router.post("/precompute")
def precompute(
    body: PrecomputeRequest,
    authorization: str | None = Header(None),
):
    """Kick off background computation for a list of sessions.

    Each item in `sessions` should have `year`, `round`, and `session` keys.
    Returns the task IDs so the caller can poll /replay/status for each.
    """
    _check_auth(authorization)

    started = []
    for item in body.sessions:
        year = item.get("year")
        round_number = item.get("round")
        session = item.get("session", "R")

        if not isinstance(year, int) or not isinstance(round_number, int):
            continue

        existing = tasks.find_active_task(year, round_number, session)
        if existing:
            started.append({"year": year, "round": round_number, "session": session, "task_id": existing, "new": False})
            continue

        task_id = tasks.create_task(year, round_number, session)
        if session in ("R", "S"):
            tasks.start_replay_task(task_id, year, round_number, session)
        elif session in ("Q", "SQ"):
            tasks.start_qualifying_task(task_id, year, round_number, session)
        else:
            continue

        started.append({"year": year, "round": round_number, "session": session, "task_id": task_id, "new": True})

    return {"started": started}


@router.post("/cleanup")
def cleanup_tasks(authorization: str | None = Header(None)):
    """Remove old completed/errored tasks from memory."""
    _check_auth(authorization)
    tasks.cleanup_old_tasks()
    return {"status": "ok"}
