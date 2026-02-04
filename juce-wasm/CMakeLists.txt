# JUCE WASM Build Configuration for DEViLBOX
# Compiles Dexed (DX7) and OB-Xd (Oberheim) synths to WebAssembly
cmake_minimum_required(VERSION 3.20)
project(DEViLBOX_JUCE_WASM VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten-specific settings
if(EMSCRIPTEN)
    message(STATUS "Building for WebAssembly with Emscripten")

    # Common Emscripten flags
    set(COMMON_LINK_FLAGS
        "-s WASM=1"
        "-s EXPORT_ES6=1"
        "-s MODULARIZE=1"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s ENVIRONMENT='web,worker'"
        "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
        "-s EXPORTED_FUNCTIONS=['_malloc','_free']"
        "-s NO_EXIT_RUNTIME=1"
        "-s SINGLE_FILE=0"
        "--bind"
        "-O3"
    )

    string(REPLACE ";" " " COMMON_LINK_FLAGS_STR "${COMMON_LINK_FLAGS}")
else()
    message(FATAL_ERROR "This project must be built with Emscripten. Use: emcmake cmake ..")
endif()

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../public)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../public)

# Include paths
include_directories(
    ${CMAKE_SOURCE_DIR}/common
    ${CMAKE_SOURCE_DIR}/dexed/msfa
    ${CMAKE_SOURCE_DIR}/obxd/Source
)

# ============================================================================
# DEXED (DX7 FM Synthesizer) - Using msfa engine (Apache 2.0)
# ============================================================================
add_subdirectory(dexed)

# ============================================================================
# OB-Xd (Oberheim Synthesizer) - GPL v3
# ============================================================================
add_subdirectory(obxd)

# ============================================================================
# Open303 (TB-303 Synthesizer) - MIT
# ============================================================================
add_subdirectory(open303)

# ============================================================================
# Combined build target
# ============================================================================
add_custom_target(all_synths
    DEPENDS DexedWASM OBXdWASM Open303WASM
    COMMENT "Building all JUCE WASM synths"
)
