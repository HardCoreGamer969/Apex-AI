"""Replay data endpoint - frames, track geometry, session info."""

import gc
import logging

import orjson
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.services.cache import replay_get, replay_set
from backend.services.f1_adapter import get_replay_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/replay", tags=["replay"])


@router.get("")
def get_replay(
    year: int = Query(..., ge=2018, description="Season year"),
    round_number: int = Query(..., ge=1, le=24, alias="round", description="Round number"),
    session: str = Query("R", description="Session type: R (Race), S (Sprint)"),
    stride: int = Query(5, ge=1, le=25, description="Take every Nth frame (1=all 25fps, 5=5fps, etc.)"),
):
    """
    Load session, compute telemetry, build track, and return full replay payload.
    Checks L2 cache first; on miss computes and stores for future requests.
    `stride` downsamples frames to reduce payload size.
    """
    if session not in ("R", "S"):
        raise HTTPException(status_code=400, detail="session must be R (Race) or S (Sprint)")
    try:
        data = None
        try:
            data = replay_get(year, round_number, session)
            if data:
                logger.info("Serving replay from cache: %d/%d/%s", year, round_number, session)
        except Exception as e:
            logger.warning("Cache read failed, computing fresh: %s", e)

        if data is None:
            data = get_replay_data(year=year, round_number=round_number, session_type=session)
            try:
                replay_set(year, round_number, session, data)
            except Exception as e:
                logger.warning("Cache write failed: %s", e)

        if stride > 1:
            data = {**data, "frames": data["frames"][::stride]}

        content = orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY)
        gc.collect()  # Free memory after heavy processing (Render 512MB limit)
        return Response(content=content, media_type="application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qualifying")
def get_qualifying(
    year: int = Query(..., ge=2018, description="Season year"),
    round_number: int = Query(..., ge=1, le=24, alias="round", description="Round number"),
    session: str = Query("Q", description="Session type: Q (Qualifying), SQ (Sprint Qualifying)"),
):
    """Return qualifying results (positions, times per segment)."""
    if session not in ("Q", "SQ"):
        raise HTTPException(status_code=400, detail="session must be Q or SQ")
    try:
        from backend.services.f1_adapter import get_qualifying_data
        data = get_qualifying_data(year=year, round_number=round_number, session_type=session)
        content = orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY)
        return Response(content=content, media_type="application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
