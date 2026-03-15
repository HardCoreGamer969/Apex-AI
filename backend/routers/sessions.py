"""Session list and metadata endpoints."""

from fastapi import APIRouter, HTTPException, Query

from backend.services.cache import l1_get, l1_set
from src.f1_data import enable_cache, get_all_unique_race_names, get_race_weekends_by_place, get_race_weekends_by_year
from src.lib.season import get_season

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
def list_sessions(
    year: int | None = Query(None, description="Filter by year"),
    place: str | None = Query(None, description="Filter by race place/name"),
) -> list:
    """
    Get list of race weekends.
    Results are cached in-memory for 24h to avoid repeated FastF1 API calls.
    """
    if place:
        cache_key = f"sessions:place:{place}"
    else:
        y = year if year is not None else get_season()
        cache_key = f"sessions:year:{y}"

    cached = l1_get(cache_key)
    if cached is not None:
        return cached

    enable_cache()
    try:
        if place:
            result = get_race_weekends_by_place(place)
        else:
            y = year if year is not None else get_season()
            result = get_race_weekends_by_year(y)
        l1_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/race-names")
def list_race_names(
    start_year: int = Query(2018, ge=2018),
    end_year: int = Query(2025, le=2030),
) -> list[str]:
    """Get all unique race names for dropdown/filter. Cached in-memory for 24h."""
    cache_key = f"race_names:{start_year}_{end_year}"

    cached = l1_get(cache_key)
    if cached is not None:
        return cached

    enable_cache()
    try:
        result = get_all_unique_race_names(start_year=start_year, end_year=end_year)
        l1_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
