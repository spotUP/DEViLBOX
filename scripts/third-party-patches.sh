#!/usr/bin/env bash
# Local changes to vendored upstream repos under third-party/, kept as patches in third-party-patches/ so they are
# versioned with the project instead of living only in a nested clone's working tree.
#
#   scripts/third-party-patches.sh export   write each nested repo's change on top of its pinned commit
#   scripts/third-party-patches.sh apply    apply the patches to freshly checked-out nested repos (skips applied ones)
#   scripts/third-party-patches.sh verify   every patch is either applied or applies cleanly; nothing else differs
#
# The list is third-party-patches/PATCHES.txt: "<repo path> | <patch file>".
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
list="$root/third-party-patches/PATCHES.txt"
mode="${1:-}"
status=0

entries() { grep -v '^[[:space:]]*#' "$list" | grep -v '^[[:space:]]*$' | while IFS='|' read -r p f; do echo "$(echo $p)|$(echo $f)"; done; }

while IFS='|' read -r repo patch; do
  dir="$root/$repo"; file="$root/third-party-patches/$patch"
  [ -e "$dir/.git" ] || { echo "[SKIP] $repo: not checked out"; continue; }
  case "$mode" in
    export)
      git -C "$dir" add -N . 2>/dev/null || true
      git -C "$dir" diff HEAD --ignore-submodules=all --binary > "$file"
      git -C "$dir" reset -q 2>/dev/null || true
      echo "[OK] $patch ($(grep -c '^diff --git' "$file") files)" ;;
    apply)
      if git -C "$dir" apply --check -R "$file" 2>/dev/null; then echo "[OK] $patch already applied"
      elif git -C "$dir" apply --check "$file" 2>/dev/null; then git -C "$dir" apply "$file"; echo "[OK] $patch applied"
      else echo "[ERROR] $patch neither applied nor applicable in $repo"; status=1; fi ;;
    verify)
      if git -C "$dir" apply --check -R "$file" 2>/dev/null; then echo "[OK] $patch applied"
      elif git -C "$dir" apply --check "$file" 2>/dev/null; then echo "[OK] $patch applies cleanly (not applied yet)"
      else echo "[ERROR] $patch does not match $repo"; status=1; fi ;;
    *) echo "usage: $0 export|apply|verify"; exit 2 ;;
  esac
done < <(entries)
exit $status
