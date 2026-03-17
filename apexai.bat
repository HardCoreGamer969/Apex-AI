@echo off
setlocal enabledelayedexpansion

:: ============================================================================
::  ApexAI Docker Manager
::  Usage: apexai.bat <command> [service|subcommand]
:: ============================================================================

set "PROJECT=apexai"
set "COMPOSE=docker-compose.yml"
set "BACKEND_URL=http://localhost:8765/health"
set "FRONTEND_URL=http://localhost:5173"

:: ── Check Docker is available ────────────────────────────────────────────────
docker info >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo  [ERROR] Docker is not running or not installed.
    echo          Start Docker Desktop and try again.
    echo.
    exit /b 1
)

:: ── Route command ────────────────────────────────────────────────────────────
set "CMD=%~1"
set "ARG=%~2"

if "!CMD!"==""         goto :help
if /i "!CMD!"=="help"  goto :help

if /i "!CMD!"=="up"      goto :up
if /i "!CMD!"=="dev"     goto :dev
if /i "!CMD!"=="down"    goto :down
if /i "!CMD!"=="stop"    goto :stop
if /i "!CMD!"=="start"   goto :start
if /i "!CMD!"=="restart" goto :restart

if /i "!CMD!"=="build"   goto :build
if /i "!CMD!"=="rebuild" goto :rebuild
if /i "!CMD!"=="pull"    goto :pull

if /i "!CMD!"=="logs"    goto :logs
if /i "!CMD!"=="shell"   goto :shell
if /i "!CMD!"=="ps"      goto :ps
if /i "!CMD!"=="status"  goto :ps
if /i "!CMD!"=="health"  goto :health
if /i "!CMD!"=="open"    goto :open

if /i "!CMD!"=="clean"   goto :clean
if /i "!CMD!"=="nuke"    goto :nuke
if /i "!CMD!"=="reset"   goto :reset

if /i "!CMD!"=="cache"   goto :cache

echo.
echo  [ERROR] Unknown command: !CMD!
goto :help

:: ============================================================================
::  SERVICE MANAGEMENT
:: ============================================================================

:up
echo.
echo  [ApexAI] Starting services in background...
docker compose -p %PROJECT% -f %COMPOSE% up -d
if !errorlevel! neq 0 goto :failed
echo.
echo  [ApexAI] Services started.
echo           Backend:   %BACKEND_URL%
echo           Frontend:  %FRONTEND_URL%
echo.
echo  Tip: apexai.bat logs        -- tail all logs
echo       apexai.bat logs backend -- tail backend only
echo.
goto :done

:dev
echo.
echo  [ApexAI] Starting services with live logs (Ctrl+C to stop)...
echo.
docker compose -p %PROJECT% -f %COMPOSE% up
goto :done

:down
echo.
echo  [ApexAI] Stopping and removing containers (volumes preserved)...
docker compose -p %PROJECT% -f %COMPOSE% down
if !errorlevel! neq 0 goto :failed
echo  [ApexAI] Containers removed.
goto :done

:stop
echo.
echo  [ApexAI] Stopping containers (state preserved)...
docker compose -p %PROJECT% -f %COMPOSE% stop
if !errorlevel! neq 0 goto :failed
echo  [ApexAI] Containers stopped.  Use "apexai.bat start" to resume.
goto :done

:start
echo.
echo  [ApexAI] Starting stopped containers...
docker compose -p %PROJECT% -f %COMPOSE% start
if !errorlevel! neq 0 goto :failed
goto :done

:restart
echo.
if "!ARG!"=="" (
    echo  [ApexAI] Restarting all services...
    docker compose -p %PROJECT% -f %COMPOSE% restart
) else (
    echo  [ApexAI] Restarting service: !ARG!
    docker compose -p %PROJECT% -f %COMPOSE% restart !ARG!
)
if !errorlevel! neq 0 goto :failed
goto :done

:: ============================================================================
::  BUILD
:: ============================================================================

:build
echo.
echo  [ApexAI] Building images...
docker compose -p %PROJECT% -f %COMPOSE% build
if !errorlevel! neq 0 goto :failed
echo  [ApexAI] Images built.  Run "apexai.bat up" to start.
goto :done

