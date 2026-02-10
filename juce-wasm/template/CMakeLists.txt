# ============================================================================
# VSTBridge WASM Build Template
# ============================================================================
#
# Copy this file to your synth's build directory and customize:
#   1. Set PROJECT_NAME to your synth's name
#   2. Set SYNTH_SOURCES to your source files
#   3. Set EXPORT_NAME to your Emscripten module factory name
#   4. Set OUTPUT_DIR to your public directory
#   5. Add any additional include dirs or definitions
#
# Build:
#   cd juce-wasm && mkdir build && cd build
#   emcmake cmake .. && emmake make
#
# Output goes to public/<synthname>/ as <name>.wasm + <name>.js
# ============================================================================

# --- CUSTOMIZE THESE ---
set(PROJECT_NAME "MySynth")
set(SYNTH_SOURCES
    MySynthWASM.cpp
    # Add your source files here
)
set(EXPORT_NAME "createMySynthModule")  # Emscripten factory name
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/mysynth")  # Output directory

# --- Standard build config (usually no changes needed) ---
add_executable(${PROJECT_NAME}WASM ${SYNTH_SOURCES})

target_include_directories(${PROJECT_NAME}WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common    # WASMSynthBase.h, WASMExports.h
)

target_compile_definitions(${PROJECT_NAME}WASM PRIVATE
    ${PROJECT_NAME}_WASM=1
)

set_target_properties(${PROJECT_NAME}WASM PROPERTIES
    OUTPUT_NAME "${PROJECT_NAME}"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(${PROJECT_NAME}WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='${EXPORT_NAME}'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(${PROJECT_NAME}WASM PRIVATE -O3 -std=c++17)
