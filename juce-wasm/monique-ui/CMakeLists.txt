# Monique Hardware UI — WASM Build
#
# Compiles Monique's full 45K LOC JUCE UI to WASM, rendering to a framebuffer.
# Links against libjuce-wasm.a (all 12 real JUCE modules).
#
# Build:
#   cd juce-wasm/juce-lib && mkdir -p build && cd build && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && emmake make -j4
#   cd juce-wasm/monique-ui && mkdir -p build && cd build && emcmake cmake .. && emmake make -j4
#
# Output: public/monique/MoniqueUI.js + MoniqueUI.wasm

cmake_minimum_required(VERSION 3.15)
project(MoniqueUIWASM VERSION 1.0.0)

set(MONIQUE_ROOT "${CMAKE_SOURCE_DIR}/../../third-party/monique-monosynth")
set(MONIQUE_SRC "${MONIQUE_ROOT}/src")
set(MONIQUE_CORE "${MONIQUE_SRC}/core")
set(MONIQUE_UI "${MONIQUE_SRC}/ui")
set(JUCE_MODULES_DIR "${CMAKE_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_LIB_DIR "${CMAKE_SOURCE_DIR}/../juce-lib")

# --- Monique Core Sources (all 5 core .cpp files) ---
set(MONIQUE_CORE_SOURCES
    "${MONIQUE_CORE}/monique_core_Synth.cpp"
    "${MONIQUE_CORE}/monique_core_Datastructures.cpp"
    "${MONIQUE_CORE}/monique_core_Parameters.cpp"
    "${MONIQUE_CORE}/monique_core_Processor.cpp"
    "${MONIQUE_CORE}/mono_AudioDeviceManager.cpp"
)

# --- All 18 UI .cpp files ---
set(MONIQUE_UI_SOURCES
    "${MONIQUE_UI}/monique_ui_AmpPainter.cpp"
    "${MONIQUE_UI}/monique_ui_Credits.cpp"
    "${MONIQUE_UI}/monique_ui_DragPad.cpp"
    "${MONIQUE_UI}/monique_ui_ENVPopup.cpp"
    "${MONIQUE_UI}/monique_ui_GlobalSettings.cpp"
    "${MONIQUE_UI}/monique_ui_Info.cpp"
    "${MONIQUE_UI}/monique_ui_LookAndFeel.cpp"
    "${MONIQUE_UI}/monique_ui_MainWindow.cpp"
    "${MONIQUE_UI}/monique_ui_MFOPopup.cpp"
    "${MONIQUE_UI}/monique_ui_MIDIIO.cpp"
    "${MONIQUE_UI}/monique_ui_MidiLearnPopup.cpp"
    "${MONIQUE_UI}/monique_ui_ModulationSlider.cpp"
    "${MONIQUE_UI}/monique_ui_Morph.cpp"
    "${MONIQUE_UI}/monique_ui_OptionPopup.cpp"
    "${MONIQUE_UI}/monique_ui_Overlay.cpp"
    "${MONIQUE_UI}/monique_ui_Playback.cpp"
    "${MONIQUE_UI}/monique_ui_Refresher.cpp"
    "${MONIQUE_UI}/monique_ui_SegmentedMeter.cpp"
)

# WASM Bridge
set(BRIDGE_SOURCES
    "${CMAKE_SOURCE_DIR}/MoniqueUIBridge.cpp"
)

add_executable(MoniqueUIBuild
    ${BRIDGE_SOURCES}
    ${MONIQUE_CORE_SOURCES}
    ${MONIQUE_UI_SOURCES}
)

# Include directories — ORDER MATTERS
# 1. Real JUCE modules (full 12-module library, no stubs needed)
# 2. Source stubs (BinaryData.h, version.h, libMTSClient.h — NOT the ui/ subfolder)
# 3. JUCE lib dir (for JuceWasmConfig.h)
# 4. Monique source root (resolves core/ and ui/ relative includes)
# 5. Monique core dir (for sibling includes)
target_include_directories(MoniqueUIBuild PRIVATE
    "${JUCE_MODULES_DIR}"                              # Real JUCE (all 12 modules)
    "${CMAKE_SOURCE_DIR}/stubs"                         # BinaryData.h, version.h, libMTSClient.h (NO ui/ subfolder)
    "${JUCE_LIB_DIR}"                                  # JuceWasmConfig.h
    "${MONIQUE_SRC}"                                   # App.h, resolves core/ and ui/ paths
    "${MONIQUE_CORE}"                                  # Sibling core headers
)

target_compile_definitions(MoniqueUIBuild PRIVATE
    MONIQUE_WASM=1
    NDEBUG=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    ROOT_FOLDER=userApplicationDataDirectory
    # Don't define JUCE_OPENGL at all — #ifdef guards will skip OpenGL code
    # JUCE plugin defines (needed by Processor.cpp)
    JucePlugin_Name="Monique"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=1
)

set_target_properties(MoniqueUIBuild PROPERTIES
    OUTPUT_NAME "MoniqueUI"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/monique"
)

# Link against the real JUCE WASM static library (all 12 modules)
target_link_libraries(MoniqueUIBuild PRIVATE
    "${JUCE_LIB_DIR}/build/libjuce-wasm.a"
)

target_link_options(MoniqueUIBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMoniqueUIModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_monique_ui_init','_monique_ui_tick','_monique_ui_get_fb','_monique_ui_get_width','_monique_ui_get_height','_monique_ui_on_mouse_down','_monique_ui_on_mouse_up','_monique_ui_on_mouse_move','_monique_ui_on_mouse_wheel','_monique_ui_shutdown','_monique_ui_get_num_params','_monique_ui_get_param','_monique_ui_set_param']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=134217728"  # 128MB initial (UI + framebuffer + synth data)
    "SHELL:-s ALLOW_TABLE_GROWTH=1"
    "SHELL:-sUSE_FREETYPE=1"
    "SHELL:-s ASSERTIONS=2"
    "SHELL:-s SAFE_HEAP=0"
    "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
    -O2
)

target_compile_options(MoniqueUIBuild PRIVATE
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
)
