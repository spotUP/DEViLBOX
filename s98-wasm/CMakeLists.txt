cmake_minimum_required(VERSION 3.13)
project(s98-wasm CXX)

# S98 register logs (PC-88 / PC-98 / X1 / MSX FM music) compiled to wasm.
# src/s98_wasm.cpp reads the S98 header and command stream and drives one
# ymfm chip (Aaron Giles, BSD-3-Clause) per device, used in place from the
# furnace tree like tfm-wasm; the YM2608 rhythm ROM comes from Furnace's
# sound/rss.h.
set(CMAKE_CXX_STANDARD 17)
set(FURNACE_PLATFORM ${CMAKE_SOURCE_DIR}/../third-party/furnace-master/src/engine/platform)
set(YMFM_DIR ${FURNACE_PLATFORM}/sound/ymfm)

set(SOURCES
    ${YMFM_DIR}/ymfm_adpcm.cpp
    ${YMFM_DIR}/ymfm_misc.cpp
    ${YMFM_DIR}/ymfm_opl.cpp
    ${YMFM_DIR}/ymfm_opm.cpp
    ${YMFM_DIR}/ymfm_opn.cpp
    ${YMFM_DIR}/ymfm_pcm.cpp
    ${YMFM_DIR}/ymfm_ssg.cpp
    src/s98_wasm.cpp
)

add_executable(S98 ${SOURCES})

target_include_directories(S98 PRIVATE ${YMFM_DIR} ${FURNACE_PLATFORM} src)

set_target_properties(S98 PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/s98"
)

target_compile_options(S98 PRIVATE -O2 -Wall -Wno-unused-variable -Wno-sign-compare)

set(EXPORTED_FUNCS "_malloc,_free,_s98_wasm_load,_s98_wasm_render,_s98_wasm_render_channels,_s98_wasm_set_mute_mask,_s98_wasm_free,_s98_wasm_device_count,_s98_wasm_device_type,_s98_wasm_device_plays")

target_link_options(S98 PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createS98"
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
