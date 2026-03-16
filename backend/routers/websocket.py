"""
WebSocket endpoint for streaming replay data.

Only serves data that is already in cache.  If the replay hasn't been computed
yet, the client should use the HTTP /replay endpoint (which triggers background
computation and returns a task_id for polling).
"""

import asyncio
import gc
import logging
import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.cache import replay_get

logger = logging.getLogger(__name__)

router = APIRouter()


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

        data = await asyncio.to_thread(replay_get, year, round_number, session)

        if data is None:
            await websocket.send_json({
                "type": "error",
                "detail": "not_cached",
                "message": "Replay not cached yet. Use GET /replay to trigger computation.",
            })
            await websocket.close()
            return

        payload = {"type": "columnar_replay", **data}
        await websocket.send_text(
            orjson.dumps(
                payload,
                option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY,
            ).decode()
        )
        del data
        gc.collect()

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
