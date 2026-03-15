"""Replay data endpoint - frames, track geometry, session info."""

import orjson
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.services.f1_adapter import get_replay_data

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
    Uses orjson for fast serialization. `stride` downsamples frames to reduce payload size.
    stride=5 means ~5 FPS (every 5th frame of the 25 FPS source), reducing payload ~5x.
    """
    if session not in ("R", "S"):
        raise HTTPException(status_code=400, detail="session must be R (Race) or S (Sprint)")
    try:
        data = get_replay_data(year=year, round_number=round_number, session_type=session)
        if stride > 1:
            data["frames"] = data["frames"][::stride]
        content = orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY)
        return Response(content=content, media_type="application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
