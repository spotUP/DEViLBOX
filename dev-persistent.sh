#!/bin/bash
# Persistent dev server that auto-restarts if killed

echo "Starting DEViLBOX with auto-restart..."

while true; do
  echo "[$(date)] Starting dev server..."
  NODE_OPTIONS="--max-old-space-size=1024" npm run dev
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 137 ]; then
    echo "[$(date)] Server was killed (OOM), restarting in 3 seconds..."
    sleep 3
  else
    echo "[$(date)] Server exited with code $EXIT_CODE"
    exit $EXIT_CODE
  fi
done
