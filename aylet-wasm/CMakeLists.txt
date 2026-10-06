cmake_minimum_required(VERSION 3.13)
project(aylet-wasm C)

# aylet 0.5 (GPL-2.0-or-later) compiled to wasm. The emulation core is used
# in place from third-party/aylet-0.5 (sound.c and the Z80 opcode tables);
# src/z80_frame.c is its z80.c made re-entrant, src/aylet_wasm.c the bridge.
set(CMAKE_C_STANDARD 11)
set(AYLET_DIR ${CMAKE_SOURCE_DIR}/../third-party/aylet-0.5)

set(SOURCES
    ${AYLET_DIR}/sound.c
    src/z80_frame.c
    src/aylet_wasm.c
)

add_executable(Aylet ${SOURCES})

target_include_directories(Aylet PRIVATE ${AYLET_DIR} src)

set_target_properties(Aylet PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/aylet"
)

target_compile_options(Aylet PRIVATE -O2 -Wall -Wno-unused-label -Wno-parentheses)

set(EXPORTED_FUNCS "_malloc,_free,_aylet_wasm_init,_aylet_wasm_load,_aylet_wasm_render,_aylet_wasm_stop,_aylet_wasm_set_mute_mask,_aylet_wasm_get_num_tracks,_aylet_wasm_get_first_track,_aylet_wasm_get_track,_aylet_wasm_is_finished,_aylet_wasm_get_author,_aylet_wasm_get_misc,_aylet_wasm_get_track_name,_aylet_wasm_step_frame,_aylet_wasm_get_regs")

target_link_options(Aylet PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createAylet"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[cwrap,ccall,UTF8ToString,HEAPU8,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -O2
    --no-entry
)
