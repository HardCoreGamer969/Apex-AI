"""
Thin wrapper that calls f1_data and ui_components, converting results to JSON-safe types.
"""

import math
from typing import Any

from src.f1_data import (
    enable_cache,
    get_circuit_rotation,
    get_driver_colors,
    get_race_telemetry,
    get_quali_telemetry,
    load_session,
)
from src.ui_components import build_track_from_example_lap


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


def get_replay_data(year: int, round_number: int, session_type: str = "R") -> dict:
    """
    Load session, get race telemetry, build track, and return JSON-serializable payload.
    """
    enable_cache()

    session = load_session(year, round_number, session_type)

    if session_type in ("R", "S"):
        telemetry = get_race_telemetry(session, session_type=session_type, target_fps=5)
    else:
        raise ValueError(f"Session type {session_type} not supported for replay (use R or S)")

    example_lap = _get_example_lap(year, round_number, session_type, session)
    if example_lap is None:
        raise ValueError("No valid laps found in session")

    track_tuple = build_track_from_example_lap(example_lap)
    track = _serialize_track(track_tuple)
    circuit_rotation = float(get_circuit_rotation(session))

    DRIVER_FIELDS = {"x", "y", "position", "lap", "speed", "tyre"}

    def _slim_frame(frame: dict) -> dict:
        """Strip per-driver fields the frontend doesn't need to halve payload."""
        out = {"t": frame["t"], "lap": frame["lap"]}
        drivers = {}
        for code, d in frame.get("drivers", {}).items():
            drivers[code] = {k: d[k] for k in DRIVER_FIELDS if k in d}
        out["drivers"] = drivers
        if "weather" in frame:
            out["weather"] = frame["weather"]
        return out

    # Slim → sanitize frames — NaN/Inf from numpy interpolation would break JSON
    sanitized_frames = [_sanitize_dict(_slim_frame(f)) for f in telemetry["frames"]]

    # max_tyre_life may have numpy-float keys; convert to str
    raw_mtl = telemetry.get("max_tyre_life", {})
    max_tyre_life = {str(k): _sanitize(v) for k, v in raw_mtl.items()}

    return {
        "frames": sanitized_frames,
        "driver_colors": _serialize_driver_colors(telemetry["driver_colors"]),
        "track_statuses": telemetry.get("track_statuses", []),
        "total_laps": int(telemetry["total_laps"]),
        "max_tyre_life": max_tyre_life,
        "track": track,
        "circuit_rotation": circuit_rotation,
        "session_info": {
            "event_name": session.event.get("EventName", ""),
            "circuit_name": session.event.get("Location", ""),
            "country": session.event.get("Country", ""),
            "year": year,
            "round": round_number,
            "date": (
                session.event.get("EventDate", "").strftime("%B %d, %Y")
                if hasattr(session.event.get("EventDate"), "strftime")
                else str(session.event.get("EventDate", ""))
            ),
            "total_laps": int(telemetry["total_laps"]),
            "circuit_length_m": (
                float(example_lap["Distance"].max())
                if "Distance" in example_lap
                else None
            ),
        },
    }


def get_qualifying_data(year: int, round_number: int, session_type: str = "Q") -> dict:
    """Load qualifying session and return results + driver colors."""
    enable_cache()
    session = load_session(year, round_number, session_type)
    quali_data = get_quali_telemetry(session, session_type=session_type)

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
        "session_info": {
            "event_name": session.event.get("EventName", ""),
            "circuit_name": session.event.get("Location", ""),
            "country": session.event.get("Country", ""),
            "year": year,
            "round": round_number,
            "date": (
                session.event.get("EventDate", "").strftime("%B %d, %Y")
                if hasattr(session.event.get("EventDate"), "strftime")
                else str(session.event.get("EventDate", ""))
            ),
        },
    }
