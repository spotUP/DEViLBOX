#!/bin/bash
# build.sh — Build UADE WASM module using Emscripten
#
# Prerequisites:
#   - Emscripten (emcc) in PATH
#   - Native C compiler (cc) for build tools
#   - UADE source at ../Reference Code/uade-3.05/
#
# Output:
#   ../public/uade/UADE.js
#   ../public/uade/UADE.wasm
#
# Usage:
#   cd uade-wasm && ./build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UADE_SRC="$SCRIPT_DIR/../Reference Code/uade-3.05"
OUT_DIR="$SCRIPT_DIR/../public/uade"
GEN_DIR="$SCRIPT_DIR/generated"   # Generated CPU tables

cd "$SCRIPT_DIR"

echo "=== UADE WASM Build ==="
echo "UADE source: $UADE_SRC"
echo "Output:      $OUT_DIR"

# ── Step 1: Generate player registry ─────────────────────────────────────
echo ""
echo "Step 1: Generating player registry..."
python3 generate_registry.py

# ── Step 2: Generate CPU opcode tables (native build tools) ──────────────
echo ""
echo "Step 2: Generating 68k CPU opcode tables..."
mkdir -p "$GEN_DIR"

NATIVE_INCLUDES=(
    "-I$UADE_SRC/src/include"
    "-I$UADE_SRC/src"
    "-I$UADE_SRC/src/frontends/include"
    "-I$SCRIPT_DIR/src"
)
NATIVE_CFLAGS=(-O2 -DHAVE_CONFIG_H -Wno-implicit-function-declaration -Wno-deprecated-declarations -Wno-format)

if [ ! -f "$GEN_DIR/cpuemu.c" ] || [ ! -f "$GEN_DIR/cpudefs.c" ]; then
    echo "  Building build68k (native)..."
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -o "$GEN_DIR/build68k" "$UADE_SRC/src/build68k.c"

    echo "  Generating cpudefs.c..."
    "$GEN_DIR/build68k" < "$UADE_SRC/src/table68k" > "$GEN_DIR/cpudefs.c"

    echo "  Building gencpu (native)..."
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -c -o "$GEN_DIR/gencpu.o" "$UADE_SRC/src/gencpu.c"
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -c -o "$GEN_DIR/readcpu.o" "$UADE_SRC/src/readcpu.c"
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -c -o "$GEN_DIR/cpudefs.o" "$GEN_DIR/cpudefs.c"
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -c -o "$GEN_DIR/missing.o" "$UADE_SRC/src/missing.c"
    cc "${NATIVE_CFLAGS[@]}" "${NATIVE_INCLUDES[@]}" -o "$GEN_DIR/gencpu" \
        "$GEN_DIR/gencpu.o" "$GEN_DIR/readcpu.o" "$GEN_DIR/cpudefs.o" "$GEN_DIR/missing.o"

    echo "  Generating cpuemu.c, cpustbl.c, cputbl.h..."
    (cd "$GEN_DIR" && ./gencpu)

    echo "  CPU tables generated."
else
    echo "  CPU tables already generated (skipping)."
fi

# ── Step 3: Compile with Emscripten ──────────────────────────────────────
echo ""
echo "Step 3: Compiling with Emscripten..."
mkdir -p "$OUT_DIR"

# UADE core source files (68k emulator + Paula chip)
UADE_CORE_SRCS=(
    "$UADE_SRC/src/audio.c"
    "$UADE_SRC/src/cfgfile.c"
    "$UADE_SRC/src/cia.c"
    "$UADE_SRC/src/compiler.c"
    "$UADE_SRC/src/custom.c"
    "$UADE_SRC/src/debug.c"
    "$UADE_SRC/src/fpp.c"
    # md-support.c excluded — it just #includes machdep/support.c which is listed below
    "$UADE_SRC/src/memory.c"
    "$UADE_SRC/src/missing.c"
    "$UADE_SRC/src/newcpu.c"
    "$UADE_SRC/src/readcpu.c"
    "$UADE_SRC/src/sd-sound-generic.c"
    "$UADE_SRC/src/text_scope.c"
    "$UADE_SRC/src/uade.c"
    "$UADE_SRC/src/uademain.c"
    "$UADE_SRC/src/sinctable.c"
    "$UADE_SRC/src/write_audio.c"
    "$UADE_SRC/src/machdep/support.c"
    # Generated CPU tables
    "$GEN_DIR/cpudefs.c"
    "$GEN_DIR/cpustbl.c"
    # state_detection.c excluded — uses zakalwe; replaced by stub
    # uade_logging.c excluded — uses zakalwe; replaced by stub
    # gencpu.c excluded — build-time code generator only
    # main.c excluded — has main(); not needed in WASM
)

# cpuemu.c gets split into numbered sections for compilation
# The original Makefile compiles cpuemu{1..8}.c but they're really just
# #include sections of cpuemu.c. We compile cpuemu.c directly with section defines.
CPUEMU_SRCS=()
for i in 1 2 3 4 5 6 7 8; do
    CPUEMU_SRCS+=("$GEN_DIR/cpuemu.c")
done

