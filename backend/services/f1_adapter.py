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
    """Get example lap for track layout (quali preferred for DRS, else race fastest)."""
    example_lap = None

    if session_type in ("R", "S"):
        try:
            quali_session = load_session(year, round_number, "Q")
            if quali_session is not None and len(quali_session.laps) > 0:
                fastest_quali = quali_session.laps.pick_fastest()
                if fastest_quali is not None:
                    quali_telemetry = fastest_quali.get_telemetry()
                    if "DRS" in quali_telemetry.columns:
                        example_lap = quali_telemetry
        except Exception:
            pass

    if example_lap is None:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is not None:
            example_lap = fastest_lap.get_telemetry()

    return example_lap


def get_replay_data(year: int, round_number: int, session_type: str = "R") -> dict:
    """
    Load session, get race telemetry, build track, and return JSON-serializable payload.
    """
    enable_cache()

    session = load_session(year, round_number, session_type)

    if session_type in ("R", "S"):
        telemetry = get_race_telemetry(session, session_type=session_type)
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


def get_strategy_data(year: int, round_number: int, session_type: str = "R") -> dict:
    """Return tyre strategy stints per driver for the session."""
    enable_cache()
    session = load_session(year, round_number, session_type)
    driver_colors = _serialize_driver_colors(get_driver_colors(session))
    result = []
    for driver_no in session.drivers:
        try:
            code = session.get_driver(driver_no)["Abbreviation"]
        except Exception:
            continue
        team_color = driver_colors.get(code, "#888888")
        laps = session.laps.pick_drivers(driver_no)
        if laps.empty or "Stint" not in laps.columns:
            result.append({"driver": code, "team_color": team_color, "stints": []})
            continue
        stints = []
        for stint_num, stint_laps in laps.groupby("Stint"):
            if stint_laps.empty:
                continue
            compound = str(stint_laps["Compound"].iloc[0]) if "Compound" in stint_laps.columns else "UNKNOWN"
            start_lap = int(stint_laps["LapNumber"].min())
            end_lap = int(stint_laps["LapNumber"].max())
            lap_times = stint_laps["LapTime"].dropna()
            avg_s = _sanitize(float(lap_times.dt.total_seconds().mean())) if len(lap_times) > 0 else None
            pit_stop_lap = int(start_lap - 1) if int(stint_num) > 1 else None
            stints.append({
                "stint": int(stint_num),
                "compound": compound.upper(),
                "start_lap": start_lap,
                "end_lap": end_lap,
                "lap_count": end_lap - start_lap + 1,
                "avg_lap_time_s": avg_s,
                "pit_stop_lap_before": pit_stop_lap,
            })
        result.append({"driver": code, "team_color": team_color, "stints": stints})
    return {
        "drivers": result,
        "session_info": {"event_name": session.event.get("EventName", ""), "year": year, "round": round_number},
    }


