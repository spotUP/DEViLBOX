cmake_minimum_required(VERSION 3.15)
project(juce-wasm C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Path to real JUCE modules (from Surge's copy, v8.0.10 with WASM support)
set(JUCE_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")

if(NOT EXISTS "${JUCE_MODULES_DIR}/juce_core/juce_core.h")
    message(FATAL_ERROR "JUCE modules not found at ${JUCE_MODULES_DIR}")
endif()

# Our config header and WASM-specific stubs
set(JUCE_WASM_CONFIG "${CMAKE_CURRENT_SOURCE_DIR}/JuceWasmConfig.h")
set(JUCE_WASM_STUBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/wasm_stubs")

# =============================================================================
# Unity build sources — one .cpp per JUCE module
# =============================================================================

# Tier 0: Foundation (already working)
set(JUCE_CORE_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_core.cpp")
set(JUCE_AUDIO_BASICS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_audio_basics.cpp")
set(JUCE_DATA_STRUCTURES_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_data_structures.cpp")
set(JUCE_EVENTS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_events.cpp")

# Tier 1: Graphics + Audio formats + font shaping/bidi libraries
set(JUCE_GRAPHICS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_graphics.cpp")
set(JUCE_AUDIO_FORMATS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_audio_formats.cpp")

# HarfBuzz text shaping engine (bundled with JUCE 8 graphics)
set(HARFBUZZ_SRC "${JUCE_MODULES_DIR}/juce_graphics/fonts/harfbuzz/harfbuzz.cc")

# SheenBidi bidirectional text (bundled with JUCE 8 graphics)
file(GLOB SHEENBIDI_SRC "${JUCE_MODULES_DIR}/juce_graphics/unicode/sheenbidi/Source/*.c")

# Tier 2: GUI
set(JUCE_GUI_BASICS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_gui_basics.cpp")
set(JUCE_GUI_EXTRA_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_gui_extra.cpp")

# Tier 3: Audio processors, devices, utils, DSP
set(JUCE_AUDIO_PROCESSORS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_audio_processors.cpp")
set(JUCE_AUDIO_DEVICES_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_audio_devices.cpp")
set(JUCE_AUDIO_UTILS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_audio_utils.cpp")
set(JUCE_DSP_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_dsp.cpp")

# =============================================================================
# Static library target
# =============================================================================

add_library(juce-wasm STATIC
    ${JUCE_CORE_SRC}
    ${JUCE_AUDIO_BASICS_SRC}
    ${JUCE_DATA_STRUCTURES_SRC}
    ${JUCE_EVENTS_SRC}
    ${JUCE_GRAPHICS_SRC}
    ${HARFBUZZ_SRC}
    ${SHEENBIDI_SRC}
    ${JUCE_AUDIO_FORMATS_SRC}
    ${JUCE_GUI_BASICS_SRC}
    ${JUCE_GUI_EXTRA_SRC}
    ${JUCE_AUDIO_PROCESSORS_SRC}
    ${JUCE_AUDIO_DEVICES_SRC}
    ${JUCE_AUDIO_UTILS_SRC}
    ${JUCE_DSP_SRC}
)

target_include_directories(juce-wasm PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/patches  # Patched JUCE headers (must come first)
    ${JUCE_MODULES_DIR}           # Real JUCE module headers
    ${JUCE_WASM_STUBS_DIR}        # Stub module headers (GUI, audio_formats, etc.)
    ${CMAKE_CURRENT_SOURCE_DIR}   # JuceWasmConfig.h
)

# SheenBidi needs its own include path
target_include_directories(juce-wasm PRIVATE
    ${JUCE_MODULES_DIR}/juce_graphics/unicode/sheenbidi/Headers
    ${JUCE_MODULES_DIR}/juce_graphics/unicode/sheenbidi/Source
)

# HarfBuzz needs special compile flags
set_source_files_properties(${HARFBUZZ_SRC} PROPERTIES
    COMPILE_FLAGS "-Wno-everything -DHB_NO_MT=1 -DHAVE_FREETYPE=1"
)

# Force-include config header before all JUCE code
target_compile_options(juce-wasm PRIVATE
    -include "${JUCE_WASM_CONFIG}"
    -Wno-deprecated-declarations
    -Wno-unused-variable
    -Wno-unused-function
    -Wno-sign-compare
    -Wno-reorder-ctor
    -Wno-missing-field-initializers
)

target_compile_definitions(juce-wasm PUBLIC
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_UNIT_TESTS=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    NDEBUG=1
)

# Emscripten-specific settings
if(EMSCRIPTEN)
    target_compile_options(juce-wasm PRIVATE
        -O2
        -fexceptions
        -sUSE_FREETYPE=1
    )
    target_compile_definitions(juce-wasm PUBLIC
        JUCE_USE_FREETYPE=1
        JUCE_USE_FREETYPE_LICENSING=0
        JUCE_USE_FONTCONFIG=0
        JUCE_MODULE_AVAILABLE_juce_graphics=1
        JUCE_MODULE_AVAILABLE_juce_gui_basics=1
        JUCE_MODULE_AVAILABLE_juce_gui_extra=1
        JUCE_MODULE_AVAILABLE_juce_audio_processors=1
        JUCE_MODULE_AVAILABLE_juce_audio_formats=1
        JUCE_MODULE_AVAILABLE_juce_audio_devices=1
        JUCE_MODULE_AVAILABLE_juce_audio_utils=1
        JUCE_MODULE_AVAILABLE_juce_dsp=1
    )
endif()
