"""Replay data endpoint - frames, track geometry, session info."""

import gc
import logging

import orjson
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response

from backend.services.cache import (
    replay_get, replay_set,
    quali_get, quali_set,
    replay_get_compressed, quali_get_compressed,
)
from backend.services.f1_adapter import get_replay_data
from backend.services import tasks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/replay", tags=["replay"])


@router.get("")
def get_replay(
    year: int = Query(..., ge=2018, description="Season year"),
    round_number: int = Query(..., ge=1, le=24, alias="round", description="Round number"),
    session: str = Query("R", description="Session type: R (Race), S (Sprint)"),
    keyframe_interval: int = Query(5, ge=0, description="Seconds between keyframes. 5 = smaller payload, browser interpolates. 0 = full 2fps."),
):
    """
    Return full replay payload (columnar format).  Checks Supabase cache first.
    On cache miss, starts a background task and returns 202 so the frontend
    can poll /replay/status until the data is ready.
    """
    if session not in ("R", "S"):
        raise HTTPException(status_code=400, detail="session must be R (Race) or S (Sprint)")

    try:
        # Fast path: serve raw gzip bytes directly — skips decompress+parse+re-encode (~100-200MB saving)
        try:
            raw_gz = replay_get_compressed(year, round_number, session)
            if raw_gz:
                logger.info("Serving replay (compressed passthrough): %d/%d/%s", year, round_number, session)
                gc.collect()
                return Response(
                    content=raw_gz,
                    media_type="application/json",
                    headers={"Content-Encoding": "gzip"},
                )
        except Exception as e:
            logger.warning("Compressed cache read failed, falling back to dict path: %s", e)

        # Slow path: in-memory LRU fallback (no Supabase, or compressed path failed)
        data = None
        try:
            data = replay_get(year, round_number, session)
            if data:
                logger.info("Serving replay from memory cache: %d/%d/%s", year, round_number, session)
        except Exception as e:
            logger.warning("Cache read failed: %s", e)

        if data is not None:
            content = orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY)
            gc.collect()
            return Response(content=content, media_type="application/json")

        existing = tasks.find_active_task(year, round_number, session)
        if existing:
            return JSONResponse(
                status_code=202,
                content={"status": "computing", "task_id": existing},
            )

        task_id = tasks.create_task(year, round_number, session)
        tasks.start_replay_task(task_id, year, round_number, session)

        return JSONResponse(
            status_code=202,
            content={"status": "computing", "task_id": task_id},
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def get_task_status(task_id: str = Query(..., description="Task ID from 202 response")):
    """Poll this endpoint to check if a background computation has finished."""
    task = tasks.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Unknown task_id")

    return {
        "task_id": task_id,
        "status": task["status"],
        "progress": task.get("progress"),
        "error": task.get("error"),
    }


@router.get("/qualifying")
def get_qualifying(
    year: int = Query(..., ge=2018, description="Season year"),
    round_number: int = Query(..., ge=1, le=24, alias="round", description="Round number"),
    session: str = Query("Q", description="Session type: Q (Qualifying), SQ (Sprint Qualifying)"),
):
    """Return qualifying results.  Uses Supabase L2 cache; falls back to background task on miss."""
    if session not in ("Q", "SQ"):
        raise HTTPException(status_code=400, detail="session must be Q or SQ")

    try:
        # Fast path: serve raw gzip bytes directly
        try:
            raw_gz = quali_get_compressed(year, round_number, session)
            if raw_gz:
                logger.info("Serving qualifying (compressed passthrough): %d/%d/%s", year, round_number, session)
                gc.collect()
                return Response(
                    content=raw_gz,
                    media_type="application/json",
                    headers={"Content-Encoding": "gzip"},
                )
        except Exception as e:
            logger.warning("Compressed qualifying cache read failed, falling back: %s", e)

        # Slow path: in-memory LRU fallback
        data = None
        try:
            data = quali_get(year, round_number, session)
            if data:
                logger.info("Serving qualifying from memory cache: %d/%d/%s", year, round_number, session)
        except Exception as e:
            logger.warning("Qualifying cache read failed: %s", e)

        if data is not None:
            content = orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY)
            return Response(content=content, media_type="application/json")

        existing = tasks.find_active_task(year, round_number, session)
        if existing:
            return JSONResponse(
                status_code=202,
                content={"status": "computing", "task_id": existing},
            )

        task_id = tasks.create_task(year, round_number, session)
        tasks.start_qualifying_task(task_id, year, round_number, session)

        return JSONResponse(
            status_code=202,
            content={"status": "computing", "task_id": task_id},
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
