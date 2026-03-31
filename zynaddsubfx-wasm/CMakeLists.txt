cmake_minimum_required(VERSION 3.20)
project(ZynAddSubFX_WASM VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Must build with Emscripten: emcmake cmake ..")
endif()

# ZynAddSubFX source tree
set(ZYN_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/zynaddsubfx-master")
set(ZYN_SRC "${ZYN_ROOT}/src")

# Pre-built dependency locations
set(FFTW3_ROOT "${CMAKE_SOURCE_DIR}/../third-party/fftw-3.3.10/build-wasm/install")
set(MXML_ROOT "${CMAKE_SOURCE_DIR}/../third-party/mxml")
set(MXML_BUILD "${MXML_ROOT}/build-wasm")
set(RTOSC_ROOT "${ZYN_ROOT}/rtosc")
set(RTOSC_BUILD "${CMAKE_SOURCE_DIR}/../third-party/rtosc-build-wasm")

# Include paths
include_directories(
    ${ZYN_SRC}
    ${ZYN_ROOT}
    ${CMAKE_SOURCE_DIR}/generated   # zyn-version.h, zyn-config.h
    ${CMAKE_SOURCE_DIR}/stubs       # lo/lo.h stub
    ${FFTW3_ROOT}/include
    ${MXML_ROOT}
    ${RTOSC_ROOT}/include
)

# Defines matching ZynAddSubFX build
add_definitions(
    -DVERSION="3.0.7"
    -DHAVE_CPP_STD_COMPLEX=1
    -DHAVE_ASYNC=0
    -DHAVE_BG_SYNTH_THREAD=0
    -DDISABLE_GUI
    -DNO_UI=1
    -DUSE_NSM=0
    -DOUT_DEFAULT="null"
    -DIN_DEFAULT="null"
    -DMXML_MAJOR_VERSION=4
    -DNDEBUG
)

# ZynAddSubFX DSP source files
set(ZYN_DSP_SOURCES
    ${ZYN_SRC}/DSP/AnalogFilter.cpp
    ${ZYN_SRC}/DSP/FFTwrapper.cpp
    ${ZYN_SRC}/DSP/Filter.cpp
    ${ZYN_SRC}/DSP/FormantFilter.cpp
    ${ZYN_SRC}/DSP/SVFilter.cpp
    ${ZYN_SRC}/DSP/MoogFilter.cpp
    ${ZYN_SRC}/DSP/CombFilter.cpp
    ${ZYN_SRC}/DSP/Reverter.cpp
    ${ZYN_SRC}/DSP/Unison.cpp
    ${ZYN_SRC}/DSP/Value_Smoothing_Filter.cpp
)

# ZynAddSubFX Synth source files
set(ZYN_SYNTH_SOURCES
    ${ZYN_SRC}/Synth/SynthNote.cpp
    ${ZYN_SRC}/Synth/ADnote.cpp
    ${ZYN_SRC}/Synth/Envelope.cpp
    ${ZYN_SRC}/Synth/LFO.cpp
    ${ZYN_SRC}/Synth/ModFilter.cpp
    ${ZYN_SRC}/Synth/OscilGen.cpp
    ${ZYN_SRC}/Synth/PADnote.cpp
    ${ZYN_SRC}/Synth/Portamento.cpp
    ${ZYN_SRC}/Synth/Resonance.cpp
    ${ZYN_SRC}/Synth/SUBnote.cpp
    ${ZYN_SRC}/Synth/WatchPoint.cpp
)

# ZynAddSubFX Effects source files
set(ZYN_EFFECT_SOURCES
    ${ZYN_SRC}/Effects/Alienwah.cpp
    ${ZYN_SRC}/Effects/Chorus.cpp
    ${ZYN_SRC}/Effects/Distortion.cpp
    ${ZYN_SRC}/Effects/CombFilterBank.cpp
    ${ZYN_SRC}/Effects/DynamicFilter.cpp
    ${ZYN_SRC}/Effects/Echo.cpp
    ${ZYN_SRC}/Effects/Effect.cpp
    ${ZYN_SRC}/Effects/EffectLFO.cpp
    ${ZYN_SRC}/Effects/EffectMgr.cpp
    ${ZYN_SRC}/Effects/EQ.cpp
    ${ZYN_SRC}/Effects/Phaser.cpp
    ${ZYN_SRC}/Effects/Reverb.cpp
    ${ZYN_SRC}/Effects/Sympathetic.cpp
    ${ZYN_SRC}/Effects/Reverse.cpp
)

# ZynAddSubFX Params source files
set(ZYN_PARAMS_SOURCES
    ${ZYN_SRC}/Params/ADnoteParameters.cpp
    ${ZYN_SRC}/Params/Controller.cpp
    ${ZYN_SRC}/Params/EnvelopeParams.cpp
    ${ZYN_SRC}/Params/FilterParams.cpp
    ${ZYN_SRC}/Params/LFOParams.cpp
    ${ZYN_SRC}/Params/PADnoteParameters.cpp
    ${ZYN_SRC}/Params/Presets.cpp
    ${ZYN_SRC}/Params/PresetsArray.cpp
    ${ZYN_SRC}/Params/PresetsStore.cpp
    ${ZYN_SRC}/Params/SUBnoteParameters.cpp
)

# ZynAddSubFX Misc source files
set(ZYN_MISC_SOURCES
    ${ZYN_SRC}/Misc/Bank.cpp
    ${ZYN_SRC}/Misc/BankDb.cpp
    ${ZYN_SRC}/Misc/Config.cpp
    ${ZYN_SRC}/Misc/Master.cpp
    ${ZYN_SRC}/Misc/Microtonal.cpp
    ${ZYN_SRC}/Misc/Part.cpp
    ${ZYN_SRC}/Misc/Util.cpp
    ${ZYN_SRC}/Misc/XMLwrapper.cpp
    ${ZYN_SRC}/Misc/Recorder.cpp
    ${ZYN_SRC}/Misc/WavFile.cpp
    ${ZYN_SRC}/Misc/WaveShapeSmps.cpp
    ${ZYN_SRC}/Misc/MiddleWare.cpp
    ${ZYN_SRC}/Misc/MsgParsing.cpp
    ${ZYN_SRC}/Misc/PresetExtractor.cpp
    ${ZYN_SRC}/Misc/Allocator.cpp
    ${ZYN_SRC}/Misc/CallbackRepeater.cpp
    ${ZYN_SRC}/Misc/Schema.cpp
    ${ZYN_SRC}/Misc/MemLocker.cpp
)

# Container and core source files
set(ZYN_CORE_SOURCES
    ${ZYN_SRC}/version.cpp
    ${ZYN_SRC}/globals.cpp
    ${ZYN_ROOT}/tlsf/tlsf.c
    ${ZYN_SRC}/Containers/ScratchString.cpp
    ${ZYN_SRC}/Containers/NotePool.cpp
    ${ZYN_SRC}/Containers/MultiPseudoStack.cpp
)

# NIO (minimal - just null engine)
set(ZYN_NIO_SOURCES
    ${ZYN_SRC}/Nio/NulEngine.cpp
    ${ZYN_SRC}/Nio/AudioOut.cpp
    ${ZYN_SRC}/Nio/MidiIn.cpp
    ${ZYN_SRC}/Nio/OutMgr.cpp
    ${ZYN_SRC}/Nio/InMgr.cpp
    ${ZYN_SRC}/Nio/Engine.cpp
    ${ZYN_SRC}/Nio/EngineMgr.cpp
    ${ZYN_SRC}/Nio/Nio.cpp
    ${ZYN_SRC}/Nio/WavEngine.cpp
)

# UI stubs (no GUI, no NSM)
set(ZYN_UI_STUBS
    ${ZYN_SRC}/UI/ConnectionDummy.cpp
)

# Our bridge and stubs
set(BRIDGE_SOURCES
    ${CMAKE_SOURCE_DIR}/zasfx_bridge.cpp
    ${CMAKE_SOURCE_DIR}/wasm_stubs.cpp
)

# Compile all together
add_executable(ZynAddSubFX
    ${ZYN_CORE_SOURCES}
    ${ZYN_DSP_SOURCES}
    ${ZYN_SYNTH_SOURCES}
    ${ZYN_EFFECT_SOURCES}
    ${ZYN_PARAMS_SOURCES}
    ${ZYN_MISC_SOURCES}
    ${ZYN_NIO_SOURCES}
    ${ZYN_UI_STUBS}
    ${BRIDGE_SOURCES}
)

# Suppress warnings in third-party code
target_compile_options(ZynAddSubFX PRIVATE
    -Wno-unused-parameter
    -Wno-sign-compare
    -Wno-unused-variable
    -Wno-missing-field-initializers
    -Wno-deprecated-declarations
    -Wno-vla-cxx-extension
    -Wno-nan-infinity-disabled
    -O2
)

# Link pre-built static libraries
target_link_libraries(ZynAddSubFX
    ${FFTW3_ROOT}/lib/libfftw3f.a
    ${MXML_BUILD}/libmxml.a
    ${RTOSC_BUILD}/librtosc.a
    ${RTOSC_BUILD}/librtosc-cpp.a
)

# Emscripten output settings
set(EXPORTED_FUNCTIONS
    "_zasfx_create"
    "_zasfx_destroy"
    "_zasfx_process"
    "_zasfx_note_on"
    "_zasfx_note_off"
    "_zasfx_set_param"
    "_zasfx_get_param"
    "_zasfx_get_num_params"
    "_zasfx_all_notes_off"
    "_zasfx_load_preset_xml"
    "_malloc"
    "_free"
)

# Join the list with commas for Emscripten
string(REPLACE ";" "," EXPORTED_FUNCTIONS_STR "${EXPORTED_FUNCTIONS}")

set_target_properties(ZynAddSubFX PROPERTIES
    OUTPUT_NAME "ZynAddSubFX"
    SUFFIX ".js"
)

target_link_options(ZynAddSubFX PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createZynAddSubFX"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,getValue,setValue,wasmMemory,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s WASM=1"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s USE_ZLIB=1"
    "SHELL:-s USE_PTHREADS=0"
    "SHELL:-s ERROR_ON_UNDEFINED_SYMBOLS=0"
    "--js-library ${CMAKE_SOURCE_DIR}/fs_stubs.js"
)
