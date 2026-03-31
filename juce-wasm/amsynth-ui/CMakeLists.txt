# amsynth Hardware UI — WASM Build
#
# Compiles amsynth's JUCE skin-based UI to WASM, rendering to a framebuffer.
# Links against libjuce-wasm.a (real JUCE modules).
#
# Build:
#   cd juce-wasm/juce-lib && mkdir -p build && cd build && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && emmake make -j4
#   cd juce-wasm/amsynth-ui && mkdir -p build && cd build && emcmake cmake .. && emmake make -j4
#
# Output: public/amsynth/AmsynthUI.js + AmsynthUI.wasm

cmake_minimum_required(VERSION 3.15)
project(AmsynthUIWASM VERSION 1.0.0)

set(AMSYNTH_ROOT "${CMAKE_SOURCE_DIR}/../../third-party/amsynth-master")
set(AMSYNTH_SRC "${AMSYNTH_ROOT}/src")
set(SYNTH_SRC "${AMSYNTH_SRC}/core/synth")
set(GUI_SRC "${AMSYNTH_SRC}/core/gui")
set(JUCE_MODULES_DIR "${CMAKE_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_LIB_DIR "${CMAKE_SOURCE_DIR}/../juce-lib")

# Skin directory to embed in WASM virtual filesystem
set(SKIN_DIR "${AMSYNTH_ROOT}/data/skins/default")

# --- amsynth core sources needed by GUI ---
set(AMSYNTH_CORE_SOURCES
    "${SYNTH_SRC}/Parameter.cpp"
    "${SYNTH_SRC}/Preset.cpp"
    "${SYNTH_SRC}/PresetController.cpp"
    "${SYNTH_SRC}/MidiController.cpp"
    "${SYNTH_SRC}/TuningMap.cpp"
    "${AMSYNTH_SRC}/core/Configuration.cpp"
    "${AMSYNTH_SRC}/core/filesystem.cpp"
)

# --- amsynth GUI sources (skin-based UI) ---
set(AMSYNTH_GUI_SOURCES
    "${GUI_SRC}/ControlPanel.cpp"
    "${GUI_SRC}/Controls.cpp"
)

# WASM Bridge
set(BRIDGE_SOURCES
    "${CMAKE_SOURCE_DIR}/AmsynthUIBridge.cpp"
)

add_executable(AmsynthUIBuild
    ${BRIDGE_SOURCES}
    ${AMSYNTH_CORE_SOURCES}
    ${AMSYNTH_GUI_SOURCES}
)

# Include directories — ORDER MATTERS
target_include_directories(AmsynthUIBuild PRIVATE
    "${JUCE_MODULES_DIR}"                              # Real JUCE modules
    "${JUCE_LIB_DIR}"                                  # JuceWasmConfig.h
    "${AMSYNTH_SRC}"                                   # core/, resolves relative includes
    "${AMSYNTH_ROOT}/external"                         # seq24/controllers.h
)

target_compile_definitions(AmsynthUIBuild PRIVATE
    AMSYNTH_WASM=1
    NDEBUG=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    # PKGDATADIR maps to the Emscripten virtual filesystem path
    PKGDATADIR="/amsynth"
)

set_target_properties(AmsynthUIBuild PROPERTIES
    OUTPUT_NAME "AmsynthUI"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/amsynth"
)

# Link against the real JUCE WASM static library
target_link_libraries(AmsynthUIBuild PRIVATE
    "${JUCE_LIB_DIR}/build/libjuce-wasm.a"
)

target_link_options(AmsynthUIBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAmsynthUIModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8','FS']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_amsynth_ui_init','_amsynth_ui_init_scaled','_amsynth_ui_tick','_amsynth_ui_get_fb','_amsynth_ui_get_width','_amsynth_ui_get_height','_amsynth_ui_on_mouse_down','_amsynth_ui_on_mouse_up','_amsynth_ui_on_mouse_move','_amsynth_ui_on_mouse_wheel','_amsynth_ui_set_param','_amsynth_ui_get_param','_amsynth_ui_get_param_count','_amsynth_ui_shutdown']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=67108864"  # 64MB initial (UI + skin images + framebuffer)
    "SHELL:-s ALLOW_TABLE_GROWTH=1"
    "SHELL:-sUSE_FREETYPE=1"
    "SHELL:-s ASSERTIONS=2"
    "SHELL:-s SAFE_HEAP=0"
    "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
    # Embed skin files into WASM virtual filesystem
    "SHELL:--embed-file ${SKIN_DIR}@/amsynth/skins/default"
    -O2
)

target_compile_options(AmsynthUIBuild PRIVATE
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
)
