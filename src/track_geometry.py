"""
Track geometry computation from lap telemetry.
Extracted from ui_components so the web backend can use it without importing arcade.
"""

import numpy as np


def _plot_drs_zones(example_lap):
    """Extract DRS zone start/end points from lap telemetry."""
    x_val = example_lap["X"]
    y_val = example_lap["Y"]
    drs_zones = []
    drs_start = None

    for i, val in enumerate(example_lap["DRS"]):
        if val in [10, 12, 14]:
            if drs_start is None:
                drs_start = i
        else:
            if drs_start is not None:
                drs_end = i - 1
                zone = {
                    "start": {"x": float(x_val.iloc[drs_start]), "y": float(y_val.iloc[drs_start]), "index": drs_start},
                    "end": {"x": float(x_val.iloc[drs_end]), "y": float(y_val.iloc[drs_end]), "index": drs_end},
                }
                drs_zones.append(zone)
                drs_start = None

    if drs_start is not None:
        drs_end = len(example_lap["DRS"]) - 1
        zone = {
            "start": {"x": float(x_val.iloc[drs_start]), "y": float(y_val.iloc[drs_start]), "index": drs_start},
            "end": {"x": float(x_val.iloc[drs_end]), "y": float(y_val.iloc[drs_end]), "index": drs_end},
        }
        drs_zones.append(zone)

    return drs_zones


def build_track_from_example_lap(example_lap, track_width=200):
    """
    Build track centerline, inner/outer bounds, and DRS zones from lap telemetry.
    Returns (plot_x_ref, plot_y_ref, x_inner, y_inner, x_outer, y_outer,
             x_min, x_max, y_min, y_max, drs_zones).
    """
    drs_zones = _plot_drs_zones(example_lap)
    plot_x_ref = np.asarray(example_lap["X"], dtype=np.float64)
    plot_y_ref = np.asarray(example_lap["Y"], dtype=np.float64)

    dx = np.gradient(plot_x_ref)
    dy = np.gradient(plot_y_ref)

    norm = np.sqrt(dx**2 + dy**2)
    norm[norm == 0] = 1.0
    dx /= norm
    dy /= norm

    nx = -dy
    ny = dx

    x_outer = plot_x_ref + nx * (track_width / 2)
    y_outer = plot_y_ref + ny * (track_width / 2)
    x_inner = plot_x_ref - nx * (track_width / 2)
    y_inner = plot_y_ref - ny * (track_width / 2)

    x_min = float(min(plot_x_ref.min(), x_inner.min(), x_outer.min()))
    x_max = float(max(plot_x_ref.max(), x_inner.max(), x_outer.max()))
    y_min = float(min(plot_y_ref.min(), y_inner.min(), y_outer.min()))
    y_max = float(max(plot_y_ref.max(), y_inner.max(), y_outer.max()))

    return (plot_x_ref, plot_y_ref, x_inner, y_inner, x_outer, y_outer,
            x_min, x_max, y_min, y_max, drs_zones)
