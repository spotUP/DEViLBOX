cmake_minimum_required(VERSION 3.15)
project(AelapseUI LANGUAGES CXX)

# ── Paths ─────────────────────────────────────────────────────────────────────
set(REPO_ROOT        "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(AELAPSE_ROOT     "${REPO_ROOT}/third-party/aelapse")
set(DSP_ROOT         "${AELAPSE_ROOT}/submodules/dsp")
set(RWQ_ROOT         "${AELAPSE_ROOT}/submodules/readerwriterqueue")
set(JUCE_MODULES     "${REPO_ROOT}/third-party/surge-xt/libs/JUCE/modules")
set(JUCE_WASM_CONFIG "${REPO_ROOT}/juce-wasm/juce-lib")
set(JUCE_LIB         "${JUCE_WASM_CONFIG}/build/libjuce-wasm.a")

if(NOT EXISTS "${JUCE_LIB}")
    message(FATAL_ERROR "libjuce-wasm.a not found at ${JUCE_LIB}. Build juce-wasm/juce-lib first.")
endif()

# ── Source files ──────────────────────────────────────────────────────────────

# Aelapse real sources — PluginProcessor, PresetManager, and the full GUI.
# SpringsGL.cpp is gated out via AELAPSE_WASM_UI; its header provides an
# empty Component stub so SpringsSection still compiles.
set(AELAPSE_SOURCES
    "${AELAPSE_ROOT}/src/PluginProcessor.cpp"
    "${AELAPSE_ROOT}/src/Presets/PresetManager.cpp"
    "${AELAPSE_ROOT}/src/GUI/PluginEditor.cpp"
    "${AELAPSE_ROOT}/src/GUI/CustomLNF.cpp"
    "${AELAPSE_ROOT}/src/GUI/DelaySection.cpp"
    "${AELAPSE_ROOT}/src/GUI/SpringsSection.cpp"
    "${AELAPSE_ROOT}/src/GUI/SpringsGL.cpp"      # body gated, header provides stub
    "${AELAPSE_ROOT}/src/GUI/PresetComponent.cpp"
    "${AELAPSE_ROOT}/src/GUI/Title.cpp"
    "${AELAPSE_ROOT}/src/GUI/ToolTip.cpp"
    "${AELAPSE_ROOT}/src/GUI/Typefaces.cpp"
    "${AELAPSE_ROOT}/src/GUI/ArrowButton.cpp"
    "${AELAPSE_ROOT}/src/GUI/Led.cpp"
    "${AELAPSE_ROOT}/src/GUI/SpreadSlider.cpp"
)

set(BRIDGE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/AelapseUIBridge.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/AelapseStubs.cpp"
)

add_executable(AelapseUI
    ${AELAPSE_SOURCES}
    ${BRIDGE_SOURCES}
)

# ── Include paths (ORDER MATTERS — stubs first) ──────────────────────────────
target_include_directories(AelapseUI PRIVATE
    # Stub overrides (Fonts.h)
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs"

    # Aelapse source tree
    "${AELAPSE_ROOT}/src"
    "${AELAPSE_ROOT}/src/GUI"
    "${AELAPSE_ROOT}/src/Presets"

    # Reader-writer queue (single-producer-single-consumer queue header)
    "${RWQ_ROOT}"

    # DSP headers — needed by PluginProcessor.h for cpu/infos.h and
    # SpringsSection.h (pulls SpringsDefines.h via SpringsGL stub)
    "${DSP_ROOT}/include"
    "${DSP_ROOT}/processors/springs"
    "${DSP_ROOT}/processors/tapedelay"

    # Real JUCE modules
    "${JUCE_MODULES}"

    # JUCE WASM config
    "${JUCE_WASM_CONFIG}"
)

# ── Compile definitions ──────────────────────────────────────────────────────
target_compile_definitions(AelapseUI PRIVATE
    AELAPSE_WASM_UI=1
    PROJECT_NAME="Aelapse"

    SPRINGS_N_SPRINGS=4
    SPRINGS_RMS_STACK_SIZE=64

    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_UNIT_TESTS=0
    NDEBUG=1

    JucePlugin_Name="Aelapse"
    JucePlugin_IsSynth=0
    JucePlugin_WantsMidiInput=0
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0

    JUCE_MODULE_AVAILABLE_juce_core=1
    JUCE_MODULE_AVAILABLE_juce_audio_basics=1
    JUCE_MODULE_AVAILABLE_juce_data_structures=1
    JUCE_MODULE_AVAILABLE_juce_events=1
    JUCE_MODULE_AVAILABLE_juce_graphics=1
    JUCE_MODULE_AVAILABLE_juce_gui_basics=1
    JUCE_MODULE_AVAILABLE_juce_gui_extra=1
    JUCE_MODULE_AVAILABLE_juce_audio_processors=1
    JUCE_MODULE_AVAILABLE_juce_audio_formats=1
    JUCE_MODULE_AVAILABLE_juce_audio_devices=1
    JUCE_MODULE_AVAILABLE_juce_audio_utils=1
    JUCE_MODULE_AVAILABLE_juce_dsp=1
)

target_compile_options(AelapseUI PRIVATE
    -O2
    -std=c++17
    -fexceptions
    -Wno-deprecated-declarations
    -Wno-unused-variable
    -Wno-unused-function
    -Wno-unused-private-field
    -Wno-reorder-ctor
    -Wno-inconsistent-missing-override
    -Wno-sign-compare
    -Wno-c++11-narrowing
    -include "${JUCE_WASM_CONFIG}/JuceWasmConfig.h"
)

# ── Linker flags ─────────────────────────────────────────────────────────────
set(EXPORTED_FUNCS
    "_aelapse_ui_init"
    "_aelapse_ui_init_scaled"
    "_aelapse_ui_tick"
    "_aelapse_ui_get_fb"
    "_aelapse_ui_get_width"
    "_aelapse_ui_get_height"
    "_aelapse_ui_on_mouse_down"
    "_aelapse_ui_on_mouse_up"
    "_aelapse_ui_on_mouse_move"
    "_aelapse_ui_on_mouse_wheel"
    "_aelapse_ui_set_param"
    "_aelapse_ui_get_param"
    "_aelapse_ui_get_param_count"
    "_aelapse_ui_get_program"
    "_aelapse_ui_set_program"
    "_aelapse_ui_get_program_count"
    "_aelapse_ui_shutdown"
    "_aelapse_ui_get_springs_x"
    "_aelapse_ui_get_springs_y"
    "_aelapse_ui_get_springs_w"
    "_aelapse_ui_get_springs_h"
    "_malloc"
    "_free"
)
string(REPLACE ";" "," EXPORTED_FUNCS_STR "${EXPORTED_FUNCS}")

target_link_libraries(AelapseUI PRIVATE "${JUCE_LIB}")

set_target_properties(AelapseUI PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${REPO_ROOT}/public/aelapse"
    OUTPUT_NAME "AelapseUI"
)

target_link_options(AelapseUI PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAelapseUIModule'"
    "SHELL:-s EXPORTED_FUNCTIONS='[${EXPORTED_FUNCS_STR}]'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"setValue\",\"getValue\"]'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s INITIAL_MEMORY=67108864"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s USE_FREETYPE=1"
    -fexceptions
    -O2
)
