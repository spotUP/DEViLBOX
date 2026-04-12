cmake_minimum_required(VERSION 3.13)
project(pmdmini-wasm C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)

# Collect source files
set(PMDWIN_SOURCES
    src/pmdwin/opnaw.cpp
    src/pmdwin/pmdwin.cpp
    src/pmdwin/p86drv.cpp
    src/pmdwin/ppsdrv.cpp
    src/pmdwin/ppz8l.cpp
    src/pmdwin/table.cpp
    src/pmdwin/util.cpp
)

set(FMGEN_SOURCES
    src/fmgen/file.cpp
    src/fmgen/fmgen.cpp
    src/fmgen/fmtimer.cpp
    src/fmgen/opm.cpp
    src/fmgen/opna.cpp
    src/fmgen/psg.cpp
)

set(PMDMINI_C_SOURCES
    src/pmdmini.c
    src/pmdmini_wasm.c
)

add_executable(Pmdmini
    ${PMDMINI_C_SOURCES}
    ${PMDWIN_SOURCES}
    ${FMGEN_SOURCES}
)

target_include_directories(Pmdmini PRIVATE
    src
    src/pmdwin
    src/fmgen
)

# Suppress warnings for third-party code
target_compile_options(Pmdmini PRIVATE
    -Wno-narrowing
    -Wno-deprecated-declarations
    -Wno-writable-strings
    -Wno-c++11-narrowing
    -Wno-unused-variable
    -Wno-unused-but-set-variable
    -Wno-sign-compare
    -Wno-pointer-sign
    -Wno-implicit-function-declaration
)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/pmdmini")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

set_target_properties(Pmdmini PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    OUTPUT_NAME "Pmdmini"
    SUFFIX ".js"
)

# Emscripten link flags
target_link_options(Pmdmini PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createPmdmini'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_pmdmini_wasm_init','_pmdmini_wasm_load','_pmdmini_wasm_render','_pmdmini_wasm_get_length','_pmdmini_wasm_get_position','_pmdmini_wasm_get_loop_count','_pmdmini_wasm_get_tracks','_pmdmini_wasm_get_notes','_pmdmini_wasm_stop','_pmdmini_wasm_is_playing']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:--no-entry"
)
