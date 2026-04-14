#!/usr/bin/env bash
# gig.sh — DEViLBOX live performance launcher (offline-safe)
#
# Serves the production build locally. No Node.js dev server, no HMR,
# no file watchers — just static files served with the right headers.
#
# BEFORE THE GIG:
#   1. Run: npm run build                    (builds production bundle)
#   2. Open DEViLBOX in browser
#   3. Go to DJ view → Playlist → click "Pre-cache" on your playlist
#   4. Click "Cache" next to "WAM Synths" to pre-cache WAM plugins
#   5. Wait for all tracks + plugins to download to cache
#   6. Test offline: disconnect wifi, reload, verify auto DJ plays
#
# AT THE GIG:
#   ./gig.sh                                (serves on http://localhost:5173)
#   Open Chrome → http://localhost:5173
#
# Everything runs from cache (IndexedDB) — no internet needed.
# The only process is a lightweight static file server — can't OOM or crash.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check dist/ exists
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
  echo -e "${RED}[gig]${RESET} No production build found!"
  echo -e "  Run ${BOLD}npm run build${RESET} first."
  exit 1
fi

# Kill anything on port 5173
PIDS=$(lsof -ti tcp:5173 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo -e "${YELLOW}[gig]${RESET} Killing existing process on port 5173"
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  sleep 0.3
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║${RESET}    ${GREEN}DEViLBOX — LIVE PERFORMANCE MODE${RESET}          ${BOLD}║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${CYAN}URL:${RESET}     ${BOLD}http://localhost:5173${RESET}"
echo -e "  ${CYAN}Mode:${RESET}    Production build (static files)"
echo -e "  ${CYAN}Network:${RESET} Not required (all tracks from IndexedDB cache)"
echo ""
echo -e "  ${YELLOW}Ctrl-C to stop${RESET}"
echo ""

# Serve the production build with vite preview
# This is a lightweight static file server with proper COOP/COEP headers
exec ./node_modules/.bin/vite preview
