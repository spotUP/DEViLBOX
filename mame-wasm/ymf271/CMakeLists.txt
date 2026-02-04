# YMF271 (Yamaha OPX 4-Operator FM Synthesizer) WASM Build
# Based on MAME's YMF271 emulator by R. Belmont, O. Galibert, and hap
# Standalone version without MAME framework dependencies

set(YMF271_SOURCES
    YMF271Synth.cpp
)

add_executable(YMF271_WASM ${YMF271_SOURCES})

target_include_directories(YMF271_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${YMF271_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(YMF271_WASM PROPERTIES
    OUTPUT_NAME "YMF271"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(YMF271_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createYMF271Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