:rebuild
echo.
echo  [ApexAI] Force-rebuilding images (no cache) and starting...
docker compose -p %PROJECT% -f %COMPOSE% build --no-cache
if !errorlevel! neq 0 goto :failed
docker compose -p %PROJECT% -f %COMPOSE% up -d
if !errorlevel! neq 0 goto :failed
echo.
echo  [ApexAI] Rebuild complete. Services running.
goto :done

:pull
echo.
echo  [ApexAI] Pulling latest base images...
docker compose -p %PROJECT% -f %COMPOSE% pull
if !errorlevel! neq 0 goto :failed
echo  [ApexAI] Base images updated.  Run "apexai.bat rebuild" to apply.
goto :done

:: ============================================================================
::  DEBUGGING
:: ============================================================================

:logs
echo.
if "!ARG!"=="" (
    echo  [ApexAI] Tailing all logs (Ctrl+C to stop)...
    echo.
    docker compose -p %PROJECT% -f %COMPOSE% logs -f
) else (
    echo  [ApexAI] Tailing logs for: !ARG! (Ctrl+C to stop)...
    echo.
    docker compose -p %PROJECT% -f %COMPOSE% logs -f !ARG!
)
goto :done

:shell
echo.
if "!ARG!"=="" (
    echo  [ERROR] Specify a service name.
    echo.
    echo  Examples:
    echo    apexai.bat shell backend
    echo    apexai.bat shell frontend
    echo.
    goto :done
)
echo  [ApexAI] Opening shell in container: !ARG!
echo  (type "exit" to leave)
echo.
docker compose -p %PROJECT% -f %COMPOSE% exec !ARG! /bin/sh
if !errorlevel! neq 0 (
    :: Try bash if sh fails
    docker compose -p %PROJECT% -f %COMPOSE% exec !ARG! /bin/bash
)
goto :done

:ps
echo.
echo  [ApexAI] Container status:
echo.
docker compose -p %PROJECT% -f %COMPOSE% ps
echo.
goto :done

:health
echo.
echo  [ApexAI] Checking backend health...
echo.
curl -s %BACKEND_URL%
echo.
echo.
goto :done

:open
echo.
echo  [ApexAI] Opening frontend in browser...
start %FRONTEND_URL%
goto :done

:: ============================================================================
::  CLEANUP
:: ============================================================================

:clean
echo.
echo  [ApexAI] Removing containers and locally-built images...
echo           (Cache volume and named volumes are preserved)
echo.
docker compose -p %PROJECT% -f %COMPOSE% down --rmi local
docker image prune -f
if !errorlevel! neq 0 goto :failed
echo.
echo  [ApexAI] Clean complete.
goto :done

:nuke
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  WARNING: NUKE will permanently destroy:                ║
echo  ║   • All ApexAI containers                               ║
echo  ║   • All ApexAI Docker images                            ║
echo  ║   • The apexai_cache volume (all downloaded F1 data)    ║
echo  ║   • All associated networks                             ║
echo  ║                                                          ║
echo  ║  This cannot be undone.                                  ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
set /p "CONFIRM=  Type YES to confirm: "
if /i "!CONFIRM!" neq "YES" (
    echo.
    echo  Cancelled.
    goto :done
)
echo.
echo  [ApexAI] Nuking everything...
docker compose -p %PROJECT% -f %COMPOSE% down --rmi all -v --remove-orphans
docker image prune -f
echo.
echo  [ApexAI] Done. All containers, images, and volumes removed.
echo           Run "apexai.bat rebuild" to start fresh.
goto :done

:reset
echo.
echo  [ApexAI] Full reset: remove everything, rebuild, and start...
echo.
echo  This will:
echo    1. Remove all containers, images, and the cache volume
echo    2. Rebuild images from scratch (no cache)
echo    3. Start all services
echo.
set /p "CONFIRM=  Type YES to confirm: "
if /i "!CONFIRM!" neq "YES" (
    echo.
    echo  Cancelled.
    goto :done
)
echo.
echo  [ApexAI] Step 1/3  Removing everything...
docker compose -p %PROJECT% -f %COMPOSE% down --rmi all -v --remove-orphans
docker image prune -f
echo.
echo  [ApexAI] Step 2/3  Rebuilding images (no cache)...
docker compose -p %PROJECT% -f %COMPOSE% build --no-cache
if !errorlevel! neq 0 goto :failed
echo.
echo  [ApexAI] Step 3/3  Starting services...
docker compose -p %PROJECT% -f %COMPOSE% up -d
if !errorlevel! neq 0 goto :failed
echo.
echo  [ApexAI] Reset complete.
echo           Backend:   %BACKEND_URL%
echo           Frontend:  %FRONTEND_URL%
goto :done

