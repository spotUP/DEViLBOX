# CEM3394 (Curtis Electromusic Synthesizer Voice) WASM Build
# Based on MAME's CEM3394 emulator by Aaron Giles
# Standalone version without MAME framework dependencies

set(CEM3394_SOURCES
    CEM3394Synth.cpp
)

add_executable(CEM3394_WASM ${CEM3394_SOURCES})

target_include_directories(CEM3394_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${CEM3394_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(CEM3394_WASM PROPERTIES
    OUTPUT_NAME "CEM3394"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(CEM3394_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createCEM3394Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
