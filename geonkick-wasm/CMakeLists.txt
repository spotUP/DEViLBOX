cmake_minimum_required(VERSION 3.13)
project(GeonkickWASM LANGUAGES C)

# Compile the pure-C geonkick DSP engine (src/dsp/src/*.c) to WebAssembly
# via Emscripten. We skip:
#   - gkick_jack.c           — JACK standalone, not needed in browser
#   - worker.c               — pthread-based, replaced by common/worker_stub.c
#   - src/ top-level (GUI)   — not part of the DSP library
#
# The upstream ships as pure C (geonkick.c, synthesizer.c, oscillator.c,
# envelope.c, filter.c, distortion.c, mixer.c, humanizer.c, gkick_audio.c,
# gkick_buffer.c, ring_buffer.c, audio_output.c, gkick_log.c) so we link as
# a single C executable with a small extern-C bridge.

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

set(GKICK_DSP "${CMAKE_SOURCE_DIR}/../third-party/geonkick-master/src/dsp/src")
set(GKICK_TOOLS "${GKICK_DSP}/quamplex_dsp_tools")

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/geonkick")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

# Upstream bans -ffast-math (uses NaN detection for safety). Respect it.
# -O3 + loop/math safety flags match the upstream DSP build profile, minus
# the SSE-specific flags (Emscripten targets WASM, not x86).
set(GKICK_OPT_FLAGS "-O3 -funsafe-math-optimizations -fno-math-errno -fno-trapping-math -fomit-frame-pointer")
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${GKICK_OPT_FLAGS} -fvisibility=hidden")

add_executable(Geonkick
    common/geonkick_bridge.c
    common/worker_stub.c
    ${GKICK_DSP}/geonkick.c
    ${GKICK_DSP}/gkick_audio.c
    ${GKICK_DSP}/gkick_buffer.c
    ${GKICK_DSP}/gkick_log.c
    ${GKICK_DSP}/ring_buffer.c
    ${GKICK_DSP}/audio_output.c
    ${GKICK_DSP}/mixer.c
    ${GKICK_DSP}/synthesizer.c
    ${GKICK_DSP}/oscillator.c
    ${GKICK_DSP}/envelope.c
    ${GKICK_DSP}/filter.c
    ${GKICK_DSP}/distortion.c
    ${GKICK_DSP}/humanizer.c
)

target_include_directories(Geonkick PRIVATE
    ${GKICK_DSP}
    ${GKICK_TOOLS}
    ${CMAKE_SOURCE_DIR}/common
)

# Match upstream CMake version defines so geonkick.h version macros work.
# GEONKICK_SINGLE forces GEONKICK_MAX_INSTRUMENTS=1 — for MVP we ship a
# single-kick build (drop-in expand to 16-slot kit is a one-flag follow-up).
target_compile_definitions(Geonkick PRIVATE
    GEONKICK_VERSION_HEX=0x030700
    GEONKICK_VERSION_STR="3.7.0"
    GEONKICK_SINGLE
)

set_target_properties(Geonkick PROPERTIES
    OUTPUT_NAME "Geonkick"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(Geonkick PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createGeonkickModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=0"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPF32','HEAPU8']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_gk_wasm_create','_gk_wasm_destroy','_gk_wasm_key_pressed','_gk_wasm_render_mono','_gk_wasm_get_length','_gk_wasm_set_length','_gk_wasm_set_limiter']"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--no-entry"
    -O3
)
