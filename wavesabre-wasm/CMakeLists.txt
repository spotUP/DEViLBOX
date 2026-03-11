cmake_minimum_required(VERSION 3.16)
project(WaveSabreSynth)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# WaveSabreCore source
set(WAVESABRE_DIR "${CMAKE_SOURCE_DIR}/../third-party/wavesabre/WaveSabreCore")

# Core sources needed for synths
# Note: MxcsrFlagGuard.cpp uses SSE intrinsics, we provide a stub instead
set(CORE_SOURCES
    ${WAVESABRE_DIR}/src/Device.cpp
    ${WAVESABRE_DIR}/src/SynthDevice.cpp
    ${WAVESABRE_DIR}/src/Envelope.cpp
    ${WAVESABRE_DIR}/src/BiquadFilter.cpp
    ${WAVESABRE_DIR}/src/StateVariableFilter.cpp
    ${WAVESABRE_DIR}/src/Helpers.cpp
    src/MxcsrFlagGuard_stub.cpp
)

# Synth sources - Falcon, Slaughter, and Adultery (GmDls stub replaces Windows API)
set(SYNTH_SOURCES
    ${WAVESABRE_DIR}/src/Falcon.cpp
    ${WAVESABRE_DIR}/src/Slaughter.cpp
    ${WAVESABRE_DIR}/src/Adultery.cpp
    ${WAVESABRE_DIR}/src/SamplePlayer.cpp
)

# Effect sources (some synths use effects)
set(EFFECT_SOURCES
    ${WAVESABRE_DIR}/src/AllPass.cpp
    ${WAVESABRE_DIR}/src/AllPassDelay.cpp
    ${WAVESABRE_DIR}/src/Comb.cpp
    ${WAVESABRE_DIR}/src/DelayBuffer.cpp
)

# WASM wrapper
set(WRAPPER_SOURCES
    src/wavesabre_wasm.cpp
    src/GmDls_wasm.cpp
)

if(EMSCRIPTEN)
    add_executable(WaveSabreSynth 
        ${CORE_SOURCES}
        ${SYNTH_SOURCES}
        ${EFFECT_SOURCES}
        ${WRAPPER_SOURCES}
    )
    
    target_include_directories(WaveSabreSynth PRIVATE
        ${WAVESABRE_DIR}/include
    )
    
    target_compile_options(WaveSabreSynth PRIVATE
        -O2
        -fno-exceptions
        -fno-rtti
        -DWASM_BUILD
        -Wno-deprecated-declarations
    )
    
    set_target_properties(WaveSabreSynth PROPERTIES
        LINK_FLAGS "\
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createWaveSabreSynth' \
            -s EXPORTED_FUNCTIONS='[\
                \"_wavesabre_create_falcon\",\
                \"_wavesabre_create_slaughter\",\
                \"_wavesabre_create_adultery\",\
                \"_wavesabre_set_gmdls_data\",\
                \"_wavesabre_has_gmdls\",\
                \"_wavesabre_destroy\",\
                \"_wavesabre_set_param\",\
                \"_wavesabre_note_on\",\
                \"_wavesabre_note_off\",\
                \"_wavesabre_render\",\
                \"_wavesabre_set_sample_rate\",\
                \"_malloc\",\
                \"_free\"\
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"HEAPF32\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=16777216 \
            -s ENVIRONMENT='web,worker' \
            -s SINGLE_FILE=0 \
            -s WASM=1 \
            -s NO_EXIT_RUNTIME=1 \
            -O2 \
        "
        SUFFIX ".js"
    )
endif()
