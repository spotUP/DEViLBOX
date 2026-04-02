cmake_minimum_required(VERSION 3.15)
project(SurgeUI C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ═══════════════════════════════════════════════════════════════════════════════
# Paths
# ═══════════════════════════════════════════════════════════════════════════════
set(SURGE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/surge-xt")
set(SURGE_SRC "${SURGE_ROOT}/src")
set(SURGE_XT_SRC "${SURGE_SRC}/surge-xt")
set(SURGE_COMMON_SRC "${SURGE_SRC}/common")
set(SURGE_LIBS "${SURGE_ROOT}/libs")
set(JUCE_MODULES "${SURGE_LIBS}/JUCE/modules")
set(LIBJUCE_WASM "${CMAKE_CURRENT_SOURCE_DIR}/../juce-lib/build/libjuce-wasm.a")
set(JUCE_LIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../juce-lib")

# Pre-built libraries from the Surge CMake build
set(SURGE_BUILD "${CMAKE_CURRENT_SOURCE_DIR}/build")

# ═══════════════════════════════════════════════════════════════════════════════
# Surge XT editor source files
# ═══════════════════════════════════════════════════════════════════════════════
set(SURGE_XT_SOURCES
    ${SURGE_XT_SRC}/SurgeSynthEditor.cpp
    ${SURGE_XT_SRC}/SurgeSynthProcessor.cpp
    ${SURGE_XT_SRC}/SurgeCLAPPresetDiscovery.cpp
    ${SURGE_XT_SRC}/util/LuaTokeniserSurge.cpp
    ${SURGE_XT_SRC}/gui/RuntimeFont.cpp
    ${SURGE_XT_SRC}/gui/SkinFontLoader.cpp
    ${SURGE_XT_SRC}/gui/SkinSupport.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditor.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditorHtmlGenerators.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditorInfowindow.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditorOverlays.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditorValueCallbacks.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIEditorMenuStructures.cpp
    ${SURGE_XT_SRC}/gui/SurgeGUIUtils.cpp
    ${SURGE_XT_SRC}/gui/SurgeImage.cpp
    ${SURGE_XT_SRC}/gui/SurgeImageStore.cpp
    ${SURGE_XT_SRC}/gui/SurgeJUCELookAndFeel.cpp
    ${SURGE_XT_SRC}/gui/UndoManager.cpp
    ${SURGE_XT_SRC}/gui/overlays/AboutScreen.cpp
    ${SURGE_XT_SRC}/gui/overlays/FilterAnalysis.cpp
    ${SURGE_XT_SRC}/gui/overlays/KeyBindingsOverlay.cpp
    ${SURGE_XT_SRC}/gui/overlays/LuaEditors.cpp
    ${SURGE_XT_SRC}/gui/overlays/MSEGEditor.cpp
    ${SURGE_XT_SRC}/gui/overlays/MiniEdit.cpp
    ${SURGE_XT_SRC}/gui/overlays/Alert.cpp
    ${SURGE_XT_SRC}/gui/overlays/OverlayUtils.cpp
    ${SURGE_XT_SRC}/gui/overlays/ModulationEditor.cpp
    ${SURGE_XT_SRC}/gui/overlays/Oscilloscope.cpp
    ${SURGE_XT_SRC}/gui/overlays/OverlayWrapper.cpp
    ${SURGE_XT_SRC}/gui/overlays/PatchDBViewer.cpp
    ${SURGE_XT_SRC}/gui/overlays/PatchStoreDialog.cpp
    ${SURGE_XT_SRC}/gui/overlays/TuningOverlays.cpp
    ${SURGE_XT_SRC}/gui/overlays/TypeinParamEditor.cpp
    ${SURGE_XT_SRC}/gui/overlays/WaveShaperAnalysis.cpp
    ${SURGE_XT_SRC}/gui/overlays/OpenSoundControlSettings.cpp
    ${SURGE_XT_SRC}/gui/widgets/CurrentFxDisplay.cpp
    ${SURGE_XT_SRC}/gui/widgets/EffectChooser.cpp
    ${SURGE_XT_SRC}/gui/widgets/LFOAndStepDisplay.cpp
    ${SURGE_XT_SRC}/gui/widgets/MainFrame.cpp
    ${SURGE_XT_SRC}/gui/widgets/MenuButtonFromIcon.cpp
    ${SURGE_XT_SRC}/gui/widgets/MenuCustomComponents.cpp
    ${SURGE_XT_SRC}/gui/widgets/MenuForDiscreteParams.cpp
    ${SURGE_XT_SRC}/gui/widgets/ModulatableSlider.cpp
    ${SURGE_XT_SRC}/gui/widgets/ModulationSourceButton.cpp
    ${SURGE_XT_SRC}/gui/widgets/MultiSwitch.cpp
    ${SURGE_XT_SRC}/gui/widgets/NumberField.cpp
    ${SURGE_XT_SRC}/gui/widgets/OscillatorWaveformDisplay.cpp
    ${SURGE_XT_SRC}/gui/widgets/ParameterInfowindow.cpp
    ${SURGE_XT_SRC}/gui/widgets/PatchSelector.cpp
    ${SURGE_XT_SRC}/gui/widgets/Switch.cpp
    ${SURGE_XT_SRC}/gui/widgets/SurgeTextButton.cpp
    ${SURGE_XT_SRC}/gui/widgets/TypeAheadTextEditor.cpp
    ${SURGE_XT_SRC}/gui/widgets/VerticalLabel.cpp
    ${SURGE_XT_SRC}/gui/widgets/VuMeter.cpp
    ${SURGE_XT_SRC}/gui/widgets/WaveShaperSelector.cpp
    ${SURGE_XT_SRC}/gui/widgets/XMLConfiguredMenus.cpp
    ${SURGE_XT_SRC}/osc/OpenSoundControl.cpp
)

# ═══════════════════════════════════════════════════════════════════════════════
# Build juce_osc module (not in libjuce-wasm, needed by Surge's OSC support)
# ═══════════════════════════════════════════════════════════════════════════════
set(JUCE_OSC_SRC "${CMAKE_CURRENT_SOURCE_DIR}/build_juce_osc.cpp")

# ═══════════════════════════════════════════════════════════════════════════════
# WASM bridge + stubs
# ═══════════════════════════════════════════════════════════════════════════════
set(BRIDGE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/SurgeUIBridge.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/SurgeStubs.cpp
    ${JUCE_OSC_SRC}
)

# ═══════════════════════════════════════════════════════════════════════════════
# All source combined
# ═══════════════════════════════════════════════════════════════════════════════
add_executable(SurgeUI ${SURGE_XT_SOURCES} ${BRIDGE_SOURCES})

# ═══════════════════════════════════════════════════════════════════════════════
# Include directories
# ═══════════════════════════════════════════════════════════════════════════════
target_include_directories(SurgeUI PRIVATE
    # JUCE modules
    ${JUCE_MODULES}

    # Our JUCE config
    ${JUCE_LIB_DIR}

    # Surge XT editor dirs
    ${SURGE_XT_SRC}
    ${SURGE_XT_SRC}/gui
    ${SURGE_XT_SRC}/osc
    ${SURGE_XT_SRC}/util

    # Surge common (DSP engine) - all subdirs
    ${SURGE_COMMON_SRC}
    ${SURGE_COMMON_SRC}/dsp
    ${SURGE_COMMON_SRC}/dsp/effects
    ${SURGE_COMMON_SRC}/dsp/filters
    ${SURGE_COMMON_SRC}/dsp/modulators
    ${SURGE_COMMON_SRC}/dsp/oscillators
    ${SURGE_COMMON_SRC}/dsp/utilities
    ${SURGE_COMMON_SRC}/dsp/vembertech

    # Surge platform
    ${SURGE_SRC}/platform

    # Generated binary data headers
    ${SURGE_BUILD}/src/surge-xt/juce_binarydata_surge-xt-binary/JuceLibraryCode
    ${SURGE_BUILD}/src/common/juce_binarydata_surge-common-binary/JuceLibraryCode

    # Generated version header
    ${SURGE_BUILD}/geninclude

    # Third-party libs
    ${SURGE_LIBS}/sst/sst-plugininfra/include
    ${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/include
    ${SURGE_LIBS}/sst/sst-plugininfra/libs/filesystem/include
    ${SURGE_LIBS}/sst/sst-plugininfra/libs/strnatcmp
    ${SURGE_LIBS}/sst/sst-cpputils/include
    ${SURGE_LIBS}/sst/sst-basic-blocks/include
    ${SURGE_LIBS}/sst/sst-filters/include
    ${SURGE_LIBS}/sst/sst-filters/include-extras
    ${SURGE_LIBS}/sst/sst-waveshapers/include
    ${SURGE_LIBS}/sst/sst-effects/include
    ${SURGE_LIBS}/sst/sst-jucegui/include
    ${SURGE_LIBS}/tuning-library/include
    ${SURGE_LIBS}/simde
    ${SURGE_LIBS}/fmt/include
    ${SURGE_LIBS}/airwindows/src
    ${SURGE_LIBS}/pffft
    ${SURGE_LIBS}/eurorack
    ${SURGE_LIBS}/PEGTL/include
    ${SURGE_LIBS}/oddsound-mts/MTS-ESP/Client
    ${SURGE_LIBS}/oddsound-mts/MTS-ESP/Master
    ${SURGE_LIBS}/sqlite-3.23.3

    # Generated filesystem import
    ${SURGE_BUILD}/libs/sst/sst-plugininfra/libs/filesystem/include
)

# ═══════════════════════════════════════════════════════════════════════════════
# Compile definitions
# ═══════════════════════════════════════════════════════════════════════════════
target_compile_definitions(SurgeUI PRIVATE
    # JUCE standard defines
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_MODULE_AVAILABLE_juce_core=1
    JUCE_MODULE_AVAILABLE_juce_audio_basics=1
    JUCE_MODULE_AVAILABLE_juce_audio_devices=1
    JUCE_MODULE_AVAILABLE_juce_audio_formats=1
    JUCE_MODULE_AVAILABLE_juce_audio_processors=1
    JUCE_MODULE_AVAILABLE_juce_audio_utils=1
    JUCE_MODULE_AVAILABLE_juce_data_structures=1
    JUCE_MODULE_AVAILABLE_juce_dsp=1
    JUCE_MODULE_AVAILABLE_juce_events=1
    JUCE_MODULE_AVAILABLE_juce_graphics=1
    JUCE_MODULE_AVAILABLE_juce_gui_basics=1
    JUCE_MODULE_AVAILABLE_juce_gui_extra=1
    JUCE_MODULE_AVAILABLE_juce_osc=1
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    JUCE_ALLOW_STATIC_NULL_VARIABLES=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_MODAL_LOOPS_PERMITTED=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_STANDALONE_APPLICATION=0
    JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP=0
    JUCE_CATCH_UNHANDLED_EXCEPTIONS=0
    JUCE_ALSA=0
    JUCE_JACK=0
    JUCE_WASAPI=0
    JUCE_DIRECTSOUND=0
    JUCE_PLUGINHOST_VST3=0
    LINUX=1

    # JUCE plugin macros (normally generated by juce_add_plugin)
    JucePlugin_Name="Surge XT"
    JucePlugin_Manufacturer="Surge Synth Team"
    JucePlugin_ManufacturerCode=0x566d6241
    JucePlugin_PluginCode=0x53675854
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=1
    JucePlugin_Version=1.4.0
    JucePlugin_VersionCode=0x10400
    JucePlugin_VersionString="1.4.0"

    # Surge-specific
    SURGE_COMPILE_BLOCK_SIZE=32
    BUILD_IS_RELEASE=1
    HAS_LUA=0
    HAS_JUCE=1
    SKIP_JUCE=0
    SURGE_XT_1X_WST=1
    SST_PLUGINFRA_PLATFORM_FS=1
    TIXML_USE_STL=1

    # PFFFT
    PFFFT_SIMD_DISABLE

    # fmt consteval fix
    FMT_HAS_CONSTEVAL=0
)

# ═══════════════════════════════════════════════════════════════════════════════
# Warning suppression
# ═══════════════════════════════════════════════════════════════════════════════
target_compile_options(SurgeUI PRIVATE
    -fno-char8_t
    -Wno-nontrivial-memcall
    -Wno-deprecated-declarations
    -Wno-unused-variable
    -Wno-unused-but-set-variable
    -Wno-sign-compare
)

# ═══════════════════════════════════════════════════════════════════════════════
# Pre-built static libraries from Surge's CMake build
# ═══════════════════════════════════════════════════════════════════════════════
set(SURGE_PREBUILT_LIBS
    ${SURGE_BUILD}/src/common/libsurge-common.a
    ${SURGE_BUILD}/src/common/libsurge-common-binary.a
    ${SURGE_BUILD}/src/surge-xt/libsurge-xt-binary.a
    ${SURGE_BUILD}/libs/fmt/libfmt.a
    ${SURGE_BUILD}/libs/pffft/libpffft.a
    ${SURGE_BUILD}/libs/zstd/build/cmake/lib/libzstd.a
    ${SURGE_BUILD}/libs/airwindows/libairwindows.a
    ${SURGE_BUILD}/libs/eurorack/libeurorack.a
    ${SURGE_BUILD}/libs/binn/libbinn.a
    ${SURGE_BUILD}/libs/sqlite-3.23.3/libsqlite.a
    ${SURGE_BUILD}/libs/sst/sst-plugininfra/libsst-plugininfra.a
    ${SURGE_BUILD}/libs/sst/sst-plugininfra/libs/tinyxml/libtinyxml.a
    ${SURGE_BUILD}/libs/sst/sst-plugininfra/libs/strnatcmp/libstrnatcmp.a
    ${SURGE_BUILD}/libs/oddsound-mts/liboddsound-mts.a
    ${SURGE_BUILD}/src/lua/libsurge-lua-src.a
    ${LIBJUCE_WASM}
)

target_link_libraries(SurgeUI PRIVATE ${SURGE_PREBUILT_LIBS})

# ═══════════════════════════════════════════════════════════════════════════════
# Emscripten linker options
# ═══════════════════════════════════════════════════════════════════════════════
set(EXPORTED_FUNCTIONS
    _surge_ui_init
    _surge_ui_init_scaled
    _surge_ui_tick
    _surge_ui_get_fb
    _surge_ui_get_width
    _surge_ui_get_height
    _surge_ui_on_mouse_down
    _surge_ui_on_mouse_up
    _surge_ui_on_mouse_move
    _surge_ui_on_mouse_wheel
    _surge_ui_set_param
    _surge_ui_get_param
    _surge_ui_get_param_count
    _surge_ui_get_program
    _surge_ui_set_program
    _surge_ui_get_program_count
    _surge_ui_get_program_name
    _surge_ui_shutdown
    _malloc
    _free
)

list(JOIN EXPORTED_FUNCTIONS "," EXPORTED_FUNCTIONS_STR)

set(EXPORTED_RUNTIME_METHODS
    ccall
    cwrap
    getValue
    setValue
    UTF8ToString
)

list(JOIN EXPORTED_RUNTIME_METHODS "," EXPORTED_RUNTIME_STR)

set_target_properties(SurgeUI PROPERTIES
    OUTPUT_NAME "SurgeUI"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/surge"
)

target_link_options(SurgeUI PRIVATE
    -sWASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=67108864
    -sMAXIMUM_MEMORY=268435456
    -sSTACK_SIZE=1048576
    -sEXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]
    -sEXPORTED_RUNTIME_METHODS=[${EXPORTED_RUNTIME_STR}]
    -sMODULARIZE=1
    -sEXPORT_NAME=createSurgeUI
    -sENVIRONMENT=web
    -sNO_EXIT_RUNTIME=1
    -sASSERTIONS=0
    -sNO_FILESYSTEM=0
    -sUSE_FREETYPE=1
    --no-entry
    -O2
    -flto
)
