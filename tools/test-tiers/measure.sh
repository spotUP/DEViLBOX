#!/usr/bin/env bash
# Rank test files by duration from a GitHub Actions log, to refresh heavy.json.
# Usage: tools/test-tiers/measure.sh <run-id>   (prints "seconds file", slowest first)
set -euo pipefail
gh run view "$1" --log \
  | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -E " [✓×❯] src/.*\([0-9]+ tests?" \
  | sed -E 's/.* [✓×❯] (src\/[^ ]+) .*\) ([0-9.]+)(m?s).*/\2 \3 \1/' \
  | awk '{v=$1; if ($2=="s") v=v*1000; printf "%.1f %s\n", v/1000, $3}' \
  | sort -rn
