cmake_minimum_required(VERSION 3.15)
project(OBXfUI LANGUAGES CXX)

# ── Paths ─────────────────────────────────────────────────────────────────────
set(OBXF_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/OB-Xf-main")
set(JUCE_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_WASM_CONFIG "${CMAKE_CURRENT_SOURCE_DIR}/../juce-lib")
set(JUCE_LIB "${JUCE_WASM_CONFIG}/build/libjuce-wasm.a")
set(SST_PLUGININFRA "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/sst/sst-plugininfra")
set(SST_CPPUTILS "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/sst/sst-cpputils")
set(SST_BASIC_BLOCKS "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/sst/sst-basic-blocks")
set(FMT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/fmt")

# ── Source files ──────────────────────────────────────────────────────────────

# OB-Xf real source files (UI + parameter system)
set(OBXF_EDITOR_SOURCES
    "${OBXF_ROOT}/src/PluginEditor.cpp"
    "${OBXF_ROOT}/src/components/ScalingImageCache.cpp"
)

set(OBXF_PARAM_SOURCES
    "${OBXF_ROOT}/src/parameter/ParameterCoordinator.cpp"
    "${OBXF_ROOT}/src/parameter/ParameterUpdateHandler.cpp"
)

# Our bridge and stubs
set(BRIDGE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/OBXfUIBridge.cpp"
)

set(STUB_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/OBXfStubs.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs/BinaryData.cpp"
)

add_executable(OBXfUI
    ${OBXF_EDITOR_SOURCES}
    ${OBXF_PARAM_SOURCES}
    ${BRIDGE_SOURCES}
    ${STUB_SOURCES}
)

# ── Include paths (ORDER MATTERS — stubs first!) ─────────────────────────────
target_include_directories(OBXfUI PRIVATE
    # Our stubs override real headers
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs"
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs/JuceLibraryCode"

    # sst stubs (our versions take priority over real ones)
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs"

    # OB-Xf source directories
    "${OBXF_ROOT}/src"
    "${OBXF_ROOT}/src/components"
    "${OBXF_ROOT}/src/engine"
    "${OBXF_ROOT}/src/gui"
    "${OBXF_ROOT}/src/interface"
    "${OBXF_ROOT}/src/core"
    "${OBXF_ROOT}/src/midi"
    "${OBXF_ROOT}/src/utilities"
    "${OBXF_ROOT}/src/parameter"
    "${OBXF_ROOT}/src/state"

    # Real JUCE modules
    "${JUCE_MODULES}"

    # JUCE WASM config
    "${JUCE_WASM_CONFIG}"

    # sst libraries (for any headers our stubs don't cover)
    "${SST_PLUGININFRA}/include"
    "${SST_PLUGININFRA}/libs/strnatcmp"
    "${SST_CPPUTILS}/include"
    "${SST_BASIC_BLOCKS}/include"

    # fmt (header-only mode)
    "${FMT_ROOT}/include"
)

# ── Compile definitions ──────────────────────────────────────────────────────
target_compile_definitions(OBXfUI PRIVATE
    OBXF_WASM_UI=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_UNIT_TESTS=0
    NDEBUG=1
    FMT_HEADER_ONLY=1

    # JucePlugin macros (needed by PluginProcessor.cpp/Editor.cpp)
    JucePlugin_Name="OB-Xf"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0

    # Module availability
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

# ── Compiler flags ───────────────────────────────────────────────────────────
target_compile_options(OBXfUI PRIVATE
    -O2
    -std=c++20
    -fexceptions
    "-DFMT_CONSTEVAL="
    -Wno-deprecated-declarations
    -Wno-unused-variable
    -Wno-unused-function
    -Wno-unused-private-field
    -Wno-reorder-ctor
    -Wno-inconsistent-missing-override
    -Wno-sign-compare
    -Wno-c++11-narrowing
    # Force-include the JUCE WASM config header before everything
    -include "${JUCE_WASM_CONFIG}/JuceWasmConfig.h"
)

# ── Linker flags ─────────────────────────────────────────────────────────────
set(EXPORTED_FUNCS
    "_obxf_ui_init"
    "_obxf_ui_init_scaled"
    "_obxf_ui_tick"
    "_obxf_ui_get_fb"
    "_obxf_ui_get_width"
    "_obxf_ui_get_height"
    "_obxf_ui_on_mouse_down"
    "_obxf_ui_on_mouse_up"
    "_obxf_ui_on_mouse_move"
    "_obxf_ui_on_mouse_wheel"
    "_obxf_ui_set_param"
    "_obxf_ui_get_param"
    "_obxf_ui_get_param_count"
    "_obxf_ui_get_program"
    "_obxf_ui_set_program"
    "_obxf_ui_get_program_count"
    "_obxf_ui_shutdown"
    "_malloc"
    "_free"
)

# Join with commas for Emscripten
string(REPLACE ";" "," EXPORTED_FUNCS_STR "${EXPORTED_FUNCS}")

target_link_libraries(OBXfUI PRIVATE "${JUCE_LIB}")

set_target_properties(OBXfUI PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/obxf"
    OUTPUT_NAME "OBXfUI"
)

target_link_options(OBXfUI PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOBXfUIModule'"
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
