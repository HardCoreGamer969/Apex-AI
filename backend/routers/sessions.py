"""Session list and metadata endpoints."""

from fastapi import APIRouter, HTTPException, Query

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
    - If year is provided: returns weekends for that year.
    - If place is provided: returns past weekends for that place.
    - If neither: returns current year's schedule.
    """
    enable_cache()
    try:
        if place:
            return get_race_weekends_by_place(place)
        y = year if year is not None else get_season()
        return get_race_weekends_by_year(y)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/race-names")
def list_race_names(
    start_year: int = Query(2018, ge=2018),
    end_year: int = Query(2025, le=2030),
) -> list[str]:
    """Get all unique race names for dropdown/filter."""
    enable_cache()
    try:
        return get_all_unique_race_names(start_year=start_year, end_year=end_year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
