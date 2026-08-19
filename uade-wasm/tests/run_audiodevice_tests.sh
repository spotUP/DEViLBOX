#!/usr/bin/env bash
# run_audiodevice_tests.sh — build and run the fake audio.device memory-safety harness.
#
# Compiles third-party/uade-3.05/src/audiodevice.c against the test shim in adshim/
# under AddressSanitizer + UBSan with -fno-sanitize-recover=all, so any out-of-bounds
# access or undefined behaviour aborts the process instead of printing and continuing.
#
# Each case runs in its own process with a timeout: an unbounded loop in the reply-list
# walk shows up as a timeout rather than hanging the suite.
#
# Usage: ./run_audiodevice_tests.sh [path/to/audiodevice.c]
#   (the optional argument lets you point the harness at an older revision of the file,
#    which is how the fix was verified: every case fails against the pre-fix source)

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UADE_SRC="$HERE/../../third-party/uade-3.05"
TARGET="${1:-$UADE_SRC/src/audiodevice.c}"
BIN="$(mktemp -t audiodevice_harness)"

CASES=(
    write_no_channel
    pervol_no_channel
    abortio_bad_cmd
    open_huge_length
    bad_request_addr
    cyclic_reply_list
)

CFLAGS=(
    -fsanitize=address,undefined
    -fno-sanitize-recover=all
    -fno-omit-frame-pointer
    -g -O1
    -DHAVE_CONFIG_H
    -Wno-implicit-function-declaration
    -Wno-int-conversion
    -Wno-format
    -Wno-pointer-to-int-cast
    -Wno-int-to-pointer-cast
    -Wno-comment
    "-I$HERE/adshim"
    "-I$UADE_SRC/src"
    "-I$UADE_SRC/src/amiga-ndk"
)

if ! cc "${CFLAGS[@]}" -o "$BIN" "$HERE/test_audiodevice.c" "$TARGET"; then
    echo "FATAL: could not build the audio.device harness" >&2
    exit 2
fi

# `timeout` is coreutils; fall back to gtimeout (homebrew) or no timeout at all.
if command -v timeout >/dev/null 2>&1; then TIMEOUT=(timeout 30)
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT=(gtimeout 30)
else TIMEOUT=(); fi

failures=0
for name in "${CASES[@]}"; do
    printf '%-20s ' "$name"
    output="$("${TIMEOUT[@]}" "$BIN" "$name" 2>&1)"
    rc=$?
    if [ $rc -eq 0 ]; then
        echo "ok"
    elif [ $rc -eq 124 ]; then
        echo "FAIL (timed out — unbounded loop)"
        failures=$((failures + 1))
    else
        echo "FAIL (rc=$rc)"
        echo "$output" | grep -E 'runtime error|ERROR: AddressSanitizer|SUMMARY' | head -3 | sed 's/^/    /'
        failures=$((failures + 1))
    fi
done

rm -f "$BIN"

if [ $failures -ne 0 ]; then
    echo "$failures/${#CASES[@]} audio.device safety cases failed" >&2
    exit 1
fi
echo "all ${#CASES[@]} audio.device safety cases passed"
