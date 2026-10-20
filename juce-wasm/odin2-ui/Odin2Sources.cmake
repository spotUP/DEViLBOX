# Shared by odin2-ui (editor framebuffer) and odin2 (audio engine): both host the real
# upstream OdinAudioProcessor, so the source list, include dirs and defines live here once.
# Caller sets ODIN2_UI_DIR to this directory before include().
# ── Paths ─────────────────────────────────────────────────────────────────────
set(ODIN2_ROOT "${ODIN2_UI_DIR}/../../third-party/odin2-master")
set(ODIN2_SRC "${ODIN2_ROOT}/Source")
set(JUCE_MODULES "${ODIN2_UI_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_WASM_CONFIG "${ODIN2_UI_DIR}/../juce-lib")
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


file(GLOB ODIN2_BINARY_DATA_SOURCES "${ODIN2_UI_DIR}/stubs/BinaryData_*.cpp")
set(ODIN2_STUB_SOURCES "${ODIN2_UI_DIR}/Odin2Stubs.cpp")

set(ODIN2_ALL_SOURCES
    ${ODIN2_GUI_SOURCES}
    ${ODIN2_PROCESSOR_SOURCES}
    ${ODIN2_AUDIO_SOURCES}
    ${ODIN2_FILTER_SOURCES}
    ${ODIN2_FX_SOURCES}
    ${ODIN2_OSC_SOURCES}
    ${ODIN2_WAVETABLE_SOURCES}
    ${ODIN2_STUB_SOURCES}
    ${ODIN2_BINARY_DATA_SOURCES}
)

set(ODIN2_INCLUDE_DIRS
    "${ODIN2_UI_DIR}/stubs"
    "${ODIN2_ROOT}/JuceLibraryCode"
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
    "${ODIN2_ROOT}"
    "${ODIN2_ROOT}/libs/json/include"
    "${ODIN2_ROOT}/libs/tuning-library/include"
    "${JUCE_MODULES}"
    "${JUCE_WASM_CONFIG}"
)

# ── Compile definitions ──────────────────────────────────────────────────────
set(ODIN2_COMPILE_DEFS
    ODIN2_WASM_UI=1   # selects the full-JUCE branch of third-party JuceLibraryCode/JuceHeader.h
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
set(ODIN2_COMPILE_OPTS
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

