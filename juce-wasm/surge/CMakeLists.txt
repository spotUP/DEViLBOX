# Surge XT Hybrid Synthesizer - WASM Build
# Based on Surge XT by Surge Synth Team (GPL v3)
#
# Build:
#   cd juce-wasm/surge && mkdir build && cd build
#   emcmake cmake -DSURGE_COMPILE_BLOCK_SIZE=32 -DSURGE_SKIP_LUA=ON -DSURGE_SKIP_JUCE_FOR_RACK=ON ..
#   emmake make
#
# Surge's DSP engine (surge-common) is fully standalone — no JUCE needed.
# Dependencies: SST libraries, pffft, airwindows, fmt, tuning-library

cmake_minimum_required(VERSION 3.15)
project(SurgeWASM VERSION 1.4.0)

set(SURGE_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/surge-xt")
set(SURGE_SRC "${SURGE_ROOT}/src/common")
set(SURGE_LIBS "${SURGE_ROOT}/libs")
set(SURGE_SOURCE_DIR "${SURGE_ROOT}")

# --- Build options ---
set(SURGE_COMPILE_BLOCK_SIZE 32 CACHE STRING "DSP block size")
set(SURGE_SKIP_LUA ON CACHE BOOL "Skip Lua scripting for WASM build")
set(SURGE_SKIP_JUCE_FOR_RACK ON CACHE BOOL "Skip JUCE for WASM build")
set(SURGE_SKIP_ODDSOUND_MTS ON CACHE BOOL "Skip MTS-ESP for WASM build")

# --- Surge utility macros ---
macro(surge_add_lib_subdirectory dir)
    if(EXISTS "${SURGE_LIBS}/${dir}/CMakeLists.txt")
        add_subdirectory("${SURGE_LIBS}/${dir}" "${CMAKE_BINARY_DIR}/libs/${dir}" EXCLUDE_FROM_ALL)
    endif()
endmacro()

# --- Dependencies ---
# Core SST libraries (filters, waveshapers, effects, basic blocks)
surge_add_lib_subdirectory(sst/sst-cpputils)

set(SST_BASIC_BLOCKS_SIMD_OMIT_NATIVE_ALIASES ON CACHE BOOL "")
surge_add_lib_subdirectory(sst/sst-basic-blocks)
surge_add_lib_subdirectory(sst/sst-plugininfra)
surge_add_lib_subdirectory(sst/sst-filters)
surge_add_lib_subdirectory(sst/sst-waveshapers)
target_compile_definitions(sst-waveshapers INTERFACE SURGE_XT_1X_WST=1)
surge_add_lib_subdirectory(sst/sst-effects)

# Other dependencies
surge_add_lib_subdirectory(airwindows)
surge_add_lib_subdirectory(pffft)
surge_add_lib_subdirectory(fmt)
surge_add_lib_subdirectory(tuning-library)
surge_add_lib_subdirectory(eurorack)

# MTS-ESP (skip for WASM)
add_library(oddsound-mts INTERFACE)
target_compile_definitions(oddsound-mts INTERFACE SURGE_SKIP_ODDSOUND_MTS)
add_library(surge::oddsound-mts ALIAS oddsound-mts)

# LuaJIT (skip for WASM — too complex to cross-compile)
add_library(luajit-5.1 INTERFACE)
target_compile_definitions(luajit-5.1 INTERFACE HAS_LUA=0)

# SQLite
surge_add_lib_subdirectory(sqlite-3.23.3)

# zstd
set(ZSTD_BUILD_STATIC ON)
set(ZSTD_BUILD_SHARED OFF)
surge_add_lib_subdirectory(zstd)

# PEGTL
set(PEGTL_BUILD_TESTS OFF CACHE BOOL "")
set(PEGTL_BUILD_EXAMPLES OFF CACHE BOOL "")
surge_add_lib_subdirectory(PEGTL)

# binn
surge_add_lib_subdirectory(binn)

# simde (SIMD everywhere - provides SSE shims for non-x86)
if(EXISTS "${SURGE_LIBS}/simde")
    add_library(simde INTERFACE)
    target_include_directories(simde INTERFACE "${SURGE_LIBS}/simde")
endif()

# --- Surge Common DSP Sources ---
file(GLOB_RECURSE SURGE_COMMON_SOURCES
    "${SURGE_SRC}/*.cpp"
)

# Exclude platform-specific files that won't compile in WASM
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*/platform/.*")

# Exclude infrastructure files not needed for headless WASM DSP
# (stubs provided in SurgeWASM_stubs.cpp)
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*LuaSupport\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*FormulaModulationHelper\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*PatchDB\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*PatchDBQueryParser\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*UserDefaults\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*SkinFonts\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*FxPresetAndClipboardManager\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*ModulatorPresetManager\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*WAVFileSupport\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*WavetableScriptEvaluator\\.cpp$")
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*SurgeSynthesizerIO\\.cpp$")
# NimbusEffect excluded — nmb_* enum params unresolved (Clouds effect)
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*NimbusEffect\\.cpp$")
# chowdsp excluded — chowdsp_DelayLine.cpp missing header in standalone build
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*/chowdsp/.*")
# BBDEnsembleEffect excluded — depends on chowdsp BBDDelayLine
list(FILTER SURGE_COMMON_SOURCES EXCLUDE REGEX ".*BBDEnsembleEffect\\.cpp$")

# WASM Wrapper + stubs for excluded infrastructure
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/SurgeWASM.cpp"
    "${CMAKE_SOURCE_DIR}/SurgeWASM_stubs.cpp"
    # r8brain static object definitions (resampler)
    "${SURGE_LIBS}/r8brain-free-src/r8bbase.cpp"
)

