"""
Two-tier caching layer for ApexAI backend.

L1: In-memory TTLCache for lightweight data (sessions list, race names).
L2: Supabase Storage (cloud) OR LocalDiskCache (desktop/local) for large replay payloads.
    - If SUPABASE_URL is set: uses Supabase Storage.
    - Otherwise: uses LocalDiskCache (gzip files in %APPDATA%/ApexAI/cache or APEX_CACHE_DIR).
"""

import gzip
import logging
import os
import pathlib
from typing import Any

import orjson
from cachetools import TTLCache, LRUCache

logger = logging.getLogger(__name__)

REPLAY_CACHE_VERSION = 2

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
CACHE_BUCKET = os.environ.get("CACHE_BUCKET", "replay-cache")
CACHE_MAX_SESSIONS = int(os.environ.get("CACHE_MAX_SESSIONS", "50"))
L1_TTL_SECONDS = int(os.environ.get("CACHE_SESSIONS_TTL", str(24 * 3600)))

# ---------------------------------------------------------------------------
# LocalDiskCache: filesystem-based L2 (used when Supabase is not configured)
# ---------------------------------------------------------------------------
def _default_cache_dir() -> pathlib.Path:
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    return pathlib.Path(appdata) / "ApexAI" / "cache"


_DISK_CACHE_DIR: pathlib.Path = pathlib.Path(
    os.environ.get("APEX_CACHE_DIR", "")
) if os.environ.get("APEX_CACHE_DIR") else _default_cache_dir()


def _disk_path(key: str) -> pathlib.Path:
    """Resolve a cache key (e.g. 'replay/2024/5/R.json.gz') to an absolute file path."""
    return _DISK_CACHE_DIR / key


def disk_get(key: str) -> bytes | None:
    """Read raw gzip bytes from disk. Returns None on miss."""
    path = _disk_path(key)
    if path.exists():
        try:
            data = path.read_bytes()
            logger.info("L2 disk hit: %s (%d bytes)", key, len(data))
            return data
        except Exception as e:
            logger.debug("L2 disk read error for %s: %s", key, e)
    return None


