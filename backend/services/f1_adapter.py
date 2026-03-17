"""
Thin wrapper that calls f1_data and track_geometry, converting results to JSON-safe types.
Uses track_geometry (not ui_components) so the web backend runs without arcade.
"""

import gc
import math
from typing import Any

import numpy as np

from src.f1_data import (
    enable_cache,
    get_circuit_rotation,
    get_driver_colors,
    get_race_telemetry,
    get_quali_telemetry,
    get_qualifying_results,
    load_session,
)
from src.track_geometry import build_track_from_example_lap


def _sanitize(val):
    """Replace NaN/Inf floats with None so JSON serialization doesn't break."""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def _sanitize_dict(d: dict) -> dict:
    """Recursively sanitize a dict, replacing NaN/Inf with None."""
    out = {}
    for k, v in d.items():
        key = str(k) if not isinstance(k, str) else k
        if isinstance(v, dict):
            out[key] = _sanitize_dict(v)
        elif isinstance(v, list):
            out[key] = [_sanitize_dict(i) if isinstance(i, dict) else _sanitize(i) for i in v]
        else:
            out[key] = _sanitize(v)
    return out


def _rgb_to_hex(rgb: tuple) -> str:
    """Convert (r, g, b) tuple to #rrggbb hex string."""
    if rgb is None or len(rgb) != 3:
        return "#888888"
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    return f"#{r:02x}{g:02x}{b:02x}"


def _serialize_driver_colors(colors: dict[str, tuple]) -> dict[str, str]:
    """Convert driver_colors from dict[str, (r,g,b)] to dict[str, '#rrggbb']."""
    return {code: _rgb_to_hex(rgb) for code, rgb in (colors or {}).items()}


def _serialize_track(track_tuple: tuple) -> dict[str, Any]:
    """Convert build_track_from_example_lap result to JSON-safe dict."""
    (
        plot_x_ref,
        plot_y_ref,
        x_inner,
        y_inner,
        x_outer,
        y_outer,
        x_min,
        x_max,
        y_min,
        y_max,
        drs_zones,
    ) = track_tuple

    def to_list(arr) -> list:
        if hasattr(arr, "tolist"):
            return arr.tolist()
        return list(arr)

    def serialize_drs_zone(zone: dict) -> dict:
        return {
            "start": {
                "x": float(zone["start"]["x"]),
                "y": float(zone["start"]["y"]),
                "index": int(zone["start"]["index"]),
            },
            "end": {
                "x": float(zone["end"]["x"]),
                "y": float(zone["end"]["y"]),
                "index": int(zone["end"]["index"]),
            },
        }

    return {
        "centerline_x": to_list(plot_x_ref),
        "centerline_y": to_list(plot_y_ref),
        "inner_x": to_list(x_inner),
        "inner_y": to_list(y_inner),
        "outer_x": to_list(x_outer),
        "outer_y": to_list(y_outer),
        "x_min": float(x_min),
        "x_max": float(x_max),
        "y_min": float(y_min),
        "y_max": float(y_max),
        "drs_zones": [serialize_drs_zone(z) for z in drs_zones],
    }


def _get_example_lap(year: int, round_number: int, session_type: str, session):
    """Get example lap for track layout from the already-loaded session.

    Avoids loading a second session (e.g. qualifying) which would double RAM
    usage -- critical on Render free tier (512MB).
    """
    fastest_lap = session.laps.pick_fastest()
    if fastest_lap is not None:
        return fastest_lap.get_telemetry()
    return None


def _np_to_list(arr) -> list:
    """Convert a numpy array to a plain Python list, replacing NaN/Inf with 0."""
    if arr is None:
        return []
    cleaned = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    return cleaned.tolist()


