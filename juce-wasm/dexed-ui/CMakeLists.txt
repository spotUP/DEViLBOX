# Dexed Hardware UI — WASM Build
#
# Compiles Dexed's JUCE plugin editor to WASM, rendering to a framebuffer.
# Links against libjuce-wasm.a (real JUCE modules).
#
# Build:
#   cd juce-wasm/juce-lib && mkdir -p build && cd build && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && emmake make -j4
#   cd juce-wasm/dexed-ui && python3 generate_binary_data.py
#   cd juce-wasm/dexed-ui && mkdir -p build && cd build && emcmake cmake .. && emmake make -j4
#
# Output: public/dexed/DexedUI.js + DexedUI.wasm

cmake_minimum_required(VERSION 3.15)
project(DexedUIWASM VERSION 1.0.0)

set(DEXED_ROOT "${CMAKE_SOURCE_DIR}/../../third-party/dexed")
set(DEXED_SRC "${DEXED_ROOT}/Source")
set(JUCE_MODULES_DIR "${CMAKE_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_LIB_DIR "${CMAKE_SOURCE_DIR}/../juce-lib")
set(STUBS_DIR "${CMAKE_SOURCE_DIR}/stubs")

# --- Dexed UI sources (real JUCE components) ---
set(DEXED_UI_SOURCES
    "${DEXED_SRC}/AlgoDisplay.cpp"
    "${DEXED_SRC}/DXComponents.cpp"
    "${DEXED_SRC}/DXLookNFeel.cpp"
    "${DEXED_SRC}/GlobalEditor.cpp"
    "${DEXED_SRC}/OperatorEditor.cpp"
    "${DEXED_SRC}/ProgramListBox.cpp"
    "${DEXED_SRC}/VUMeter.cpp"
)

# --- Dexed data/param sources (needed by the editor for Ctrl objects) ---
set(DEXED_PARAM_SOURCES
    "${DEXED_SRC}/PluginParam.cpp"
    "${DEXED_SRC}/PluginData.cpp"
)

# --- Our replacement editor (avoids JUCE 6→8 API conflicts) ---
set(EDITOR_OVERRIDE_SOURCES
    "${CMAKE_SOURCE_DIR}/DexedEditorOverride.cpp"
)

# --- Stubs for DSP/audio/dialog code not compiled ---
set(STUB_SOURCES
    "${CMAKE_SOURCE_DIR}/DexedStubs.cpp"
    "${STUBS_DIR}/BinaryData.cpp"
)

# --- Bridge ---
set(BRIDGE_SOURCES
    "${CMAKE_SOURCE_DIR}/DexedUIBridge.cpp"
)

add_executable(DexedUIBuild
    ${BRIDGE_SOURCES}
    ${DEXED_UI_SOURCES}
    ${DEXED_PARAM_SOURCES}
    ${EDITOR_OVERRIDE_SOURCES}
    ${STUB_SOURCES}
)

# Include directories — ORDER MATTERS (stubs override real includes)
target_include_directories(DexedUIBuild PRIVATE
    "${STUBS_DIR}"                                     # Stub headers (clap, MTS, Tunings, BinaryData)
    "${STUBS_DIR}/JuceLibraryCode"                     # JuceHeader.h (bare include from some files)
    "${DEXED_ROOT}"                                    # Parent of Source/ — resolves ../JuceLibraryCode/
    "${JUCE_MODULES_DIR}"                              # Real JUCE modules
    "${JUCE_LIB_DIR}"                                  # JuceWasmConfig.h
    "${DEXED_SRC}"                                     # Dexed source files
    "${DEXED_SRC}/msfa"                                # msfa engine headers
)

target_compile_definitions(DexedUIBuild PRIVATE
    DEXED_WASM=1
    NDEBUG=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
)

set_target_properties(DexedUIBuild PROPERTIES
    OUTPUT_NAME "DexedUI"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/dexed"
)

# Link against the real JUCE WASM static library
target_link_libraries(DexedUIBuild PRIVATE
    "${JUCE_LIB_DIR}/build/libjuce-wasm.a"
)

target_link_options(DexedUIBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createDexedUIModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8','FS']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_dexed_ui_init','_dexed_ui_init_scaled','_dexed_ui_tick','_dexed_ui_get_fb','_dexed_ui_get_width','_dexed_ui_get_height','_dexed_ui_on_mouse_down','_dexed_ui_on_mouse_up','_dexed_ui_on_mouse_move','_dexed_ui_on_mouse_wheel','_dexed_ui_set_param','_dexed_ui_get_param','_dexed_ui_get_param_count','_dexed_ui_load_sysex','_dexed_ui_set_program','_dexed_ui_get_program','_dexed_ui_get_program_count','_dexed_ui_shutdown']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=67108864"
    "SHELL:-s ALLOW_TABLE_GROWTH=1"
    "SHELL:-sUSE_FREETYPE=1"
    "SHELL:-s ASSERTIONS=2"
    "SHELL:-s SAFE_HEAP=0"
    "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
    -O2
)

target_compile_options(DexedUIBuild PRIVATE
    -O2
    -std=c++17
    -fexceptions
    -include "${JUCE_LIB_DIR}/JuceWasmConfig.h"
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-reorder
    -Wno-macro-redefined
    -Wno-format
    -Wno-writable-strings
    -Wno-c++11-narrowing
)
