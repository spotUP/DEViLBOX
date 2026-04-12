cmake_minimum_required(VERSION 3.15)
project(AelapseWASM VERSION 1.0.0 LANGUAGES CXX)

# Aelapse DSP WASM Effect
# Ports smiarx/aelapse tape delay + spring reverb to DEViLBOX via the
# WASMEffectBase framework. DSP sources live in the third-party submodule
# at third-party/aelapse/submodules/dsp — we pull them in directly as
# TU sources rather than relying on the upstream CMakeLists so we don't
# have to drag in SuperCollider / AVX2 dispatch plumbing.

set(REPO_ROOT ${CMAKE_SOURCE_DIR}/../..)
set(AELAPSE_ROOT ${REPO_ROOT}/third-party/aelapse)
set(DSP_ROOT ${AELAPSE_ROOT}/submodules/dsp)

if(NOT EXISTS ${DSP_ROOT}/include/dsp/cpu/defines.h)
    message(FATAL_ERROR "third-party/aelapse submodule is missing. Run: git -C third-party clone --recursive https://github.com/smiarx/aelapse.git")
endif()

set(AELAPSE_SOURCES
    AelapseEffect.cpp
    ${DSP_ROOT}/processors/tapedelay/TapeDelay.cpp
    ${DSP_ROOT}/processors/springs/Springs.cpp
)

add_executable(AelapseWASM ${AELAPSE_SOURCES})

target_include_directories(AelapseWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common       # WASMEffectBase.h
    ${DSP_ROOT}/include                         # dsp/*
    ${DSP_ROOT}/processors                      # tapedelay/TapeDelay.h, springs/Springs.h
    ${DSP_ROOT}/processors/tapedelay            # TapeDelayDefines.h
    ${DSP_ROOT}/processors/springs              # SpringsDefines.h
    ${DSP_ROOT}/submodules/gcem/include         # gcem constexpr math
)

target_compile_definitions(AelapseWASM PRIVATE
    SPRINGS_RMS=1                               # enable getRMSStack for overlay shader
    SPRINGS_RMS_STACK_SIZE=64
    SPRINGS_N_SPRINGS=4
)

set_target_properties(AelapseWASM PROPERTIES
    OUTPUT_NAME "Aelapse"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${REPO_ROOT}/public/aelapse"
)

target_compile_options(AelapseWASM PRIVATE
    -std=c++17
    -O3
    -ffast-math
    -msimd128              # WASM SIMD for GCC vector extensions
    -Wno-unused-parameter
    -Wno-unused-function
    -Wno-deprecated-copy
)

target_link_options(AelapseWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAelapseModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=67108864"          # 64 MB — Springs + TapeDelay delay lines + multi-rate buffers (32 MB was OOM in AudioWorklet)
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
