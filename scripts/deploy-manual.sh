#!/usr/bin/env bash
#
# Manual deploy to devilbox.uprough.net.
#
# For when GitHub Actions cannot build — on 2026-09-18 every run had been
# failing in under 10 seconds with "recent account payments have failed or your
# spending limit needs to be increased", and the live site had been frozen on
# the 2026-08-23 build for 26 days.
#
# This does what `.github/workflows/deploy.yml` does, minus the GitHub Release
# round trip: build, then rsync straight into the server's web root. That IS
# the last step of /opt/devilbox-deploy.sh, and skipping the release matters
# because the dist tarball is 1.2 GB.
#
# Usage:  ./scripts/deploy-manual.sh [--dry-run]
#
set -euo pipefail

REMOTE="root@devilbox.uprough.net"
REMOTE_DIR="/var/www/devilbox-dist"
# The value the CI build gets by falling back, because it has no repo .env.
PROD_API_URL="https://devilbox.uprough.net/api"

DRY=""
[[ "${1:-}" == "--dry-run" ]] && DRY="--dry-run"

cd "$(dirname "$0")/.."

# ── The trap this script exists to prevent ───────────────────────────────────
#
# Vite INLINES `import.meta.env.VITE_API_URL` at build time. The repo's `.env`
# sets it to http://localhost:3011/api for development, and CI never sees that
# file, so a CI build bakes in the production fallback. A local build bakes in
# LOCALHOST — and the deployed site then asks the user's own machine for the
# modland index and every other API call, which fails with "failed to fetch"
# for everyone. That shipped once, on 2026-09-18, from this exact route.
#
# So the value is forced here rather than left to whatever .env happens to say.
echo "==> Building with VITE_API_URL=${PROD_API_URL}"
VITE_API_URL="$PROD_API_URL" npm run build

# Verify rather than trust: a build that still mentions the dev API would break
# the live site the moment it landed.
if grep -rqs "localhost:3011" dist/assets/; then
  echo "REFUSING TO DEPLOY: the bundle still references localhost:3011." >&2
  echo "Something overrode VITE_API_URL — check .env.local, which beats .env." >&2
  exit 1
fi
echo "==> Bundle references the production API"

# `-c` compares CONTENT. A fresh build resets every mtime, so without it rsync
# re-sends all 1.9 GB instead of the ~600 MB that actually changed.
echo "==> Syncing to ${REMOTE}:${REMOTE_DIR}"
rsync -a -c --delete --stats $DRY dist/ "${REMOTE}:${REMOTE_DIR}/"

if [[ -n "$DRY" ]]; then
  echo "==> Dry run only; nothing was changed."
  exit 0
fi

echo "==> Verifying what is live"
LOCAL_HASH="$(node -e 'console.log(require("./dist/version.json").buildHash)')"
LIVE_HASH="$(curl -s https://devilbox.uprough.net/version.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).buildHash))')"
echo "    local: ${LOCAL_HASH}"
echo "    live:  ${LIVE_HASH}"
[[ "$LOCAL_HASH" == "$LIVE_HASH" ]] || { echo "MISMATCH — the deploy did not land." >&2; exit 1; }
echo "==> Deployed."

# NOTE: deliberately does NOT touch the `latest` GitHub Release. The workflow
# deletes and recreates it, but that release also holds the desktop installers
# (.dmg, .exe, .AppImage, .deb) which cannot be rebuilt for every platform
# locally. Replace the single devilbox-dist.tar.gz asset if you need to.
