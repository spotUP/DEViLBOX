#!/usr/bin/env bash
# dev.sh — DEViLBOX full-stack dev launcher
#
# Kills any existing processes on the dev ports, then starts:
#   • API server    (Express + SC compile)   → http://localhost:3001
#   • Collab server (WebSocket signaling)    → ws://localhost:4002
#   • Frontend      (Vite)                  → http://localhost:5173
#
# Usage: ./dev.sh
# Stop:  Ctrl-C

set -euo pipefail

FRONTEND_PORT=5173
BACKEND_PORT=3001
COLLAB_PORT=4002
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[dev]${RESET} $*"; }
ok()   { echo -e "${GREEN}[dev]${RESET} $*"; }
warn() { echo -e "${YELLOW}[dev]${RESET} $*"; }
err()  { echo -e "${RED}[dev]${RESET} $*"; }

# ── Kill anything already on our ports ────────────────────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Killing existing process(es) on port $port (PID: $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

log "Clearing ports $BACKEND_PORT, $COLLAB_PORT and $FRONTEND_PORT..."
kill_port "$BACKEND_PORT"
kill_port "$COLLAB_PORT"
kill_port "$FRONTEND_PORT"

# ── Cleanup on exit ────────────────────────────────────────────────────────────
BACKEND_PID=""
COLLAB_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  log "Shutting down..."
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$COLLAB_PID" ]   && kill "$COLLAB_PID"   2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Belt-and-suspenders: clear the ports in case child processes spawned subchildren
  kill_port "$BACKEND_PORT"
  kill_port "$COLLAB_PORT"
  kill_port "$FRONTEND_PORT"
  ok "Done."
}
trap cleanup SIGINT SIGTERM EXIT

# ── Dependencies ───────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
  log "Installing frontend dependencies..."
  npm install
fi

if [ ! -d "server/node_modules" ]; then
  log "Installing backend dependencies..."
  (cd server && npm install)
fi

# ── Furnace WASM (rebuild if source is newer) ─────────────────────────────────
FURNACE_WASM="public/furnace-dispatch/FurnaceDispatch.wasm"
FURNACE_SRC="furnace-wasm/common/FurnaceDispatchWrapper.cpp"
if [ -f "$FURNACE_SRC" ] && [ -d "furnace-wasm/build" ]; then
  if [ ! -f "$FURNACE_WASM" ] || [ "$FURNACE_SRC" -nt "$FURNACE_WASM" ]; then
    log "Rebuilding Furnace WASM..."
    (cd furnace-wasm/build && make -j4)
    ok "Furnace WASM rebuilt."
  fi
fi

# ── Generated files ────────────────────────────────────────────────────────────
log "Generating changelog and file manifest..."
node scripts/generate-changelog.cjs
node scripts/generate-file-manifest.js

# ── Type-check ─────────────────────────────────────────────────────────────────
log "Running type-check..."
if ! npm run type-check; then
  err "TypeScript errors — fix them before starting the dev server."
  exit 1
fi
ok "Type-check passed."

# ── AssemblyScript build ───────────────────────────────────────────────────────
log "Building AssemblyScript (DevilboxDSP.wasm)..."
npm run asbuild
ok "AssemblyScript built."

# ── Logs ───────────────────────────────────────────────────────────────────────
mkdir -p logs
: > logs/backend.log
: > logs/collab.log
: > logs/frontend.log

# ── API server (Express) ───────────────────────────────────────────────────────
log "Starting API server on port $BACKEND_PORT..."
(cd server && npm run dev) > logs/backend.log 2>&1 &
BACKEND_PID=$!

log "Waiting for API server to be ready..."
for i in $(seq 1 30); do
  if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
    ok "API server ready (PID: $BACKEND_PID)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "API server didn't respond in 15 s — check logs/backend.log"
    tail -5 logs/backend.log | sed 's/^/  /'
  fi
  sleep 0.5
done

# ── Collab server (WebSocket signaling) ───────────────────────────────────────
log "Starting collab server on port $COLLAB_PORT..."
(cd server && npm run collab:watch) > logs/collab.log 2>&1 &
COLLAB_PID=$!

log "Waiting for collab server to be ready..."
for i in $(seq 1 20); do
  if nc -z localhost "$COLLAB_PORT" 2>/dev/null; then
    ok "Collab server ready (PID: $COLLAB_PID)"
    break
  fi
  if [ "$i" -eq 20 ]; then
    warn "Collab server didn't respond in 10 s — check logs/collab.log"
    tail -5 logs/collab.log | sed 's/^/  /'
  fi
  sleep 0.5
done

# ── Frontend (Vite) ────────────────────────────────────────────────────────────
log "Starting frontend on port $FRONTEND_PORT..."
npx vite > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

log "Waiting for frontend to be ready..."
for i in $(seq 1 60); do
  if nc -z localhost "$FRONTEND_PORT" 2>/dev/null; then
    ok "Frontend ready (PID: $FRONTEND_PID)"
    break
  fi
  if (( i % 10 == 0 )); then
    printf "  %ss elapsed — check logs/frontend.log if this seems stuck\n" "$i"
  fi
  if [ "$i" -eq 60 ]; then
    warn "Frontend didn't come up in 60 s — check logs/frontend.log"
    tail -5 logs/frontend.log | sed 's/^/  /'
  fi
  sleep 1
done

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  DEViLBOX is running${RESET}"
echo -e "  Frontend  → ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"
echo -e "  API       → ${CYAN}http://localhost:$BACKEND_PORT${RESET}"
echo -e "  Collab    → ${CYAN}ws://localhost:$COLLAB_PORT${RESET}"
echo -e "  Logs      → logs/backend.log  logs/collab.log  logs/frontend.log"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${YELLOW}Ctrl-C to stop${RESET}"
echo ""

# Keep alive — exit when any child dies (Ctrl-C triggers cleanup via trap)
wait "$BACKEND_PID" "$COLLAB_PID" "$FRONTEND_PID"