add_executable(SurgeWASMBuild
    ${WRAPPER_SOURCES}
    ${SURGE_COMMON_SOURCES}
)

target_include_directories(SurgeWASMBuild PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common              # WASMSynthBase.h
    ${SURGE_SRC}
    ${SURGE_SRC}/dsp
    ${SURGE_SRC}/dsp/oscillators
    ${SURGE_SRC}/dsp/effects
    ${SURGE_SRC}/dsp/filters
    ${SURGE_SRC}/dsp/modulators
    ${SURGE_SRC}/dsp/utilities
    ${SURGE_SRC}/dsp/vembertech
    ${SURGE_ROOT}/src
    ${SURGE_LIBS}/sst/sst-basic-blocks/include
    ${SURGE_LIBS}/sst/sst-cpputils/include
    ${SURGE_LIBS}/sst/sst-filters/include
    ${SURGE_LIBS}/sst/sst-waveshapers/include
    ${SURGE_LIBS}/sst/sst-effects/include
    ${SURGE_LIBS}/sst/sst-plugininfra/include
    ${SURGE_LIBS}/fmt/include
    ${SURGE_LIBS}/tuning-library/include
    ${SURGE_LIBS}/airwindows/src
    ${SURGE_LIBS}/pffft
    ${SURGE_LIBS}/eurorack
    ${SURGE_LIBS}/eurorack/eurorack
    ${SURGE_LIBS}/simde
    ${SURGE_LIBS}/binn/include
    ${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/include
    ${SURGE_LIBS}/zstd/lib
    ${SURGE_LIBS}/r8brain-free-src
)

target_compile_definitions(SurgeWASMBuild PRIVATE
    SURGE_WASM=1
    NDEBUG=1
    SURGE_COMPILE_BLOCK_SIZE=${SURGE_COMPILE_BLOCK_SIZE}
    HAS_LUA=0
    SURGE_SKIP_ODDSOUND_MTS=1
    # Platform defines for Emscripten
    LINUX=1
    TARGET_HEADLESS=1
)

target_link_libraries(SurgeWASMBuild PRIVATE
    sst-basic-blocks
    sst-filters
    sst-waveshapers
    sst-effects
    sst-plugininfra
    sst-cpputils
    tinyxml
    airwindows
    pffft
    fmt
    surge::oddsound-mts
    luajit-5.1
    libzstd_static
    surge::binn
    surge::eurorack
)

set_target_properties(SurgeWASMBuild PROPERTIES
    OUTPUT_NAME "Surge"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/surge"
)

target_link_options(SurgeWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSurgeModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=134217728"  # 128MB initial (Surge is large)
    "SHELL:--bind"
    -O3
)

target_compile_options(SurgeWASMBuild PRIVATE
    -O3
    -std=c++20          # Surge requires C++20
    -msse -msse2 -msse3 -mssse3 -msse4.1 -msse4.2  # Full SSE → WASM SIMD
    -msimd128
    -fexceptions        # Surge uses try/catch in ParamMetadata, SurgeStorage, etc.
)