def disk_set(key: str, compressed: bytes) -> None:
    """Write raw gzip bytes to disk."""
    path = _disk_path(key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(compressed)
        logger.info("L2 disk stored: %s (%d bytes)", key, len(compressed))
    except Exception as e:
        logger.warning("L2 disk write error for %s: %s", key, e)


def disk_delete(key: str) -> None:
    path = _disk_path(key)
    try:
        if path.exists():
            path.unlink()
    except Exception as e:
        logger.debug("L2 disk delete error for %s: %s", key, e)


def disk_list_keys(prefix: str = "") -> list[str]:
    """List all cached keys under an optional prefix."""
    base = _DISK_CACHE_DIR / prefix if prefix else _DISK_CACHE_DIR
    if not base.exists():
        return []
    return [str(p.relative_to(_DISK_CACHE_DIR)).replace("\\", "/") for p in base.rglob("*.json.gz")]

# ---------------------------------------------------------------------------
# L1: In-memory cache for sessions / race-names (small, fast, TTL-based)
# ---------------------------------------------------------------------------
_l1_cache: TTLCache = TTLCache(maxsize=50, ttl=L1_TTL_SECONDS)


def l1_get(key: str) -> Any | None:
    return _l1_cache.get(key)


def l1_set(key: str, value: Any) -> None:
    _l1_cache[key] = value


# ---------------------------------------------------------------------------
# L2: Replay payload cache
# ---------------------------------------------------------------------------
_supabase_client = None
_supabase_available = False

# In-memory LRU is kept as a hot layer on top of disk (only when Supabase is absent)
_l2_memory: LRUCache = LRUCache(maxsize=1 if (SUPABASE_URL and SUPABASE_KEY) else 3)


def _get_supabase():
    """Lazy-init the Supabase client."""
    global _supabase_client, _supabase_available
    if _supabase_client is not None:
        return _supabase_client
    if not SUPABASE_URL or not SUPABASE_KEY:
        _supabase_available = False
        logger.info("Supabase not configured — replay cache uses in-memory fallback")
        return None
    try:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        _supabase_available = True
        _ensure_bucket()
        logger.info("Supabase Storage connected for replay cache")
    except Exception as e:
        _supabase_available = False
        logger.warning("Failed to init Supabase client: %s — using in-memory fallback", e)
    return _supabase_client


def _ensure_bucket():
    """Create the cache bucket if it doesn't exist."""
    if not _supabase_client:
        return
    try:
        _supabase_client.storage.get_bucket(CACHE_BUCKET)
    except Exception:
        try:
            _supabase_client.storage.create_bucket(
                CACHE_BUCKET,
                options={"public": False},
            )
            logger.info("Created Supabase bucket: %s", CACHE_BUCKET)
        except Exception as e:
            logger.warning("Could not create bucket %s: %s", CACHE_BUCKET, e)


def _replay_key(year: int, round_number: int, session: str) -> str:
    return f"replay/{year}/{round_number}/{session}.json.gz"


def _quali_key(year: int, round_number: int, session: str) -> str:
    return f"qualifying/{year}/{round_number}/{session}.json.gz"


# ---------------------------------------------------------------------------
# L2 public API
# ---------------------------------------------------------------------------

def _version_ok(payload: dict | None) -> bool:
    """Return True if the cached payload matches the current columnar schema version."""
    if payload is None:
        return False
    return payload.get("cache_version") == REPLAY_CACHE_VERSION


def replay_get(year: int, round_number: int, session: str) -> dict | None:
    """Try to retrieve a cached replay payload. Returns None on miss or version mismatch."""
    key = _replay_key(year, round_number, session)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = sb.storage.from_(CACHE_BUCKET).download(key)
            if data:
                decompressed = gzip.decompress(data)
                payload = orjson.loads(decompressed)
                if _version_ok(payload):
                    logger.info("L2 Supabase hit: %s (%d bytes compressed)", key, len(data))
                    return payload
                logger.info("L2 Supabase stale (version mismatch): %s", key)
        except Exception as e:
            logger.debug("L2 Supabase miss or error for %s: %s", key, e)
    else:
        # Check in-memory hot layer first
        cached = _l2_memory.get(key)
        if cached is not None:
            if _version_ok(cached):
                logger.info("L2 memory hit: %s", key)
                return cached
            logger.info("L2 memory stale (version mismatch): %s", key)
            _l2_memory.pop(key, None)
        # Fall through to disk
        data = disk_get(key)
        if data:
            try:
                payload = orjson.loads(gzip.decompress(data))
                if _version_ok(payload):
                    _l2_memory[key] = payload  # promote to memory
                    return payload
                logger.info("L2 disk stale (version mismatch): %s", key)
                disk_delete(key)
            except Exception as e:
                logger.debug("L2 disk parse error for %s: %s", key, e)

    return None


def replay_set(year: int, round_number: int, session: str, payload: dict) -> None:
    """Store a replay payload in L2 cache."""
    key = _replay_key(year, round_number, session)

    payload.setdefault("cache_version", REPLAY_CACHE_VERSION)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            compressed = gzip.compress(
                orjson.dumps(payload, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY),
                compresslevel=6,
            )
            sb.storage.from_(CACHE_BUCKET).upload(
                key,
                compressed,
                {"content-type": "application/gzip", "upsert": "true"},
            )
            logger.info("L2 Supabase stored: %s (%d bytes)", key, len(compressed))
            _evict_if_needed(sb)
        except Exception as e:
            logger.warning("L2 Supabase write failed for %s: %s", key, e)
    else:
        compressed = gzip.compress(
            orjson.dumps(payload, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY),
            compresslevel=6,
        )
        disk_set(key, compressed)
        _l2_memory[key] = payload


def replay_get_compressed(year: int, round_number: int, session: str) -> bytes | None:
    """Return raw gzip bytes — avoids decompress+parse+re-encode cycle.
    Works with both Supabase and disk cache.
    Version check intentionally skipped: replay_set always writes the current REPLAY_CACHE_VERSION."""
    key = _replay_key(year, round_number, session)
    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = sb.storage.from_(CACHE_BUCKET).download(key)
            if data:
                logger.info("L2 Supabase compressed hit: %s (%d bytes)", key, len(data))
                return bytes(data)
        except Exception as e:
            logger.debug("L2 Supabase compressed miss for %s: %s", key, e)
        return None
    # Disk cache
    return disk_get(key)


def quali_get(year: int, round_number: int, session: str) -> dict | None:
    """Try to retrieve cached qualifying data. Returns None on miss."""
    key = _quali_key(year, round_number, session)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = sb.storage.from_(CACHE_BUCKET).download(key)
            if data:
                decompressed = gzip.decompress(data)
                logger.info("L2 Supabase quali hit: %s (%d bytes compressed)", key, len(data))
                return orjson.loads(decompressed)
        except Exception as e:
            logger.debug("L2 Supabase quali miss or error for %s: %s", key, e)
    else:
        cached = _l2_memory.get(key)
        if cached is not None:
            logger.info("L2 memory quali hit: %s", key)
            return cached
        data = disk_get(key)
        if data:
            try:
                payload = orjson.loads(gzip.decompress(data))
                _l2_memory[key] = payload
                return payload
            except Exception as e:
                logger.debug("L2 disk quali parse error for %s: %s", key, e)

    return None


def quali_get_compressed(year: int, round_number: int, session: str) -> bytes | None:
    """Return raw gzip bytes for qualifying — avoids decompress+parse+re-encode cycle."""
    key = _quali_key(year, round_number, session)
    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = sb.storage.from_(CACHE_BUCKET).download(key)
            if data:
                logger.info("L2 Supabase quali compressed hit: %s (%d bytes)", key, len(data))
                return bytes(data)
        except Exception as e:
            logger.debug("L2 Supabase quali compressed miss for %s: %s", key, e)
        return None
    return disk_get(key)


def quali_set(year: int, round_number: int, session: str, payload: dict) -> None:
    """Store qualifying data in L2 cache."""
    key = _quali_key(year, round_number, session)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            compressed = gzip.compress(
                orjson.dumps(payload, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY),
                compresslevel=6,
            )
            sb.storage.from_(CACHE_BUCKET).upload(
                key,
                compressed,
                {"content-type": "application/gzip", "upsert": "true"},
            )
            logger.info("L2 Supabase quali stored: %s (%d bytes)", key, len(compressed))
        except Exception as e:
            logger.warning("L2 Supabase quali write failed for %s: %s", key, e)
    else:
        compressed = gzip.compress(
            orjson.dumps(payload, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY),
            compresslevel=6,
        )
        disk_set(key, compressed)
        _l2_memory[key] = payload


# ---------------------------------------------------------------------------
# Task status persistence (for cross-instance / restart resilience)
# ---------------------------------------------------------------------------
_task_status_memory: dict[str, dict[str, Any]] = {}


def _task_status_key(task_id: str) -> str:
    return f"tasks/{task_id}.json"


def task_status_get(task_id: str) -> dict[str, Any] | None:
    """Retrieve task status from Supabase Storage, disk, or in-memory fallback."""
    key = _task_status_key(task_id)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = sb.storage.from_(CACHE_BUCKET).download(key)
            if data:
                return orjson.loads(data)
        except Exception as e:
            logger.debug("Task status miss or error for %s: %s", task_id, e)
        return None

    # Try in-memory first, then disk
    cached = _task_status_memory.get(task_id)
    if cached is not None:
        return cached
    task_path = _DISK_CACHE_DIR / key
    if task_path.exists():
        try:
            return orjson.loads(task_path.read_bytes())
        except Exception:
            pass
    return None


def task_status_set(task_id: str, task: dict[str, Any]) -> None:
    """Persist task status to Supabase Storage, disk, or in-memory fallback."""
    key = _task_status_key(task_id)
    payload = {
        "status": task.get("status", "pending"),
        "progress": task.get("progress"),
        "error": task.get("error"),
        "year": task.get("year"),
        "round": task.get("round"),
        "session": task.get("session"),
        "created_at": task.get("created_at"),
    }

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            data = orjson.dumps(payload)
            sb.storage.from_(CACHE_BUCKET).upload(
                key,
                data,
                {"content-type": "application/json", "upsert": "true"},
            )
        except Exception as e:
            logger.warning("Task status write failed for %s: %s", task_id, e)
    else:
        _task_status_memory[task_id] = payload
        task_path = _DISK_CACHE_DIR / key
        try:
            task_path.parent.mkdir(parents=True, exist_ok=True)
            task_path.write_bytes(orjson.dumps(payload))
        except Exception:
            pass


def task_status_delete(task_id: str) -> None:
    """Remove task status from Supabase Storage, disk, or in-memory fallback."""
    key = _task_status_key(task_id)

    sb = _get_supabase()
    if sb and _supabase_available:
        try:
            sb.storage.from_(CACHE_BUCKET).remove([key])
        except Exception as e:
            logger.debug("Task status delete failed for %s: %s", task_id, e)
    else:
        _task_status_memory.pop(task_id, None)
        task_path = _DISK_CACHE_DIR / key
        try:
            if task_path.exists():
                task_path.unlink()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# L2 eviction
# ---------------------------------------------------------------------------

def _evict_if_needed(sb) -> None:
    """If we exceed CACHE_MAX_SESSIONS files, delete the oldest ones."""
    try:
        files = sb.storage.from_(CACHE_BUCKET).list(
            path="replay",
            options={"limit": 1000, "sortBy": {"column": "created_at", "order": "asc"}},
        )
        all_files = []
        for year_dir in files:
            name = year_dir.get("name", "")
            if not name:
                continue
            round_dirs = sb.storage.from_(CACHE_BUCKET).list(
                path=f"replay/{name}",
                options={"limit": 1000, "sortBy": {"column": "created_at", "order": "asc"}},
            )
            for round_dir in round_dirs:
                rname = round_dir.get("name", "")
                if not rname:
                    continue
                session_files = sb.storage.from_(CACHE_BUCKET).list(
                    path=f"replay/{name}/{rname}",
                    options={"limit": 1000, "sortBy": {"column": "created_at", "order": "asc"}},
                )
                for sf in session_files:
                    sfname = sf.get("name", "")
                    if sfname:
                        all_files.append({
                            "path": f"replay/{name}/{rname}/{sfname}",
                            "created_at": sf.get("created_at", ""),
                        })

        if len(all_files) <= CACHE_MAX_SESSIONS:
            return

        all_files.sort(key=lambda f: f["created_at"])
        to_delete = len(all_files) - CACHE_MAX_SESSIONS
        paths_to_remove = [f["path"] for f in all_files[:to_delete]]

        if paths_to_remove:
            sb.storage.from_(CACHE_BUCKET).remove(paths_to_remove)
            logger.info("Evicted %d old replay cache files", len(paths_to_remove))
    except Exception as e:
        logger.warning("Cache eviction check failed: %s", e)
