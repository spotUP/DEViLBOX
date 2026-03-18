#!/bin/bash
# Render originals and exports to WAV via openmpt123, then compare envelopes
set -uo pipefail

FORMATS_DIR="public/data/songs/formats"
EXPORTS_DIR="public/data/songs/exports"
AUDIT_DIR="/tmp/export-audit"

rm -rf "$AUDIT_DIR"
mkdir -p "$AUDIT_DIR"

echo "=== Export WAV Comparison Audit ==="
echo ""
printf "%-35s %-12s %-8s %-8s %-8s %s\n" "FILE" "FORMAT" "envCorr" "rmsdB" "divAt" "STATUS"
printf '%.0s-' {1..90}; echo ""

pass=0; fail=0; skip=0; total=0

# Process each export file
for export_file in "$EXPORTS_DIR"/*.mod "$EXPORTS_DIR"/*.xm; do
  [ -f "$export_file" ] || continue
  exportbase=$(basename "$export_file")
  exportstem="${exportbase%.*}"
  exportext="${exportbase##*.}"

  # Find matching original in formats/ dir
  orig_file=""
  for candidate in "$FORMATS_DIR"/"$exportstem".*; do
    [ -f "$candidate" ] || continue
    orig_file="$candidate"
    break
  done
  # Also check exports/ dir for originals copied there
  if [[ -z "$orig_file" ]]; then
    for candidate in "$EXPORTS_DIR"/"$exportstem".*; do
      [ -f "$candidate" ] || continue
      cext="${candidate##*.}"
      if [[ "$cext" != "$exportext" && "$cext" != "mod" && "$cext" != "xm" ]]; then
        orig_file="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$orig_file" ]]; then
    continue
  fi

  origbase=$(basename "$orig_file")
  origext="${origbase##*.}"
  total=$((total + 1))

  orig_wav="$AUDIT_DIR/orig.wav"
  export_wav="$AUDIT_DIR/export.wav"
  rm -f "$orig_wav" "$export_wav"

  # Render original
  openmpt123 --render --force --samplerate 44100 --channels 2 --no-float "$orig_file" 2>/dev/null || true
  rendered="${orig_file}.wav"
  if [[ -f "$rendered" ]]; then
    mv "$rendered" "$orig_wav"
  else
    printf "%-35s %-12s SKIP (openmpt can't load .%s)\n" "$exportstem" "$origext" "$origext"
    skip=$((skip + 1))
    continue
  fi

  # Render export
  openmpt123 --render --force --samplerate 44100 --channels 2 --no-float "$export_file" 2>/dev/null || true
  rendered="${export_file}.wav"
  if [[ -f "$rendered" ]]; then
    mv "$rendered" "$export_wav"
  else
    printf "%-35s %-12s SKIP (export render fail)\n" "$exportstem" "$origext"
    rm -f "$orig_wav"
    skip=$((skip + 1))
    continue
  fi

  # Compare
  result=$(npx tsx --tsconfig tsconfig.app.json tools/furnace-audit/compare-wavs.ts "$orig_wav" "$export_wav" 2>/dev/null || echo "ERROR")

  envCorr=$(echo "$result" | grep -oE '"envCorrelation":\s*[0-9.e+-]+' | grep -oE '[0-9.e+-]+$' || echo "?")
  rmsdB=$(echo "$result" | grep -oE '"rmsDb":\s*[-0-9.e]+' | grep -oE '[-0-9.e]+$' || echo "?")
  divAt=$(echo "$result" | grep -oE '"firstDivergenceSec":\s*[0-9.e+-]+' | grep -oE '[0-9.e+-]+$' || echo "?")

  if [[ "$envCorr" != "?" ]]; then
    # Truncate to 4 decimal places for display
    envDisp=$(printf "%.4f" "$envCorr" 2>/dev/null || echo "$envCorr")
    rmsDisp=$(printf "%.1f" "$rmsdB" 2>/dev/null || echo "$rmsdB")
    divDisp=$(printf "%.2f" "$divAt" 2>/dev/null || echo "$divAt")

    status="PASS"
    if (( $(echo "$envCorr < 0.50" | bc -l 2>/dev/null) )); then
      status="FAIL"
      fail=$((fail + 1))
    else
      pass=$((pass + 1))
    fi
    printf "%-35s %-12s %-8s %-8s %-8s %s\n" "$exportstem" "$origext" "$envDisp" "$rmsDisp" "$divDisp" "$status"
  else
    printf "%-35s %-12s COMPARE_ERR\n" "$exportstem" "$origext"
    fail=$((fail + 1))
  fi

  rm -f "$orig_wav" "$export_wav"
done

echo ""
echo "Total: $total  Pass: $pass  Fail: $fail  Skip: $skip"
