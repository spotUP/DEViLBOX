cmake_minimum_required(VERSION 3.15)
project(HelmUI LANGUAGES CXX)

# ── Paths ─────────────────────────────────────────────────────────────────────
set(HELM_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/helm-master")
set(JUCE_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_WASM_CONFIG "${CMAKE_CURRENT_SOURCE_DIR}/../juce-lib")
set(JUCE_LIB "${JUCE_WASM_CONFIG}/build/libjuce-wasm.a")

# ── mopo DSP engine (pure C++, no JUCE deps) ─────────────────────────────────
file(GLOB MOPO_SOURCES "${HELM_ROOT}/mopo/src/*.cpp")

# ── Helm synthesis engine ─────────────────────────────────────────────────────
file(GLOB SYNTHESIS_SOURCES "${HELM_ROOT}/src/synthesis/*.cpp")

# ── Common (synth_base, load_save, etc.) ──────────────────────────────────────
file(GLOB COMMON_SOURCES "${HELM_ROOT}/src/common/*.cpp")

# ── Editor components ─────────────────────────────────────────────────────────
file(GLOB EDITOR_COMPONENT_SOURCES "${HELM_ROOT}/src/editor_components/*.cpp")

# ── Editor sections ───────────────────────────────────────────────────────────
file(GLOB EDITOR_SECTION_SOURCES "${HELM_ROOT}/src/editor_sections/*.cpp")

# ── Look and feel ─────────────────────────────────────────────────────────────
file(GLOB LOOK_AND_FEEL_SOURCES "${HELM_ROOT}/src/look_and_feel/*.cpp")

# ── Plugin (editor + plugin classes) ──────────────────────────────────────────
set(PLUGIN_SOURCES
    "${HELM_ROOT}/src/plugin/helm_editor.cpp"
    "${HELM_ROOT}/src/plugin/helm_plugin.cpp"
)

# ── BinaryData (fonts + icons, ~3MB) ─────────────────────────────────────────
set(BINARY_DATA_SOURCES
    "${HELM_ROOT}/JuceLibraryCode/BinaryData.cpp"
)

# ── Our bridge and stubs ──────────────────────────────────────────────────────
set(BRIDGE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/HelmUIBridge.cpp"
)
set(STUB_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/HelmStubs.cpp"
)

add_executable(HelmUI
    ${MOPO_SOURCES}
    ${SYNTHESIS_SOURCES}
    ${COMMON_SOURCES}
    ${EDITOR_COMPONENT_SOURCES}
    ${EDITOR_SECTION_SOURCES}
    ${LOOK_AND_FEEL_SOURCES}
    ${PLUGIN_SOURCES}
    ${BINARY_DATA_SOURCES}
    ${BRIDGE_SOURCES}
    ${STUB_SOURCES}
)

# ── Include paths (ORDER MATTERS — our stubs first!) ─────────────────────────
target_include_directories(HelmUI PRIVATE
    # Our stub headers override Helm's JuceHeader.h, AppConfig.h, and juce_opengl
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs/JuceLibraryCode"
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs"

    # Real BinaryData from Helm (fonts + icons)
    "${HELM_ROOT}/JuceLibraryCode"

    # Helm source directories
    "${HELM_ROOT}/src/common"
    "${HELM_ROOT}/src/editor_components"
    "${HELM_ROOT}/src/editor_sections"
    "${HELM_ROOT}/src/look_and_feel"
    "${HELM_ROOT}/src/plugin"
    "${HELM_ROOT}/src/synthesis"

    # mopo DSP engine
    "${HELM_ROOT}/mopo/src"

    # concurrentqueue (header-only, lock-free queue)
    "${HELM_ROOT}/concurrentqueue"

    # Real JUCE 8 modules
    "${JUCE_MODULES}"

    # JUCE WASM config
    "${JUCE_WASM_CONFIG}"
)

# ── Compile definitions ──────────────────────────────────────────────────────
target_compile_definitions(HelmUI PRIVATE
    HELM_WASM_UI=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_UNIT_TESTS=0
    NDEBUG=1

    # Helm module flags
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
    # OpenGL: We provide our own stub juce_opengl header, but libjuce-wasm.a
    # sets JUCE_MODULE_AVAILABLE_juce_opengl=0 via JuceWasmConfig.h.
    # We override it to 1 via a force-include that comes after JuceWasmConfig.h
    JUCE_MODULE_AVAILABLE_juce_dsp=1

    # JucePlugin macros
    JucePlugin_Name="Helm"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
)

# ── Compiler flags ───────────────────────────────────────────────────────────
target_compile_options(HelmUI PRIVATE
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
    -Wno-writable-strings
    -Wno-deprecated-copy
    -Wno-dangling-else
    # Force-include the JUCE WASM config header, then re-enable OpenGL module
    -include "${JUCE_WASM_CONFIG}/JuceWasmConfig.h"
    -UJUCE_MODULE_AVAILABLE_juce_opengl
    -DJUCE_MODULE_AVAILABLE_juce_opengl=1
)

# ── Exported functions ───────────────────────────────────────────────────────
set(EXPORTED_FUNCS
    "_helm_ui_init"
    "_helm_ui_init_scaled"
    "_helm_ui_tick"
    "_helm_ui_get_fb"
    "_helm_ui_get_width"
    "_helm_ui_get_height"
    "_helm_ui_on_mouse_down"
    "_helm_ui_on_mouse_up"
    "_helm_ui_on_mouse_move"
    "_helm_ui_on_mouse_wheel"
    "_helm_ui_set_param"
    "_helm_ui_get_param"
    "_helm_ui_get_param_count"
    "_helm_ui_get_program"
    "_helm_ui_set_program"
    "_helm_ui_get_program_count"
    "_helm_ui_get_program_name"
    "_helm_ui_shutdown"
    "_malloc"
    "_free"
)
string(REPLACE ";" "," EXPORTED_FUNCS_STR "${EXPORTED_FUNCS}")

target_link_libraries(HelmUI PRIVATE "${JUCE_LIB}")

set_target_properties(HelmUI PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/helm"
    OUTPUT_NAME "HelmUI"
)

target_link_options(HelmUI PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createHelmUIModule'"
    "SHELL:-s EXPORTED_FUNCTIONS='[${EXPORTED_FUNCS_STR}]'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"setValue\",\"getValue\",\"UTF8ToString\"]'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s INITIAL_MEMORY=67108864"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s USE_FREETYPE=1"
    "SHELL:--embed-file ${CMAKE_SOURCE_DIR}/../../third-party/helm-master/patches@/helm_patches"
    -fexceptions
    -O2
)
