#!/usr/bin/env bash
# dev.sh — DEViLBOX full-stack dev launcher
#
# Kills any existing processes on the dev ports, then starts:
#   • API server    (Express + SC compile)   → http://localhost:3011  [logs/backend.log]
#   • Collab server (WebSocket signaling)    → ws://localhost:4002    [logs/collab.log]
#   • MCP relay     (WS bridge for AI/MCP)  → ws://localhost:4003    [started by API server]
#   • Frontend      (Vite)                  → http://localhost:5174  [stdout — always visible]
#
# Vite runs in the foreground so TypeScript errors and crashes are immediately visible.
# Ctrl-C kills Vite and the EXIT trap shuts down the two background servers.
#
# Usage: ./dev.sh
# Stop:  Ctrl-C

set -euo pipefail

# Raise file descriptor limit — macOS default (256) is too low for Vite's file watchers
ulimit -n 65536 2>/dev/null || true

FRONTEND_PORT=5174
BACKEND_PORT=3011
COLLAB_PORT=4002
MCP_PORT=4003
FORMAT_PORT=4444
MASCHINE_PORT=4005
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[dev]${RESET} $*"; }
ok()   { echo -e "${GREEN}[dev]${RESET} $*"; }
warn() { echo -e "${YELLOW}[dev]${RESET} $*"; }
err()  { echo -e "${RED}[dev]${RESET} $*"; }

# ── Kill only DEViLBOX-owned processes on our ports ───────────────────────────
# Checks each PID's working directory — only kills if it's under this project.
kill_port() {
  local port=$1
  local pids pid cwd
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -z "$pids" ]; then return; fi
  for pid in $pids; do
    cwd=$(lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}')
    if [ -n "$cwd" ] && [[ "$cwd" == "$SCRIPT_DIR"* ]]; then
      warn "Killing DEViLBOX process on port $port (PID: $pid, cwd: $cwd)"
      kill -9 "$pid" 2>/dev/null || true
    else
      warn "Skipping non-DEViLBOX process on port $port (PID: $pid, cwd: ${cwd:-unknown})"
    fi
  done
  sleep 0.3
}

log "Clearing ports $BACKEND_PORT, $COLLAB_PORT, $MCP_PORT, $FORMAT_PORT, $MASCHINE_PORT and $FRONTEND_PORT..."
kill_port "$BACKEND_PORT"
kill_port "$COLLAB_PORT"
kill_port "$MCP_PORT"
kill_port "$FORMAT_PORT"
kill_port "$MASCHINE_PORT"
kill_port "$FRONTEND_PORT"

