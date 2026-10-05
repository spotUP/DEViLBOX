#!/bin/sh
# Build the native eagleplayer runner CLI (musashi-host/tools/eagle_cli.c) into
# musashi-host/tools/build/eagle_cli. Needs a host C compiler only.
set -e
H="$(cd "$(dirname "$0")/.." && pwd)"
R="$H/.."
B="$H/tools/build"
mkdir -p "$B/gen"
[ -f "$B/gen/m68kops.c" ] || { cc -O2 -o "$B/gen/m68kmake" "$R/third-party/musashi/m68kmake.c" && "$B/gen/m68kmake" "$B/gen" "$R/third-party/musashi/m68k_in.c" >/dev/null; }
# score as a C array (the binary UADE's wasm embeds)
SCORE="$R/third-party/uade-3.05/amigasrc/score/score"
{ echo "#include <stddef.h>"; echo "const unsigned char g_uade_score[] = {"; xxd -i < "$SCORE"; echo "};"; echo "const size_t g_uade_score_len = sizeof g_uade_score;"; } > "$B/gen/score_data.c"
cc -O2 -DMUSASHI_CNF='"m68kconf_host.h"' -I"$B/gen" -I"$R/third-party/musashi" -I"$H/src" -I"$R/tools/asm68k-to-c/runtime" \
  -o "$B/eagle_cli" "$H/tools/eagle_cli.c" "$H/src/eagle_runner.c" "$H/src/amiga_host.c" \
  "$R/tools/asm68k-to-c/runtime/paula_soft.c" "$R/third-party/musashi/m68kcpu.c" "$B/gen/m68kops.c" \
  "$R/third-party/musashi/softfloat/softfloat.c" "$B/gen/score_data.c" -lm
echo "$B/eagle_cli"
