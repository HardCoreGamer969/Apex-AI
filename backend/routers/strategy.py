"""Tyre strategy endpoint — stints per driver for a session."""

import logging

import orjson
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.services.cache import l1_get, l1_set
from backend.services.f1_adapter import get_strategy_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/strategy", tags=["strategy"])


@router.get("")
def get_strategy(
    year: int = Query(..., ge=2018),
    round_number: int = Query(..., ge=1, le=24, alias="round"),
    session: str = Query("R", description="Session type: R or S"),
):
    if session not in ("R", "S"):
        raise HTTPException(status_code=400, detail="session must be R or S")
    cache_key = f"strategy:{year}:{round_number}:{session}"
    cached = l1_get(cache_key)
    if cached is not None:
        logger.info("Strategy cache hit: %s", cache_key)
        return Response(content=orjson.dumps(cached), media_type="application/json")
    try:
        data = get_strategy_data(year=year, round_number=round_number, session_type=session)
        l1_set(cache_key, data)
        return Response(content=orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY), media_type="application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
