# DB303 (TB-303 Synthesizer) WASM Build
# Based on the Open303 project by Robin Schmidt (rosic) with db303 tweaks

cmake_minimum_required(VERSION 3.20)
project(DB303 VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(DB303_CXX_SOURCES
    DB303Synth.cpp
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

set(DB303_C_SOURCES
    fft4g.c
)

add_executable(DB303WASM ${DB303_CXX_SOURCES} ${DB303_C_SOURCES})

target_include_directories(DB303WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

# C++ compile options
set_source_files_properties(${DB303_CXX_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-unused-but-set-variable -Wno-sign-compare"
)

# C compile options
set_source_files_properties(${DB303_C_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -Wno-unused-variable"
)

set_target_properties(DB303WASM PROPERTIES
    OUTPUT_NAME "DB303"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/db303"
)

target_link_options(DB303WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createDB303Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
