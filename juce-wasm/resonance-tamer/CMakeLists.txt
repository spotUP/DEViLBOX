cmake_minimum_required(VERSION 3.15)
project(ResonanceTamerWASM VERSION 1.0.0)

# Master-bus adaptive resonance suppressor (Soothe-style, simpler).
# STFT peak detection + dynamic per-bin notch, all real-time.
#
# Dependencies (vendored here, no system package required):
#   - kissfft/ (MIT) — real-valued FFT (kiss_fftr)
#   - ../common/WASMEffectBase.h — shared WASMEffect harness

set(KISSFFT_DIR ${CMAKE_CURRENT_SOURCE_DIR}/kissfft)

set(SOURCES
    ResonanceTamerEffect.cpp
    STFT.cpp
    ${KISSFFT_DIR}/kiss_fft.c
    ${KISSFFT_DIR}/kiss_fftr.c
)

add_executable(ResonanceTamerWASM ${SOURCES})

target_include_directories(ResonanceTamerWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
    ${KISSFFT_DIR}
)

set_target_properties(ResonanceTamerWASM PROPERTIES
    OUTPUT_NAME "ResonanceTamer"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/resonance-tamer"
)

# kissfft needs to know its data type. Float is the default.
target_compile_definitions(ResonanceTamerWASM PRIVATE
    kiss_fft_scalar=float
)

target_link_options(ResonanceTamerWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createResonanceTamerModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=0"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

# Compile kissfft as C99, wrapper as C++17.
set_source_files_properties(${KISSFFT_DIR}/kiss_fft.c  PROPERTIES COMPILE_FLAGS "-std=c99")
set_source_files_properties(${KISSFFT_DIR}/kiss_fftr.c PROPERTIES COMPILE_FLAGS "-std=c99")
set_source_files_properties(ResonanceTamerEffect.cpp   PROPERTIES COMPILE_FLAGS "-std=c++17")
set_source_files_properties(STFT.cpp                   PROPERTIES COMPILE_FLAGS "-std=c++17")

target_compile_options(ResonanceTamerWASM PRIVATE -O3)