def get_replay_data(
    year: int,
    round_number: int,
    session_type: str = "R",
    keyframe_interval: int = 5,
) -> dict:
    """
    Load session, get race telemetry, build track, and return JSON-serializable payload.
    Now returns the columnar format instead of per-frame dicts.

    keyframe_interval: seconds between samples. 5 = 1 sample per 5 sec (~10x smaller).
        0 = full 2fps.
    """
    enable_cache()

    session = load_session(year, round_number, session_type)

    if keyframe_interval > 0:
        target_fps = 1.0 / keyframe_interval
    else:
        target_fps = 2.0

    if session_type in ("R", "S"):
        telemetry = get_race_telemetry(
            session, session_type=session_type, target_fps=target_fps
        )
    else:
        raise ValueError(f"Session type {session_type} not supported for replay (use R or S)")

    example_lap = _get_example_lap(year, round_number, session_type, session)
    if example_lap is None:
        raise ValueError("No valid laps found in session")

    track_tuple = build_track_from_example_lap(example_lap)
    track = _serialize_track(track_tuple)
    circuit_rotation = float(get_circuit_rotation(session))

    event_date = session.event.get("EventDate", "")
    session_info = {
        "event_name": session.event.get("EventName", ""),
        "circuit_name": session.event.get("Location", ""),
        "country": session.event.get("Country", ""),
        "year": year,
        "round": round_number,
        "date": (
            event_date.strftime("%B %d, %Y")
            if hasattr(event_date, "strftime")
            else str(event_date)
        ),
        "total_laps": int(telemetry["total_laps"]),
        "circuit_length_m": (
            float(example_lap["Distance"].max())
            if "Distance" in example_lap
            else None
        ),
    }

    del session, example_lap, track_tuple
    gc.collect()

    drivers_columnar = {}
    for code, arrays in telemetry["drivers"].items():
        drivers_columnar[code] = {
            field: _np_to_list(arr)
            for field, arr in arrays.items()
        }

    weather_timeline = None
    raw_weather = telemetry.get("weather")
    if raw_weather:
        weather_timeline = {}
        for wk, wv in raw_weather.items():
            weather_timeline[wk] = _np_to_list(wv) if wv is not None else None
        if weather_timeline.get("rainfall") is not None:
            rain_arr = np.asarray(raw_weather["rainfall"])
            weather_timeline["rain_state"] = [
                "RAINING" if v >= 0.5 else "DRY" for v in np.nan_to_num(rain_arr)
            ]

    raw_mtl = telemetry.get("max_tyre_life", {})
    max_tyre_life = {str(k): _sanitize(v) for k, v in raw_mtl.items()}

    # Extract all remaining references from telemetry before freeing the numpy arrays
    timeline_list = _np_to_list(telemetry["timeline"])
    leader_laps_list = _np_to_list(telemetry["leader_laps"])
    driver_colors_out = _serialize_driver_colors(telemetry["driver_colors"])
    track_statuses = telemetry.get("track_statuses", [])
    total_laps = int(telemetry["total_laps"])
    del telemetry
    gc.collect()

    return {
        "columnar": True,
        "cache_version": 2,
        "keyframe_interval": keyframe_interval,
        "timeline": timeline_list,
        "leader_laps": leader_laps_list,
        "drivers": drivers_columnar,
        "weather_timeline": weather_timeline,
        "driver_colors": driver_colors_out,
        "track_statuses": track_statuses,
        "total_laps": total_laps,
        "max_tyre_life": max_tyre_life,
        "track": track,
        "circuit_rotation": circuit_rotation,
        "session_info": session_info,
    }


def get_qualifying_data(year: int, round_number: int, session_type: str = "Q") -> dict:
    """Load qualifying session and return results + driver colors.
    Loads without telemetry (saves ~150-400MB) since only session.results is needed.
    """
    enable_cache()
    session = load_session(year, round_number, session_type, telemetry=False, weather=False)
    raw_results = get_qualifying_results(session)
    quali_data = {"results": raw_results, "max_speed": 0, "min_speed": 0}

    # Extract session_info before freeing session (saves ~150-250MB on Render)
    event_date = session.event.get("EventDate", "")
    session_info = {
        "event_name": session.event.get("EventName", ""),
        "circuit_name": session.event.get("Location", ""),
        "country": session.event.get("Country", ""),
        "year": year,
        "round": round_number,
        "date": (
            event_date.strftime("%B %d, %Y")
            if hasattr(event_date, "strftime")
            else str(event_date)
        ),
    }

    del session
    gc.collect()

    # Sanitize results - driver colors are tuples
    results = quali_data.get("results", [])
    sanitized_results = []
    for r in results:
        entry = {**r}
        if "color" in entry:
            entry["color"] = _rgb_to_hex(entry["color"])
        sanitized_results.append(entry)

    return {
        "results": sanitized_results,
        "max_speed": quali_data.get("max_speed", 0),
        "min_speed": quali_data.get("min_speed", 0),
        "session_info": session_info,
    }