# UADE frontend source files (libuade)
UADE_FRONTEND_SRCS=(
    "$UADE_SRC/src/frontends/common/amifilemagic.c"
    "$UADE_SRC/src/frontends/common/eagleplayer.c"
    "$UADE_SRC/src/frontends/common/effects.c"
    "$UADE_SRC/src/frontends/common/fifo.c"
    "$UADE_SRC/src/frontends/common/md5.c"
    "$UADE_SRC/src/frontends/common/songdb.c"
    "$UADE_SRC/src/frontends/common/songinfo.c"
    "$UADE_SRC/src/frontends/common/support.c"
    "$UADE_SRC/src/frontends/common/uadeconf.c"
    "$UADE_SRC/src/frontends/common/uadecontrol.c"
    "$UADE_SRC/src/frontends/common/uadeipc.c"
    "$UADE_SRC/src/frontends/common/uadestate.c"
    "$UADE_SRC/src/frontends/common/uadeutils.c"
    "$UADE_SRC/src/frontends/common/unixwalkdir.c"
    "$UADE_SRC/src/frontends/common/vparray.c"
    # unixsupport.c excluded — fork/socketpair; replaced by shim_ipc.c
    # unixatomic.c excluded — replaced by unixatomic_wasm.c
    # rmc.c excluded — needs bencodetools; replaced by rmc_stub.c
)

# Our WASM-specific files
WASM_SRCS=(
    "$SCRIPT_DIR/src/entry.c"
    "$SCRIPT_DIR/src/shim_ipc.c"
    "$SCRIPT_DIR/src/player_registry.c"
    "$SCRIPT_DIR/src/uade_logging_stub.c"
    "$SCRIPT_DIR/src/state_detection_stub.c"
    "$SCRIPT_DIR/src/rmc_stub.c"
    "$SCRIPT_DIR/src/unixatomic_wasm.c"
    "$SCRIPT_DIR/src/uadecore_wasm.c"
    "$SCRIPT_DIR/src/uade_exit_override.c"
    "$SCRIPT_DIR/src/basedir_data.c"
)

# Include paths
INCLUDES=(
    "-I$SCRIPT_DIR/src"             # WASM shims (sd-sound.h etc.) take priority
    "-I$GEN_DIR"                    # Generated cputbl.h etc.
    "-I$UADE_SRC/src/include"
    "-I$UADE_SRC/src/frontends/include"  # <uade/amigafilter.h> etc.
    "-I$UADE_SRC/src/frontends/common"
    "-I$UADE_SRC/src"
    "-I$UADE_SRC/src/machdep"       # m68k.h, maccess.h
)

# Compiler flags
CFLAGS=(
    "-O2"
    "-DHAVE_CONFIG_H"
    "-DUADE_WASM=1"
    # Suppress warnings from legacy C code
    "-Wno-implicit-function-declaration"
    "-Wno-int-conversion"
    "-Wno-deprecated-declarations"
    "-Wno-format"
    "-Wno-unused"
)

# Linker flags (Emscripten 4.x: -sFLAG=VALUE, no space)
LDFLAGS=(
    # Memory
    "-sINITIAL_MEMORY=33554432"     # 32 MB initial
    "-sMAXIMUM_MEMORY=134217728"    # 128 MB max
    "-sALLOW_MEMORY_GROWTH=1"
    # WASM exports
    "-sEXPORTED_FUNCTIONS=['_uade_wasm_init','_uade_wasm_load','_uade_wasm_render','_uade_wasm_stop','_uade_wasm_get_subsong_count','_uade_wasm_get_subsong_min','_uade_wasm_get_subsong_max','_uade_wasm_get_player_name','_uade_wasm_get_format_name','_uade_wasm_set_subsong','_uade_wasm_set_looping','_uade_wasm_cleanup','_uade_wasm_get_channel_snapshot','_uade_wasm_get_channel_extended','_uade_wasm_get_cia_state','_uade_wasm_read_memory','_uade_wasm_get_total_frames','_malloc','_free']"
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','stringToUTF8','UTF8ToString','HEAPU8','HEAPU32','HEAPF32']"
    # WASM output format (for AudioWorklet — no ES modules)
    "-sMODULARIZE=1"
    "-sEXPORT_NAME=createUADE"
    "-sENVIRONMENT=worker"          # AudioWorklet runs in worker context
    # Filesystem (MEMFS for virtual eagleplayer storage)
    "-sFORCE_FILESYSTEM=1"
    # No main()
    "-sINVOKE_RUN=0"
    # Debug: assertions for better error messages
    "-sASSERTIONS=1"
    "-sSTACK_OVERFLOW_CHECK=1"
    # Output
    "-o" "$OUT_DIR/UADE.js"
)

# cpuemu.c is one big file that uses PART_N defines to compile each section.
# The Makefile handles this via cpuemu1.o..cpuemu8.o targets.
# We compile each part separately to object files, then link together.
echo "  Compiling cpuemu parts..."
CPUEMU_OBJS=()
for i in 1 2 3 4 5 6 7 8; do
    OBJ="$GEN_DIR/cpuemu${i}.o"
    emcc "${CFLAGS[@]}" "${INCLUDES[@]}" -DPART_${i} -c "$GEN_DIR/cpuemu.c" -o "$OBJ"
    CPUEMU_OBJS+=("$OBJ")
done

echo "  Compiling and linking all sources..."
emcc \
    "${CFLAGS[@]}" \
    "${INCLUDES[@]}" \
    "${UADE_CORE_SRCS[@]}" \
    "${UADE_FRONTEND_SRCS[@]}" \
    "${WASM_SRCS[@]}" \
    "${CPUEMU_OBJS[@]}" \
    "${LDFLAGS[@]}"

echo ""
echo "=== Build complete ==="
echo "Output: $OUT_DIR/UADE.js"
echo "Output: $OUT_DIR/UADE.wasm"
ls -lh "$OUT_DIR/UADE.js" "$OUT_DIR/UADE.wasm" 2>/dev/null || echo "(files will appear after first successful build)"
