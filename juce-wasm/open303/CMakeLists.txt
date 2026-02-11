cmake_minimum_required(VERSION 3.13)
project(Open303 LANGUAGES C CXX)

# Open303 (TB-303 Synthesizer) WASM Build
# Based on the Open303 project by Robin Schmidt (rosic)

set(OPEN303_CXX_SOURCES
    Open303Synth.cpp
    rosic_Open303.cpp
    rosic_AcidPattern.cpp
    rosic_AcidSequencer.cpp
    rosic_AnalogEnvelope.cpp
    rosic_BiquadFilter.cpp
    rosic_BlendOscillator.cpp
    rosic_Complex.cpp
    rosic_DecayEnvelope.cpp
    rosic_EllipticQuarterBandFilter.cpp
    rosic_FourierTransformerRadix2.cpp
    rosic_FunctionTemplates.cpp
    rosic_LeakyIntegrator.cpp
    rosic_MidiNoteEvent.cpp
    rosic_MipMappedWaveTable.cpp
    rosic_NumberManipulations.cpp
    rosic_OnePoleFilter.cpp
    rosic_RealFunctions.cpp
    rosic_TeeBeeFilter.cpp
    GlobalFunctions.cpp
)

set(OPEN303_C_SOURCES
    fft4g.c
)

add_executable(Open303WASM ${OPEN303_CXX_SOURCES} ${OPEN303_C_SOURCES})

target_include_directories(Open303WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common
)

# C++ compile options
set_source_files_properties(${OPEN303_CXX_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-unused-but-set-variable -Wno-sign-compare"
)

# C compile options
set_source_files_properties(${OPEN303_C_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -Wno-unused-variable"
)

set_target_properties(Open303WASM PROPERTIES
    OUTPUT_NAME "Open303"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/open303"
)

target_link_options(Open303WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOpen303Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
