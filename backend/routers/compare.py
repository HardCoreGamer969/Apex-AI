"""Head-to-head driver comparison endpoint."""

import logging

import orjson
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.services.cache import l1_get, l1_set
from backend.services.f1_adapter import get_compare_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compare", tags=["compare"])


@router.get("")
def get_compare(
    year: int = Query(..., ge=2018),
    round_number: int = Query(..., ge=1, le=24, alias="round"),
    session: str = Query("R", description="Session type: R, S, Q, SQ"),
    driver_a: str = Query(..., description="First driver abbreviation, e.g. VER"),
    driver_b: str = Query(..., description="Second driver abbreviation, e.g. HAM"),
):
    # Sort driver pair so VER+HAM and HAM+VER share the same cache entry
    pair = tuple(sorted([driver_a.upper(), driver_b.upper()]))
    cache_key = f"compare:{year}:{round_number}:{session}:{pair[0]}:{pair[1]}"
    cached = l1_get(cache_key)
    if cached is not None:
        logger.info("Compare cache hit: %s", cache_key)
        return Response(content=orjson.dumps(cached), media_type="application/json")
    try:
        data = get_compare_data(
            year=year, round_number=round_number, session_type=session,
            driver_a=driver_a.upper(), driver_b=driver_b.upper(),
        )
        l1_set(cache_key, data)
        return Response(content=orjson.dumps(data, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY), media_type="application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
