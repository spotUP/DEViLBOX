#!/usr/bin/env bash
# dev.sh — DEViLBOX full-stack dev launcher
#
# Kills any existing processes on the dev ports, then starts:
#   • Backend  (Express + SC compile)  → http://localhost:3001
#   • Frontend (Vite)                  → http://localhost:5173
#
# Usage: ./dev.sh
# Stop:  Ctrl-C

set -euo pipefail

FRONTEND_PORT=5173
BACKEND_PORT=3001
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[dev]${RESET} $*"; }
ok()   { echo -e "${GREEN}[dev]${RESET} $*"; }
warn() { echo -e "${YELLOW}[dev]${RESET} $*"; }

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

log "Clearing ports $BACKEND_PORT and $FRONTEND_PORT..."
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

# ── Cleanup on exit ────────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  log "Shutting down..."
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Belt-and-suspenders: clear the ports in case child processes spawned subchildren
  kill_port "$BACKEND_PORT"
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

# ── Furnace WASM (rebuild if source is newer) ──────────────────────────────────
FURNACE_WASM="public/furnace-dispatch/FurnaceDispatch.wasm"
FURNACE_SRC="furnace-wasm/common/FurnaceDispatchWrapper.cpp"
if [ -f "$FURNACE_SRC" ] && [ -d "furnace-wasm/build" ]; then
  if [ ! -f "$FURNACE_WASM" ] || [ "$FURNACE_SRC" -nt "$FURNACE_WASM" ]; then
    log "Rebuilding Furnace WASM..."
    (cd furnace-wasm/build && make -j4)
    ok "Furnace WASM rebuilt."
  fi
fi

# ── Logs ───────────────────────────────────────────────────────────────────────
mkdir -p logs
: > logs/backend.log
: > logs/frontend.log

# ── Backend ────────────────────────────────────────────────────────────────────
log "Starting backend on port $BACKEND_PORT..."
(cd server && npm run dev) > logs/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to accept connections (up to 15 s)
log "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
    ok "Backend ready (PID: $BACKEND_PID)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "Backend didn't respond in 15 s — check logs/backend.log"
  fi
  sleep 0.5
done

# ── Type-check ─────────────────────────────────────────────────────────────────
log "Running type-check..."
if ! npm run type-check; then
  echo -e "${RED}[dev]${RESET} TypeScript errors found — fix them before starting the dev server."
  exit 1
fi
ok "Type-check passed."

# ── Frontend ───────────────────────────────────────────────────────────────────
log "Starting frontend on port $FRONTEND_PORT..."
vite > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for Vite to actually be serving (up to 90 s — predev type-check is slow)
log "Waiting for frontend to be ready..."
for i in $(seq 1 180); do
  if nc -z localhost "$FRONTEND_PORT" 2>/dev/null; then
    ok "Frontend ready (PID: $FRONTEND_PID)"
    break
  fi
  # Show a dot every 5 s so the user knows it's still working
  if (( i % 10 == 0 )); then
    printf "  %ss elapsed — check logs/frontend.log if this seems stuck\n" "$((i / 2))"
  fi
  if [ "$i" -eq 180 ]; then
    warn "Frontend didn't come up in 90 s — check logs/frontend.log"
    warn "Last lines:"
    tail -5 logs/frontend.log | sed 's/^/  /'
  fi
  sleep 0.5
done

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  DEViLBOX is running${RESET}"
echo -e "  Frontend → ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"
echo -e "  Backend  → ${CYAN}http://localhost:$BACKEND_PORT${RESET}"
echo -e "  Logs     → logs/frontend.log  logs/backend.log"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${YELLOW}Ctrl-C to stop${RESET}"
echo ""

# Keep alive — exit when either child dies
wait "$BACKEND_PID" "$FRONTEND_PID"
