# ES5503 (Ensoniq DOC) Wavetable Synthesizer WASM Build
# Based on MAME's ES5503 emulator v2.4 by R. Belmont
# Standalone version without MAME framework dependencies

set(ES5503_SOURCES
    ES5503Synth.cpp
)

add_executable(ES5503_WASM ${ES5503_SOURCES})

target_include_directories(ES5503_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${ES5503_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(ES5503_WASM PROPERTIES
    OUTPUT_NAME "ES5503"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(ES5503_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createES5503Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
