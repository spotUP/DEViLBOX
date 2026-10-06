cmake_minimum_required(VERSION 3.13)
project(eagleplayer-wasm C)

# EaglePlayer: any UADE eagleplayer on the shared 68000 host (musashi-host/).
# UADE's own sound core (third-party/uade-3.05/amigasrc/score/score, the
# committed binary UADE's wasm embeds) is the eagleplayer ABI; the player
# binary and the module arrive at load time, so a format is data
# (src/engine/eagleplayer/eaglePlayerFormats.ts), not C.
# Ledger: thoughts/shared/plans/2026-10-05-musashi-replayer-host.md
#
#   cd eagleplayer-wasm && mkdir -p build && cd build && emcmake cmake .. && emmake make
set(CMAKE_C_STANDARD 99)
set(SCORE_BIN ${CMAKE_SOURCE_DIR}/../third-party/uade-3.05/amigasrc/score/score)
set(GEN_DIR ${CMAKE_BINARY_DIR}/gen)
file(MAKE_DIRECTORY ${GEN_DIR})
include(${CMAKE_SOURCE_DIR}/../musashi-host/MusashiHost.cmake)

file(READ ${SCORE_BIN} SCORE_HEX HEX)
string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," SCORE_ARRAY ${SCORE_HEX})
file(WRITE ${GEN_DIR}/uade_score.h
  "/* generated from third-party/uade-3.05/amigasrc/score/score */\nstatic const unsigned char g_uade_score[] = {${SCORE_ARRAY}};\n")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${SCORE_BIN})

add_executable(EaglePlayer src/eagleplayer_wasm.c)
target_include_directories(EaglePlayer PRIVATE ${GEN_DIR})
musashi_host_add(EaglePlayer EAGLE)

set_target_properties(EaglePlayer PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/eagleplayer"
)

target_compile_options(EaglePlayer PRIVATE -O2 -Wall -Wno-unused-variable -Wno-unused-function -Wno-sign-compare)

set(EXPORTED_FUNCS "_malloc,_free,_ep_wasm_init,_ep_wasm_add_file,_ep_wasm_clear_files,_ep_wasm_load,_ep_wasm_render,_ep_wasm_render_voices,_ep_wasm_set_voice_mask,_ep_wasm_set_subsong,_ep_wasm_subsong_min,_ep_wasm_subsong_max,_ep_wasm_subsong_current,_ep_wasm_song_ended,_ep_wasm_player_ticks,_ep_wasm_set_song_end_detection,_ep_wasm_stop,_ep_wasm_player_name,_ep_wasm_format_name,_ep_wasm_last_message,_ep_wasm_log,_ep_wasm_unsupported,_ep_wasm_voice_state")

target_link_options(EaglePlayer PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createEaglePlayer"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPF32,UTF8ToString,stringToUTF8,lengthBytesUTF8]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=131072"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -O2
    --no-entry
)
