cmake_minimum_required(VERSION 3.13)
project(tfm-wasm CXX)

# TFM Music Maker (.tfe, ZX Spectrum TurboFM) compiled to wasm.
# src/tfm_player.cpp: ZXTune's TFM Music Maker parser + player (GPL-3.0),
# extracted from its framework. The YM2203 is ymfm (BSD-3-Clause), used in
# place from the furnace tree like furnace-wasm does.
set(CMAKE_CXX_STANDARD 17)
set(YMFM_DIR ${CMAKE_SOURCE_DIR}/../third-party/furnace-master/src/engine/platform/sound/ymfm)

set(SOURCES
    ${YMFM_DIR}/ymfm_opn.cpp
    ${YMFM_DIR}/ymfm_ssg.cpp
    ${YMFM_DIR}/ymfm_adpcm.cpp
    src/tfm_player.cpp
    src/tfm_wasm.cpp
)

add_executable(TFM ${SOURCES})

target_include_directories(TFM PRIVATE ${YMFM_DIR} src)

set_target_properties(TFM PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/tfm"
)

target_compile_options(TFM PRIVATE -O2 -fexceptions -Wall -Wno-unused-variable -Wno-sign-compare)

set(EXPORTED_FUNCS "_malloc,_free,_tfm_wasm_init,_tfm_wasm_load,_tfm_wasm_render,_tfm_wasm_stop,_tfm_wasm_set_mute_mask,_tfm_wasm_get_position,_tfm_wasm_get_line")

target_link_options(TFM PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createTFM"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=131072"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -fexceptions
    -O2
    --no-entry
)
