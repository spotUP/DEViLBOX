#!/usr/bin/env bash
# Commit only the named files on top of the CURRENT HEAD, safely while other
# agents commit to the same branch.
#
#   scripts/commit-files.sh -m "message" [-F msgfile] -- file1 file2 ...
#
# Why: a temp index built by `git read-tree HEAD` before another agent's
# commit lands still holds the old tree. Committing it - for instance on a
# retry after "cannot lock ref HEAD" - silently reverts that agent's commit
# (c0480716b reverted 32b2d9eaa, 2026-10-06). This script rebuilds the
# index from the live HEAD on every attempt, and refuses the commit if its
# diff touches any file that was not named.
set -euo pipefail

msg_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m|-F) msg_args+=("$1" "$2"); shift 2 ;;
    --) shift; break ;;
    *) echo "commit-files: unknown option $1" >&2; exit 2 ;;
  esac
done
[ ${#msg_args[@]} -gt 0 ] || { echo "commit-files: -m or -F required" >&2; exit 2; }
[ $# -gt 0 ] || { echo "commit-files: no files named" >&2; exit 2; }
files=("$@")

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
export GIT_INDEX_FILE="$tmp_dir/index"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  base=$(git rev-parse HEAD)
  git read-tree "$base"
  git add -- "${files[@]}"

  # Every changed path must be one of the named files (or under a named dir).
  unexpected=$(git diff --cached --name-only "$base" | while read -r path; do
    ok=0
    for f in "${files[@]}"; do
      case "$path" in "${f%/}"|"${f%/}"/*) ok=1; break ;; esac
    done
    [ $ok -eq 1 ] || echo "$path"
  done)
  if [ -n "$unexpected" ]; then
    echo "commit-files: refusing, the commit would also change:" >&2
    echo "$unexpected" >&2
    exit 1
  fi

  if git commit -q "${msg_args[@]}"; then
    unset GIT_INDEX_FILE
    git reset -q
    git log --oneline -1
    exit 0
  fi
  # HEAD moved under us (another agent committed): rebuild and try again.
  if [ "$(git rev-parse HEAD)" = "$base" ]; then
    echo "commit-files: commit failed and HEAD did not move; not retrying" >&2
    exit 1
  fi
  echo "commit-files: HEAD moved, rebuilding the index (attempt $attempt)" >&2
  sleep 2
done
echo "commit-files: gave up after 10 attempts" >&2
exit 1
