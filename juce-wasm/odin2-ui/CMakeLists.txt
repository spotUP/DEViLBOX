cmake_minimum_required(VERSION 3.15)
project(Odin2UI LANGUAGES CXX)

# ── Paths ─────────────────────────────────────────────────────────────────────
set(ODIN2_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/odin2-master")
set(ODIN2_SRC "${ODIN2_ROOT}/Source")
set(JUCE_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_WASM_CONFIG "${CMAKE_CURRENT_SOURCE_DIR}/../juce-lib")
set(JUCE_LIB "${JUCE_WASM_CONFIG}/build/libjuce-wasm.a")

# ── Source files ──────────────────────────────────────────────────────────────

# Odin2 GUI source files
set(ODIN2_GUI_SOURCES
    "${ODIN2_SRC}/gui/ADSRComponent.cpp"
    "${ODIN2_SRC}/gui/AmpDistortionFlowComponent.cpp"
    "${ODIN2_SRC}/gui/ArpComponent.cpp"
    "${ODIN2_SRC}/gui/BrowserEntry.cpp"
    "${ODIN2_SRC}/gui/ChipdrawWindow.cpp"
    "${ODIN2_SRC}/gui/DelayComponent.cpp"
    "${ODIN2_SRC}/gui/DrawableSlider.cpp"
    "${ODIN2_SRC}/gui/FilterComponent.cpp"
    "${ODIN2_SRC}/gui/FixedTextGlassDropdown.cpp"
    "${ODIN2_SRC}/gui/FXComponent.cpp"
    "${ODIN2_SRC}/gui/GlasDisplay.cpp"
    "${ODIN2_SRC}/gui/GlassDropdown.cpp"
    "${ODIN2_SRC}/gui/GuiDataEditor.cpp"
    "${ODIN2_SRC}/gui/IntegerKnob.cpp"
    "${ODIN2_SRC}/gui/JsonGuiProvider.cpp"
    "${ODIN2_SRC}/gui/LeftRightButton.cpp"
    "${ODIN2_SRC}/gui/LFOComponent.cpp"
    "${ODIN2_SRC}/gui/LFODisplayComponent.cpp"
    "${ODIN2_SRC}/gui/LFOPopupLookAndFeel.cpp"
    "${ODIN2_SRC}/gui/LFOSelectorComponent.cpp"
    "${ODIN2_SRC}/gui/LiveConstrainer.cpp"
    "${ODIN2_SRC}/gui/ModAmountComponent.cpp"
    "${ODIN2_SRC}/gui/ModAmountComponentExtended.cpp"
    "${ODIN2_SRC}/gui/ModMatrix.cpp"
    "${ODIN2_SRC}/gui/ModMatrixComponent.cpp"
    "${ODIN2_SRC}/gui/NumberSelector.cpp"
    "${ODIN2_SRC}/gui/NumberSelectorWithText.cpp"
    "${ODIN2_SRC}/gui/OdinArpeggiator.cpp"
    "${ODIN2_SRC}/gui/OdinButton.cpp"
    "${ODIN2_SRC}/gui/OdinControlAttachments.cpp"
    "${ODIN2_SRC}/gui/OdinKnob.cpp"
    "${ODIN2_SRC}/gui/OscComponent.cpp"
    "${ODIN2_SRC}/gui/PatchBrowser.cpp"
    "${ODIN2_SRC}/gui/PatchBrowserScrollBar.cpp"
    "${ODIN2_SRC}/gui/PatchBrowserSelector.cpp"
    "${ODIN2_SRC}/gui/PhaserComponent.cpp"
    "${ODIN2_SRC}/gui/RescaleProgressComponent.cpp"
    "${ODIN2_SRC}/gui/ResizeDragger.cpp"
    "${ODIN2_SRC}/gui/ReverbComponent.cpp"
    "${ODIN2_SRC}/gui/SpecdrawDisplay.cpp"
    "${ODIN2_SRC}/gui/SplineAdComponent.cpp"
    "${ODIN2_SRC}/gui/StepComponent.cpp"
    "${ODIN2_SRC}/gui/SyncTimeSelector.cpp"
    "${ODIN2_SRC}/gui/TitleButton.cpp"
    "${ODIN2_SRC}/gui/UIAssetsData.cpp"
    "${ODIN2_SRC}/gui/UIAssetsSize.cpp"
    "${ODIN2_SRC}/gui/WavedrawDisplay.cpp"
    "${ODIN2_SRC}/gui/WaveformSelectorComponent.cpp"
    "${ODIN2_SRC}/gui/XYPadComponent.cpp"
    "${ODIN2_SRC}/gui/XYSectionComponent.cpp"
)
# NOTE: UIAssetManager.cpp is NOT included — stubbed in Odin2Stubs.cpp

# Odin2 processor and utility sources
set(ODIN2_PROCESSOR_SOURCES
    "${ODIN2_SRC}/PluginProcessor.cpp"
    "${ODIN2_SRC}/PluginEditor.cpp"
    "${ODIN2_SRC}/Utilities.cpp"
)
# NOTE: PluginProcessorConstructor/Midi/Misc/etc are #included from PluginProcessor.cpp

# Odin2 audio DSP sources (needed by processor)
file(GLOB ODIN2_AUDIO_SOURCES "${ODIN2_SRC}/audio/*.cpp")
list(FILTER ODIN2_AUDIO_SOURCES EXCLUDE REGEX ".*ImpulseResponseCreator.*")
file(GLOB ODIN2_FILTER_SOURCES "${ODIN2_SRC}/audio/Filters/*.cpp")
file(GLOB ODIN2_FX_SOURCES "${ODIN2_SRC}/audio/FX/*.cpp")
file(GLOB ODIN2_OSC_SOURCES "${ODIN2_SRC}/audio/Oscillators/*.cpp")
file(GLOB ODIN2_WAVETABLE_SOURCES
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/*.cpp"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Tables/*.cpp"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Coefficients/*.cpp"
)

# Our bridge and stubs
set(BRIDGE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/Odin2UIBridge.cpp")
set(STUB_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/Odin2Stubs.cpp")

# BinaryData chunks
file(GLOB BINARY_DATA_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/stubs/BinaryData_*.cpp")

add_executable(Odin2UI
    ${ODIN2_GUI_SOURCES}
    ${ODIN2_PROCESSOR_SOURCES}
    ${ODIN2_AUDIO_SOURCES}
    ${ODIN2_FILTER_SOURCES}
    ${ODIN2_FX_SOURCES}
    ${ODIN2_OSC_SOURCES}
    ${ODIN2_WAVETABLE_SOURCES}
    ${BRIDGE_SOURCES}
    ${STUB_SOURCES}
    ${BINARY_DATA_SOURCES}
)

# ── Include paths (ORDER MATTERS — stubs first!) ─────────────────────────────
target_include_directories(Odin2UI PRIVATE
    # Our stubs override real headers (GitCommitId.h, FactoryPresetBinaryMapping.h, BinaryData.h)
    "${CMAKE_CURRENT_SOURCE_DIR}/stubs"

    # Odin2 JuceLibraryCode (for <JuceHeader.h> angle-bracket includes)
    "${ODIN2_ROOT}/JuceLibraryCode"

    # Odin2 source directories
    "${ODIN2_SRC}"
    "${ODIN2_SRC}/gui"
    "${ODIN2_SRC}/audio"
    "${ODIN2_SRC}/audio/Filters"
    "${ODIN2_SRC}/audio/FX"
    "${ODIN2_SRC}/audio/Oscillators"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Tables"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Coefficients"
    "${ODIN2_SRC}/audio/include"

    # Odin2 root (for ../JuceLibraryCode/JuceHeader.h path resolution)
    "${ODIN2_ROOT}"

    # Third-party headers used by Odin2
    "${ODIN2_ROOT}/libs/json/include"
    "${ODIN2_ROOT}/libs/tuning-library/include"

    # Real JUCE modules
    "${JUCE_MODULES}"

    # JUCE WASM config
    "${JUCE_WASM_CONFIG}"
)

# ── Compile definitions ──────────────────────────────────────────────────────
target_compile_definitions(Odin2UI PRIVATE
    ODIN2_WASM_UI=1
    ODIN_LINUX=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_UNIT_TESTS=0
    NDEBUG=1

    # JucePlugin macros
    JucePlugin_Name="Odin2"
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
target_compile_options(Odin2UI PRIVATE
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
    -Wno-deprecated-copy
    -Wno-unused-but-set-variable
    # Force-include the JUCE WASM config header before everything
    -include "${JUCE_WASM_CONFIG}/JuceWasmConfig.h"
)

# ── Linker flags ─────────────────────────────────────────────────────────────
set(EXPORTED_FUNCS
    "_odin2_ui_init"
    "_odin2_ui_init_scaled"
    "_odin2_ui_tick"
    "_odin2_ui_get_fb"
    "_odin2_ui_get_width"
    "_odin2_ui_get_height"
    "_odin2_ui_on_mouse_down"
    "_odin2_ui_on_mouse_up"
    "_odin2_ui_on_mouse_move"
    "_odin2_ui_on_mouse_wheel"
    "_odin2_ui_set_param"
    "_odin2_ui_get_param"
    "_odin2_ui_get_param_count"
    "_odin2_ui_get_program"
    "_odin2_ui_set_program"
    "_odin2_ui_get_program_count"
    "_odin2_ui_shutdown"
    "_malloc"
    "_free"
)

string(REPLACE ";" "," EXPORTED_FUNCS_STR "${EXPORTED_FUNCS}")

target_link_libraries(Odin2UI PRIVATE "${JUCE_LIB}")

set_target_properties(Odin2UI PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/odin2"
    OUTPUT_NAME "Odin2UI"
)

target_link_options(Odin2UI PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOdin2UIModule'"
    "SHELL:-s EXPORTED_FUNCTIONS='[${EXPORTED_FUNCS_STR}]'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"setValue\",\"getValue\"]'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s INITIAL_MEMORY=134217728"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s USE_FREETYPE=1"
    -fexceptions
    -O2
)
