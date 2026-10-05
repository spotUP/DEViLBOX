cmake_minimum_required(VERSION 3.13)
project(psgplay-wasm C)

# PSG play (Fredrik Noring, GPL-2.0; Musashi MIT, toslibc LGPL-2.1) compiled
# to wasm for Atari ST SNDH playback. The library is used in place from
# third-party/psgplay; generated/ holds the sources its Makefile generates
# (regen-generated.sh); src/psgplay_wasm.c is the bridge.
set(CMAKE_C_STANDARD 11)
set(P ${CMAKE_SOURCE_DIR}/../third-party/psgplay)

set(SOURCES
    ${P}/lib/ice/ice.c
    ${P}/lib/psgplay/psgplay.c
    ${P}/lib/psgplay/sndh.c
    ${P}/lib/internal/bit.c
    ${P}/lib/internal/fifo.c
    ${P}/lib/internal/string.c
    ${P}/lib/toslibc/lib/unicode-atari.c
    ${P}/lib/toslibc/lib/unicode-utf8.c
    ${P}/lib/atari/bus.c
    ${P}/lib/atari/cpu.c
    ${P}/lib/atari/dac.c
    ${P}/lib/atari/device.c
    ${P}/lib/atari/exception-vector.c
    ${P}/lib/atari/fdc.c
    ${P}/lib/atari/glue.c
    ${P}/lib/atari/irq-trace.c
    ${P}/lib/atari/machine.c
    ${P}/lib/atari/mfp.c
    ${P}/lib/atari/mixer.c
    ${P}/lib/atari/mmu.c
    ${P}/lib/atari/mmu-trace.c
    ${P}/lib/atari/psg.c
    ${P}/lib/atari/ram.c
    ${P}/lib/atari/rom.c
    ${P}/lib/atari/shifter.c
    ${P}/lib/atari/sound.c
    ${P}/lib/atari/system-variable.c
    ${P}/lib/cf2149/module/cf2149.c
    ${P}/lib/cf68901/module/cf68901.c
    ${P}/lib/cf300588/module/cf300588-sound.c
    ${P}/lib/m68k/m68kcpu.c
    ${CMAKE_SOURCE_DIR}/generated/m68k/m68kops.c
    src/psgplay_wasm.c
)

add_executable(Psgplay ${SOURCES})

target_include_directories(Psgplay PRIVATE
    ${CMAKE_SOURCE_DIR}/generated
    ${P}/include
    ${P}/lib/cf2149/include
    ${P}/lib/cf68901/include
    ${P}/lib/cf300588/include
    ${P}/lib/toslibc/include
)

target_compile_definitions(Psgplay PRIVATE _GNU_SOURCE)
# Musashi traps bus/address errors with setjmp around its execute loop.
# Emscripten's default (JS) setjmp wraps every indirect call there in an
# invoke_* trampoline - half the CPU time; wasm-native setjmp/longjmp does not.
target_compile_options(Psgplay PRIVATE -O2 -Wall -Wno-unused-function "SHELL:-s SUPPORT_LONGJMP=wasm")

set_target_properties(Psgplay PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/psgplay"
)

set(EXPORTED_FUNCS "_malloc,_free,_psgplay_wasm_load,_psgplay_wasm_render,_psgplay_wasm_render_channels,_psgplay_wasm_set_mute_mask,_psgplay_wasm_stop,_psgplay_wasm_free,_psgplay_wasm_step_frame,_psgplay_wasm_get_regs,_psgplay_wasm_subtune_count,_psgplay_wasm_default_subtune,_psgplay_wasm_subtune_time,_psgplay_wasm_tag")

# psgplay_read_stereo keeps ~100 KB of sample arrays on the stack (upstream's
# web build uses 5 MB); the default 64 KB stack overflows.
target_link_options(Psgplay PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createPsgplay"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[cwrap,ccall,UTF8ToString,HEAPU8,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s SUPPORT_LONGJMP=wasm"
    -O2
    --no-entry
)
