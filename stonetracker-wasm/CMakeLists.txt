cmake_minimum_required(VERSION 3.13)
project(stonetracker-wasm C)

# StoneTracker (.spm + .sps, Amiga) compiled to wasm: the authors' no-OS
# player third-party/stonetracker/StonePlayer_Hard.bin (StonePlayer V1.98,
# Aminet stonefree2, free re-release 2001) runs on Musashi's 68020 core
# (third-party/musashi, MIT) on the shared host musashi-host/ (Paula, CIAs,
# time) with StonePlayer's layout and calls in src/st_machine.c. Decision record:
# thoughts/shared/research/2026-10-05_stonetracker-replayer.md
#
#   cd stonetracker-wasm && mkdir -p build && cd build && emcmake cmake .. && emmake make
set(CMAKE_C_STANDARD 99)
set(PLAYER_BIN ${CMAKE_SOURCE_DIR}/../third-party/stonetracker/StonePlayer_Hard.bin)
set(GEN_DIR ${CMAKE_BINARY_DIR}/gen)
file(MAKE_DIRECTORY ${GEN_DIR})
include(${CMAKE_SOURCE_DIR}/../musashi-host/MusashiHost.cmake)

# The player binary as a C array.
file(READ ${PLAYER_BIN} PLAYER_HEX HEX)
string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," PLAYER_ARRAY ${PLAYER_HEX})
file(WRITE ${GEN_DIR}/stoneplayer_hard.h
  "/* generated from third-party/stonetracker/StonePlayer_Hard.bin */\nstatic const unsigned char g_stoneplayer_hard[] = {${PLAYER_ARRAY}};\n")

set(SOURCES
    src/st_dhuf.c
    src/st_machine.c
    src/stonetracker_wasm.c
)

add_executable(StoneTracker ${SOURCES})
target_include_directories(StoneTracker PRIVATE ${GEN_DIR} src)
# Musashi 68020 + the minimal Amiga + the shared software Paula
musashi_host_add(StoneTracker)

set_target_properties(StoneTracker PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/stonetracker"
)

target_compile_options(StoneTracker PRIVATE -O2 -Wall -Wno-unused-variable -Wno-unused-function -Wno-sign-compare)

set(EXPORTED_FUNCS "_malloc,_free,_st_wasm_init,_st_wasm_load,_st_wasm_render,_st_wasm_render_channels,_st_wasm_stop,_st_wasm_set_mute_mask,_st_wasm_get_position,_st_wasm_get_line,_st_wasm_crashed")

target_link_options(StoneTracker PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createStoneTracker"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=131072"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -O2
    --no-entry
)
