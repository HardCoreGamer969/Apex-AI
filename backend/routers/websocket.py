"""
WebSocket endpoint for streaming replay data.
"""

import asyncio
import logging
import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.cache import replay_get, replay_set
from backend.services.f1_adapter import get_replay_data

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_replay_data(year: int, round_number: int, session: str) -> dict:
    """Load replay data from cache or compute. Runs in thread pool."""
    data = replay_get(year, round_number, session)
    if data is not None:
        return data
    data = get_replay_data(year=year, round_number=round_number, session_type=session)
    try:
        replay_set(year, round_number, session, data)
    except Exception as e:
        logger.warning("Cache write failed: %s", e)
    return data


@router.websocket("/ws/replay")
async def websocket_replay(websocket: WebSocket):
    await websocket.accept()
    try:
        raw = await websocket.receive_text()
        msg = orjson.loads(raw)
        year = msg.get("year")
        round_number = msg.get("round")
        session = msg.get("session")

        if not isinstance(year, int) or not isinstance(round_number, int):
            await websocket.send_json({"type": "error", "detail": "year and round must be integers"})
            await websocket.close()
            return

        if session not in ("R", "S", "Q", "SQ"):
            await websocket.send_json({"type": "error", "detail": "session must be R, S, Q, or SQ"})
            await websocket.close()
            return

        data = await asyncio.to_thread(_load_replay_data, year, round_number, session)

        metadata = {
            "type": "metadata",
            "driver_colors": data["driver_colors"],
            "track_statuses": data["track_statuses"],
            "total_laps": data["total_laps"],
            "max_tyre_life": data["max_tyre_life"],
            "track": data["track"],
            "circuit_rotation": data["circuit_rotation"],
            "session_info": data["session_info"],
        }
        await websocket.send_text(orjson.dumps(metadata, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY).decode())

        frames = data.get("frames", [])
        for i, frame in enumerate(frames):
            payload = {"type": "frame", "index": i, "frame": frame}
            await websocket.send_text(orjson.dumps(payload, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY).decode())
            await asyncio.sleep(0.04)

        await websocket.send_text(orjson.dumps({"type": "done"}).decode())

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except orjson.JSONDecodeError as e:
        logger.warning("Invalid JSON from client: %s", e)
        try:
            await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
        except Exception:
            pass
    except Exception as e:
        logger.exception("WebSocket replay error: %s", e)
        try:
            await websocket.send_json({"type": "error", "detail": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