# Kill any orphaned tsx processes whose cwd is inside THIS repo — catches
# leftovers from a previous dev.sh run without touching other projects that
# happen to also use `tsx watch src/index.ts` (an extremely common entrypoint).
kill_project_tsx_orphans() {
  local pids pid cwd
  pids=$(pgrep -f 'tsx' 2>/dev/null || true)
  for pid in $pids; do
    cwd=$(lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}')
    if [ -n "$cwd" ] && [[ "$cwd" == "$SCRIPT_DIR"* ]]; then
      warn "Killing orphan tsx process $pid (cwd: $cwd)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}
kill_project_tsx_orphans

# ── Cleanup on exit ────────────────────────────────────────────────────────────
BACKEND_PID=""
COLLAB_PID=""
FORMAT_PID=""
MASCHINE_PID=""

cleanup() {
  echo ""
  log "Shutting down..."
  # Kill entire process groups (not just the wrapper PIDs) to catch tsx watch children
  [ -n "$BACKEND_PID" ] && kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$COLLAB_PID" ]  && kill -- -"$COLLAB_PID"  2>/dev/null || kill "$COLLAB_PID"  2>/dev/null || true
  [ -n "$FORMAT_PID" ]   && kill -- -"$FORMAT_PID"   2>/dev/null || kill "$FORMAT_PID"   2>/dev/null || true
  [ -n "$MASCHINE_PID" ] && kill -- -"$MASCHINE_PID" 2>/dev/null || kill "$MASCHINE_PID" 2>/dev/null || true
  # Also kill any orphaned tsx/node processes on our ports
  kill_port "$BACKEND_PORT"
  kill_port "$COLLAB_PORT"
  kill_port "$MCP_PORT"
  kill_port "$FORMAT_PORT"
  kill_port "$MASCHINE_PORT"
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

# ── Type-check — output always visible, exits on error ────────────────────────
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

# ── Logs (backend and collab only — Vite runs in foreground) ─────────────────
mkdir -p logs
: > logs/backend.log
: > logs/collab.log
: > logs/format-server.log

# ── Maschine HID bridge — start FIRST before browser claims the device ────────

# ── Maschine MK2 NIHIA bridge — start before browser to own the hardware ──────
log "Starting Maschine NIHIA bridge on port $MASCHINE_PORT..."
: > logs/maschine-bridge.log
npx tsx "$SCRIPT_DIR/tools/maschine-bridge.ts" > logs/maschine-bridge.log 2>&1 &
MASCHINE_PID=$!
log "Waiting for Maschine bridge..."
for i in $(seq 1 10); do
  if nc -z localhost "$MASCHINE_PORT" 2>/dev/null; then
    ok "Maschine bridge ready (PID: $MASCHINE_PID)"
    break
  fi
  if [ "$i" -eq 10 ]; then
    warn "Maschine bridge slow — check logs/maschine-bridge.log"
    tail -3 logs/maschine-bridge.log | sed 's/^/  /'
  fi
  sleep 0.5
done

# ── API server (Express) ───────────────────────────────────────────────────────
log "Starting API server on port $BACKEND_PORT..."
# Unset CLAUDECODE so the AI endpoint can spawn `claude` CLI without the nesting guard
(cd server && unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION && npm run dev) > logs/backend.log 2>&1 &
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

# ── Format status server ──────────────────────────────────────────────────────
log "Starting format status server on port $FORMAT_PORT..."
npx tsx "$SCRIPT_DIR/tools/format-server.ts" > logs/format-server.log 2>&1 &
FORMAT_PID=$!

log "Waiting for format server to be ready..."
for i in $(seq 1 20); do
  if nc -z localhost "$FORMAT_PORT" 2>/dev/null; then
    ok "Format server ready (PID: $FORMAT_PID)"
    break
  fi
  if [ "$i" -eq 20 ]; then
    warn "Format server didn't respond in 10 s — check logs/format-server.log"
    tail -5 logs/format-server.log | sed 's/^/  /'
  fi
  sleep 0.5
done


# ── Status banner (backend up, Vite starting below) ───────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  DEViLBOX back-end running${RESET}"
echo -e "  API     → ${CYAN}http://localhost:$BACKEND_PORT${RESET}   (logs/backend.log)"
echo -e "  Collab  → ${CYAN}ws://localhost:$COLLAB_PORT${RESET}    (logs/collab.log)"
echo -e "  MCP     → ${CYAN}ws://localhost:$MCP_PORT${RESET}    (AI tools relay)"
echo -e "  Format  → ${CYAN}http://localhost:$FORMAT_PORT${RESET}  (logs/format-server.log)"
echo -e "  Maschine→ ${CYAN}ws://localhost:$MASCHINE_PORT${RESET}   (logs/maschine-bridge.log)"
echo -e "  Vite    → ${CYAN}http://localhost:$FRONTEND_PORT${RESET}  (output below)"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${YELLOW}Ctrl-C to stop all servers${RESET}"
echo ""

# ── Frontend (Vite) — foreground, output always visible ──────────────────────
# All Vite output (HMR, build warnings, errors) prints directly to this terminal.
# When Vite exits (Ctrl-C or crash), the EXIT trap above kills backend + collab.
# Give Node.js 4GB heap to prevent OOM kills during HMR with large codebase.
# Auto-restart on crash/OOM so the gig never stops — only Ctrl-C (SIGINT) exits.
while true; do
  NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort
  EXIT_CODE=$?
  # Ctrl-C sends SIGINT (130) — respect the user's intent to stop
  if [ $EXIT_CODE -eq 130 ] || [ $EXIT_CODE -eq 0 ]; then
    break
  fi
  err "Vite crashed (exit $EXIT_CODE) — restarting in 2 seconds..."
  sleep 2
done
