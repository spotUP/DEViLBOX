# AICA (Sega Dreamcast) WASM Build
# Based on MAME's AICA emulator by ElSemi and R. Belmont
# Standalone version without MAME framework dependencies

set(AICA_SOURCES
    AICASynth.cpp
)

add_executable(AICA_WASM ${AICA_SOURCES})

target_include_directories(AICA_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${AICA_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(AICA_WASM PROPERTIES
    OUTPUT_NAME "AICA"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(AICA_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAICAModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
