#!/usr/bin/env bash
# Re-vendor emoon/nuade at <sha>. Pristine: replaces everything here except UPSTREAM.md and update.sh, rewrites
# UPSTREAM.md, and prints the player directories whose files changed (git diff --stat), so a bump re-runs only those
# formats' comparisons.
set -euo pipefail
sha="${1:?usage: update.sh <full-sha>}"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh api "repos/emoon/nuade/tarball/$sha" > "$tmp/nuade.tgz"
sum="$(shasum -a 256 "$tmp/nuade.tgz" | cut -d' ' -f1)"
mkdir "$tmp/x"
tar xzf "$tmp/nuade.tgz" -C "$tmp/x"
src="$(echo "$tmp"/x/*)"
find "$here" -mindepth 1 -maxdepth 1 ! -name UPSTREAM.md ! -name update.sh -exec rm -rf {} +
cp -R "$src"/. "$here"/
date_now="$(date +%Y-%m-%d)"
cat > "$here/UPSTREAM.md" <<EOT
# nuade - vendored upstream

- Repository: https://github.com/emoon/nuade (Daniel Collin / emoon, MIT)
- Pinned commit: $sha
- Pin date: $date_now
- Tarball sha256 (\`gh api repos/emoon/nuade/tarball/<sha>\`): $sum
- DEViLBOX changes: none. Everything of ours lives in \`nuade-wasm/\` (shim, CMake, build script). A fix this tree needs goes
  upstream as a PR and, until merged, as \`nuade-wasm/patches/NNNN-*.patch\` applied by \`nuade-wasm/build.sh\`.
- Bump: \`third-party/nuade/update.sh <sha>\` re-fetches, rewrites this file and lists the \`players/<id>\` directories that
  changed, so only those formats' comparisons re-run.
EOT
echo "changed player directories:"
git -C "$here" diff --name-only -- players | sed -n 's#^.*players/\([^/]*\)/.*#\1#p' | sort -u
