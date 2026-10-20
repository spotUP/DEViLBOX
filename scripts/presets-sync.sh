#!/usr/bin/env bash
# Clone or pull the devilbox-presets repo into public/data/presets (git-ignored by DEViLBOX).
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="public/data/presets"
URL="https://github.com/spotUP/devilbox-presets.git"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR")" ]; then
  echo "$DIR exists and is not a devilbox-presets clone; move it away first." >&2; exit 1
else
  mkdir -p "$(dirname "$DIR")"
  git clone "$URL" "$DIR"
fi