def _car_data_samples(car_data, max_samples: int = 100) -> list[dict]:
    """Downsample a lap's car data to at most max_samples rows."""
    n = len(car_data)
    step = max(1, n // max_samples)
    samples = []
    for _, row in car_data.iloc[::step].iterrows():
        t = row["Time"]
        samples.append({
            "t": _sanitize(float(t.total_seconds()) if hasattr(t, "total_seconds") else float(t)),
            "speed": _sanitize(float(row["Speed"])) if "Speed" in row else None,
            "throttle": _sanitize(float(row["Throttle"])) if "Throttle" in row else None,
            "brake": _sanitize(float(row["Brake"])) if "Brake" in row else None,
            "gear": _sanitize(int(row["nGear"])) if "nGear" in row else None,
            "drs": _sanitize(int(row["DRS"])) if "DRS" in row else None,
            "rpm": _sanitize(float(row["RPM"])) if "RPM" in row else None,
        })
    return samples


def get_telemetry_data(year: int, round_number: int, session_type: str, driver: str) -> dict:
    """Return per-lap telemetry traces (~100 samples/lap) for a single driver."""
    enable_cache()
    session = load_session(year, round_number, session_type)
    driver_laps = session.laps.pick_drivers(driver)
    if driver_laps.empty:
        raise ValueError(f"No laps found for driver {driver}")
    laps_out = []
    for _, lap in driver_laps.iterlaps():
        try:
            car_data = lap.get_car_data()
        except Exception:
            continue
        if car_data is None or car_data.empty:
            continue
        laps_out.append({"lap_number": int(lap.LapNumber), "samples": _car_data_samples(car_data)})
    return {"driver": driver, "laps": laps_out}


def get_lap_data(year: int, round_number: int, session_type: str, driver: str, lap_number: int) -> dict:
    """Return telemetry + sector times for a single lap."""
    enable_cache()
    session = load_session(year, round_number, session_type)
    driver_laps = session.laps.pick_drivers(driver)
    if driver_laps.empty:
        raise ValueError(f"No laps found for driver {driver}")
    lap_rows = driver_laps[driver_laps["LapNumber"] == lap_number]
    if lap_rows.empty:
        raise ValueError(f"Lap {lap_number} not found for driver {driver}")
    lap = lap_rows.iloc[0]
    try:
        car_data = lap.get_car_data()
    except Exception as e:
        raise ValueError(f"Could not load car data for lap {lap_number}: {e}")
    if car_data is None or car_data.empty:
        raise ValueError(f"No car data for lap {lap_number}")

    def _td_s(td):
        try:
            return _sanitize(float(td.total_seconds()))
        except Exception:
            return None

    return {
        "driver": driver,
        "lap_number": lap_number,
        "lap_time_s": _td_s(lap.get("LapTime")),
        "sector_times": [_td_s(lap.get("Sector1Time")), _td_s(lap.get("Sector2Time")), _td_s(lap.get("Sector3Time"))],
        "telemetry": {"samples": _car_data_samples(car_data)},
    }


def get_compare_data(year: int, round_number: int, session_type: str, driver_a: str, driver_b: str) -> dict:
    """Return aligned position+speed frames for two drivers + gap series."""
    import bisect
    enable_cache()
    session = load_session(year, round_number, session_type)

    def _driver_frames(driver: str) -> list[dict]:
        laps = session.laps.pick_drivers(driver)
        if laps.empty:
            raise ValueError(f"No laps found for driver {driver}")
        frames = []
        for _, lap in laps.iterlaps():
            try:
                pos = lap.get_pos_data()
                car = lap.get_car_data()
            except Exception:
                continue
            if pos is None or pos.empty:
                continue
            n = len(pos)
            step = max(1, n // 50)
            car_step = car.iloc[::step] if car is not None and not car.empty else None
            for i, (_, row) in enumerate(pos.iloc[::step].iterrows()):
                t = row["Time"]
                entry = {
                    "t": _sanitize(float(t.total_seconds()) if hasattr(t, "total_seconds") else float(t)),
                    "lap": int(lap.LapNumber),
                    "x": _sanitize(float(row["X"])) if "X" in row else None,
                    "y": _sanitize(float(row["Y"])) if "Y" in row else None,
                    "rel_dist": _sanitize(float(row["RelativeDistance"])) if "RelativeDistance" in row else None,
                }
                if car_step is not None and i < len(car_step):
                    entry["speed"] = _sanitize(float(car_step.iloc[i]["Speed"])) if "Speed" in car_step.columns else None
                frames.append(entry)
        return frames

    frames_a = _driver_frames(driver_a)
    frames_b = _driver_frames(driver_b)

    times_b = [s["t"] for s in frames_b if s["t"] is not None]
    gap_series = []
    for sa in frames_a:
        ta = sa.get("t")
        if ta is None or not times_b:
            continue
        idx = min(bisect.bisect_left(times_b, ta), len(times_b) - 1)
        gap_series.append({"t": _sanitize(ta), "gap_s": _sanitize(ta - times_b[idx])})

    return {"driver_a": driver_a, "driver_b": driver_b, "frames_a": frames_a, "frames_b": frames_b, "gap_series": gap_series}


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