:: ============================================================================
::  CACHE MANAGEMENT
:: ============================================================================

:cache
if /i "!ARG!"=="show" (
    echo.
    echo  [ApexAI] Files in cache volume ^(apexai_cache^):
    echo.
    docker run --rm -v apexai_cache:/cache alpine sh -c "find /cache -type f | sort || echo '  (empty)'"
    echo.
    goto :done
)
if /i "!ARG!"=="size" (
    echo.
    echo  [ApexAI] Cache volume disk usage:
    echo.
    docker run --rm -v apexai_cache:/cache alpine sh -c "du -sh /cache/* 2>/dev/null || echo '  (empty)'"
    echo.
    goto :done
)
if /i "!ARG!"=="clear" (
    echo.
    echo  [WARNING] This will delete all cached F1 session data from the Docker volume.
    echo           The next session load will re-download from the F1 API ^(2-5 min^).
    echo.
    set /p "CONFIRM=  Type YES to confirm: "
    if /i "!CONFIRM!" neq "YES" (
        echo.
        echo  Cancelled.
        goto :done
    )
    echo.
    echo  [ApexAI] Clearing cache volume...
    docker run --rm -v apexai_cache:/cache alpine sh -c "rm -rf /cache/* && echo Done"
    echo  [ApexAI] Cache cleared.
    goto :done
)
if /i "!ARG!"=="inspect" (
    echo.
    echo  [ApexAI] Cache volume details:
    echo.
    docker volume inspect apexai_cache
    echo.
    goto :done
)
echo.
echo  Usage: apexai.bat cache ^<show ^| size ^| clear ^| inspect^>
echo.
echo    show     -- list all cached session files
echo    size     -- show disk usage per entry
echo    clear    -- delete all cached F1 data  ^(requires confirmation^)
echo    inspect  -- show Docker volume metadata
echo.
goto :done

:: ============================================================================
::  HELP
:: ============================================================================

:help
echo.
echo  ┌─────────────────────────────────────────────────────────────┐
echo  │               ApexAI Docker Manager                        │
echo  └─────────────────────────────────────────────────────────────┘
echo.
echo  Usage:  apexai.bat ^<command^> [service]
echo.
echo  ── SERVICE MANAGEMENT ────────────────────────────────────────
echo.
echo    up                 Start all services in background
echo    dev                Start all services with live logs
echo    down               Stop + remove containers  (volumes kept)
echo    stop               Stop containers           (state kept)
echo    start              Start stopped containers
echo    restart [service]  Restart all or one service
echo.
echo  ── BUILD ─────────────────────────────────────────────────────
echo.
echo    build              Build Docker images
echo    rebuild            Force rebuild (no cache) then start
echo    pull               Pull latest base images from Docker Hub
echo.
echo  ── DEBUGGING ─────────────────────────────────────────────────
echo.
echo    logs [service]     Tail logs  (all services or one)
echo    shell ^<service^>    Open a shell inside a container
echo    ps / status        Show container states and ports
echo    health             Check backend /health endpoint
echo    open               Open frontend in your browser
echo.
echo  ── CLEANUP ───────────────────────────────────────────────────
echo.
echo    clean              Remove containers + dangling images
echo    nuke               Remove EVERYTHING incl. volumes  ⚠
echo    reset              Nuke + rebuild + start fresh      ⚠
echo.
echo  ── CACHE ─────────────────────────────────────────────────────
echo.
echo    cache show         List cached F1 session files
echo    cache size         Show disk usage per session
echo    cache clear        Delete all cached F1 data         ⚠
echo    cache inspect      Show Docker volume metadata
echo.
echo  ── SERVICES ──────────────────────────────────────────────────
echo.
echo    backend            FastAPI on http://localhost:8765
echo    frontend           Vite dev server on http://localhost:5173
echo.
echo  Examples:
echo    apexai.bat up
echo    apexai.bat logs backend
echo    apexai.bat shell backend
echo    apexai.bat restart frontend
echo    apexai.bat cache show
echo.
goto :done

:: ============================================================================
::  SHARED
:: ============================================================================

:failed
echo.
echo  [ERROR] Command failed. Check the output above for details.
exit /b 1

:done
endlocal
