#!/bin/bash
# Persistent dev server that auto-restarts if killed
# Starts both frontend (Vite) and backend (Express) servers

set -e  # Exit on error during setup

echo "Starting DEViLBOX development environment..."

# Check and install backend dependencies if needed
if [ ! -d "server/node_modules" ]; then
  echo "[$(date)] Installing backend dependencies..."
  cd server && npm install && cd ..
fi

# Cleanup function to kill both servers on exit
cleanup() {
  echo ""
  echo "[$(date)] Shutting down servers..."
  if [ ! -z "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    echo "[$(date)] Backend server stopped"
  fi
  if [ ! -z "$FRONTEND_PID" ]; then
    kill $FRONTEND_PID 2>/dev/null || true
    echo "[$(date)] Frontend server stopped"
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend server
echo "[$(date)] Starting backend server on port 3001..."
cd server && npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo "[$(date)] Backend server started (PID: $BACKEND_PID)"

# Wait a moment for backend to initialize
sleep 2

# Start frontend with auto-restart loop
echo "[$(date)] Starting frontend dev server on port 5173..."
mkdir -p logs

while true; do
  echo "[$(date)] Starting Vite dev server..."
  NODE_OPTIONS="--max-old-space-size=1024" npm run dev 2>&1 | tee logs/frontend.log &
  FRONTEND_PID=$!
  
  wait $FRONTEND_PID
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 137 ]; then
    echo "[$(date)] Frontend killed (OOM), restarting in 3 seconds..."
    sleep 3
  else
    echo "[$(date)] Frontend exited with code $EXIT_CODE"
    cleanup
  fi
done
