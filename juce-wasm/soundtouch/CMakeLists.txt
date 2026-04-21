cmake_minimum_required(VERSION 3.15)
project(SoundTouchWASM VERSION 1.0.0)

# SoundTouch WASM build for DJ deck key-lock.
# Source cloned from https://codeberg.org/soundtouch/soundtouch to soundtouch-src/.
# Only the core WSOLA/PSOLA time-domain path is compiled — BPMDetect,
# PeakFinder, and MMX/SSE intrinsics are excluded (x86 specifics self-disable
# on non-x86 via STTypes.h).

set(SOUNDTOUCH_SRC ${CMAKE_CURRENT_SOURCE_DIR}/soundtouch-src/source/SoundTouch)
set(SOUNDTOUCH_INCLUDE ${CMAKE_CURRENT_SOURCE_DIR}/soundtouch-src/include)

set(SOUNDTOUCH_SOURCES
    ${SOUNDTOUCH_SRC}/AAFilter.cpp
    ${SOUNDTOUCH_SRC}/FIFOSampleBuffer.cpp
    ${SOUNDTOUCH_SRC}/FIRFilter.cpp
    ${SOUNDTOUCH_SRC}/InterpolateCubic.cpp
    ${SOUNDTOUCH_SRC}/InterpolateLinear.cpp
    ${SOUNDTOUCH_SRC}/InterpolateShannon.cpp
    ${SOUNDTOUCH_SRC}/RateTransposer.cpp
    ${SOUNDTOUCH_SRC}/SoundTouch.cpp
    ${SOUNDTOUCH_SRC}/TDStretch.cpp
    ${SOUNDTOUCH_SRC}/cpu_detect_x86.cpp
)

set(WRAPPER_SOURCES
    DeckKeyLockWASM.cpp
)

add_executable(SoundTouchWASM ${SOUNDTOUCH_SOURCES} ${WRAPPER_SOURCES})

target_include_directories(SoundTouchWASM PRIVATE
    ${SOUNDTOUCH_INCLUDE}
    ${SOUNDTOUCH_SRC}
    ${CMAKE_CURRENT_SOURCE_DIR}
)

set_target_properties(SoundTouchWASM PROPERTIES
    OUTPUT_NAME "SoundTouch"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/soundtouch"
)

target_compile_definitions(SoundTouchWASM PRIVATE
    SOUNDTOUCH_FLOAT_SAMPLES=1
    ST_NO_EXCEPTION_HANDLING=1
)

target_link_options(SoundTouchWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSoundTouchModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=0"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s DISABLE_EXCEPTION_CATCHING=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(SoundTouchWASM PRIVATE
    -O3
    -fno-exceptions
    -std=c++17
)
