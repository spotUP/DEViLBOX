#!/bin/bash
# Simple dev server startup - runs both backend and frontend

echo "Starting DEViLBOX development environment..."

# Check and install backend dependencies if needed
if [ ! -d "server/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd server && npm install && cd ..
fi

# Check if Furnace WASM needs rebuilding
FURNACE_WASM="public/furnace-dispatch/FurnaceDispatch.wasm"
FURNACE_SRC="furnace-wasm/common/FurnaceDispatchWrapper.cpp"
if [ -f "$FURNACE_SRC" ] && [ -f "$FURNACE_WASM" ]; then
  if [ "$FURNACE_SRC" -nt "$FURNACE_WASM" ]; then
    echo "Furnace WASM source changed, rebuilding..."
    if [ -d "furnace-wasm/build" ]; then
      cd furnace-wasm/build && make -j4 && cd ../..
      echo "✓ Furnace WASM rebuilt"
    else
      echo "⚠ furnace-wasm/build not found, skipping WASM rebuild"
    fi
  fi
elif [ ! -f "$FURNACE_WASM" ] && [ -d "furnace-wasm/build" ]; then
  echo "Furnace WASM missing, building..."
  cd furnace-wasm/build && make -j4 && cd ../..
  echo "✓ Furnace WASM built"
fi

# Cleanup function
cleanup() {
  echo ""
  echo "Shutting down servers..."
  [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
  [ ! -z "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Create logs directory
mkdir -p logs

# Start backend server
echo "Starting backend server on port 3001..."
cd server && npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo "✓ Backend started (PID: $BACKEND_PID) - logs: logs/backend.log"

# Wait for backend to initialize
sleep 2

# Start frontend server
echo "Starting frontend dev server on port 5173..."
npm run dev 2>&1 | tee logs/frontend.log &
FRONTEND_PID=$!
echo "✓ Frontend started (PID: $FRONTEND_PID) - logs: logs/frontend.log"

echo ""
echo "=================="
echo "DEViLBOX is running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo "  Logs:     logs/"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "=================="

# Wait for either process to exit
wait
