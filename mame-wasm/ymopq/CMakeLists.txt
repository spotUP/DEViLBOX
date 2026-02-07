cmake_minimum_required(VERSION 3.10)
# YMOPQ (Yamaha YM3806) FM Synthesizer WASM Build
# Based on Aaron Giles' ymfm library (BSD-3-Clause)
# 8-channel 4-operator FM synthesis

set(YMFM_DIR ${CMAKE_SOURCE_DIR}/../ymfm)

set(YMOPQ_SOURCES
    YMOPQSynth.cpp
    ${YMFM_DIR}/ymfm_opq.cpp
)

add_executable(YMOPQ_WASM ${YMOPQ_SOURCES})

target_include_directories(YMOPQ_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${YMFM_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${YMOPQ_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(YMOPQ_WASM PROPERTIES
    OUTPUT_NAME "YMOPQ"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/mame"
)

target_link_options(YMOPQ_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createYMOPQModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
