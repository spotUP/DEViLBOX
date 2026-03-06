cmake_minimum_required(VERSION 3.15)
project(gearmulator_wasm VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ──────────────────────────────────────────────────────────────────────────────
# Paths to the gearmulator reference source tree
# ──────────────────────────────────────────────────────────────────────────────

set(GM_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../Reference Code/gearmulator-main")
set(GM_SRC  "${GM_ROOT}/source")

# ──────────────────────────────────────────────────────────────────────────────
# Emscripten compile flags
# ──────────────────────────────────────────────────────────────────────────────

if(EMSCRIPTEN)
    # -pthread for SharedArrayBuffer support (AudioWorklet needs it)
    # -O2 for reasonable performance in interpreter mode
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -pthread -O2")
    set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS} -pthread -O2")

    # Increase constexpr step limit for DSP56300's compile-time tables
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fconstexpr-steps=10000000")
endif()

# ──────────────────────────────────────────────────────────────────────────────
# Disable JUCE plugin build — we only need DSP core + synthLib
# ──────────────────────────────────────────────────────────────────────────────

set(gearmulator_BUILD_JUCEPLUGIN OFF CACHE BOOL "" FORCE)
set(gearmulator_BUILD_JUCEPLUGIN_CLAP OFF CACHE BOOL "" FORCE)
set(gearmulator_BUILD_JUCEPLUGIN_LV2 OFF CACHE BOOL "" FORCE)

# Enable all synths
set(gearmulator_SYNTH_OSIRUS ON CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_OSTIRUS ON CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_VAVRA ON CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_XENIA ON CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_NODALRED2X ON CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_JE8086 ON CACHE BOOL "" FORCE)

# ──────────────────────────────────────────────────────────────────────────────
# dsp56300 base library (logging, types)
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB DSP56K_BASE_SRC "${GM_SRC}/dsp56300/source/dsp56kBase/*.cpp")
add_library(dsp56kBase STATIC ${DSP56K_BASE_SRC})
target_include_directories(dsp56kBase PUBLIC "${GM_SRC}/dsp56300/source")
# Emscripten doesn't have execinfo.h — define ANDROID to skip backtrace code
if(EMSCRIPTEN)
    # Emscripten doesn't have execinfo.h — define ANDROID to skip backtrace code
    # Define PRIO_THREAD so threadtools.cpp uses setpriority() instead of syscall(SYS_gettid)
    target_compile_definitions(dsp56kBase PRIVATE ANDROID=1 PRIO_THREAD=1)
endif()

# ──────────────────────────────────────────────────────────────────────────────
# asmjit (stub — needed for compile but JIT won't run on WASM)
# ──────────────────────────────────────────────────────────────────────────────

# asmjit is required at compile time (Jit class is always compiled) but
# g_jitSupported=false means JIT paths are never taken at runtime.
set(ASMJIT_STATIC TRUE)
set(ASMJIT_NO_INSTALL TRUE)
add_subdirectory("${GM_SRC}/dsp56300/source/asmjit" asmjit_build)
if(EMSCRIPTEN)
    # Stub out __builtin___clear_cache which is unsupported on WASM
    target_compile_options(asmjit PRIVATE "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_cache_stub.h")
endif()

# ──────────────────────────────────────────────────────────────────────────────
# dsp56kEmu — the core DSP56300 emulator
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB DSP56K_EMU_SRC "${GM_SRC}/dsp56300/source/dsp56kEmu/*.cpp")
if(EMSCRIPTEN)
    # Remove JIT .cpp files — WASM is 32-bit, JIT code has x86_64 static_asserts
    # The jit.h and jittypes.h headers are patched with #ifdef __EMSCRIPTEN__ guards
    file(GLOB DSP56K_JIT_SRC "${GM_SRC}/dsp56300/source/dsp56kEmu/jit*.cpp")
    list(REMOVE_ITEM DSP56K_EMU_SRC ${DSP56K_JIT_SRC})
endif()
add_library(dsp56kEmu STATIC ${DSP56K_EMU_SRC})
target_include_directories(dsp56kEmu PUBLIC "${GM_SRC}/dsp56300/source")
target_link_libraries(dsp56kEmu PUBLIC dsp56kBase asmjit)
target_compile_definitions(dsp56kEmu PUBLIC DSP56300_DEBUGGER=0)

# ──────────────────────────────────────────────────────────────────────────────
# baseLib — shared utility library
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB BASELIB_SRC "${GM_SRC}/baseLib/*.cpp")
add_library(baseLib STATIC ${BASELIB_SRC})
target_include_directories(baseLib PUBLIC "${GM_SRC}")

# ──────────────────────────────────────────────────────────────────────────────
# synthLib — generic synth device abstraction
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB SYNTHLIB_SRC "${GM_SRC}/synthLib/*.cpp")
add_library(synthLib STATIC ${SYNTHLIB_SRC})
target_include_directories(synthLib PUBLIC "${GM_SRC}")
target_link_libraries(synthLib PUBLIC baseLib dsp56kEmu)

# Generate buildconfig.h for synthLib
configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/src/synthlib_buildconfig.h.in"
    "${CMAKE_BINARY_DIR}/generated/synthLib/buildconfig.h"
)
target_include_directories(synthLib PUBLIC
    "${CMAKE_BINARY_DIR}/generated/synthLib"
    "${CMAKE_BINARY_DIR}/generated"
)

# ──────────────────────────────────────────────────────────────────────────────
# libresample — sample rate conversion
# ──────────────────────────────────────────────────────────────────────────────

set(LIBRESAMPLE_SRC
    "${GM_SRC}/libresample/src/filterkit.c"
    "${GM_SRC}/libresample/src/resample.c"
    "${GM_SRC}/libresample/src/resamplesubs.c"
)
add_library(libresample STATIC ${LIBRESAMPLE_SRC})
target_include_directories(libresample PUBLIC "${GM_SRC}/libresample" "${GM_SRC}")

# ──────────────────────────────────────────────────────────────────────────────
# hardwareLib — shared hardware abstraction
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB HARDWARELIB_SRC "${GM_SRC}/hardwareLib/*.cpp")
add_library(hardwareLib STATIC ${HARDWARELIB_SRC})
target_include_directories(hardwareLib PUBLIC "${GM_SRC}")
target_link_libraries(hardwareLib PUBLIC baseLib synthLib)

# ──────────────────────────────────────────────────────────────────────────────
# mc68k — Motorola 68000 emulator (needed for Virus TI / OsTIrus)
# ──────────────────────────────────────────────────────────────────────────────

set(MC68K_SRC
    "${GM_SRC}/mc68k/mc68k.cpp"
    "${GM_SRC}/mc68k/sim.cpp"
    "${GM_SRC}/mc68k/qsm.cpp"
    "${GM_SRC}/mc68k/qspi.cpp"
    "${GM_SRC}/mc68k/logging.cpp"
    "${GM_SRC}/mc68k/gpt.cpp"
    "${GM_SRC}/mc68k/port.cpp"
    "${GM_SRC}/mc68k/peripheralBase.cpp"
    "${GM_SRC}/mc68k/Musashi/m68kcpu.c"
    "${GM_SRC}/mc68k/Musashi/m68kdasm.c"
    "${GM_SRC}/mc68k/Musashi/m68kfpu.c"
    "${GM_SRC}/mc68k/Musashi/m68kops.c"
    "${GM_SRC}/mc68k/Musashi/softfloat/softfloat.c"
)
add_library(mc68k STATIC ${MC68K_SRC})
target_include_directories(mc68k PUBLIC "${GM_SRC}/mc68k" "${GM_SRC}")

# ──────────────────────────────────────────────────────────────────────────────
# virusLib — Access Virus A/B/C/TI implementation
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB VIRUSLIB_SRC "${GM_SRC}/virusLib/*.cpp")
add_library(virusLib STATIC ${VIRUSLIB_SRC})
target_include_directories(virusLib PUBLIC "${GM_SRC}")
target_link_libraries(virusLib PUBLIC synthLib hardwareLib mc68k)
if(EMSCRIPTEN)
    # Pre-boot snapshot: skip 20+ min DSP boot, load memory dump directly
    target_compile_definitions(virusLib PRIVATE GM_USE_SNAPSHOT=1)
    target_include_directories(virusLib PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
endif()

# ──────────────────────────────────────────────────────────────────────────────
# wLib — shared Waldorf library
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB WLIB_SRC "${GM_SRC}/wLib/*.cpp")
add_library(wLib STATIC ${WLIB_SRC})
target_include_directories(wLib PUBLIC "${GM_SRC}")
target_link_libraries(wLib PUBLIC synthLib hardwareLib)

# ──────────────────────────────────────────────────────────────────────────────
# mqLib — Waldorf microQ
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB MQLIB_SRC "${GM_SRC}/mqLib/*.cpp")
add_library(mqLib STATIC ${MQLIB_SRC})
target_include_directories(mqLib PUBLIC "${GM_SRC}")
target_link_libraries(mqLib PUBLIC wLib)

# ──────────────────────────────────────────────────────────────────────────────
# xtLib — Waldorf Microwave II/XT
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB XTLIB_SRC "${GM_SRC}/xtLib/*.cpp")
add_library(xtLib STATIC ${XTLIB_SRC})
target_include_directories(xtLib PUBLIC "${GM_SRC}")
target_link_libraries(xtLib PUBLIC wLib)

# ──────────────────────────────────────────────────────────────────────────────
# nord — Clavia Nord Lead 2x (n2xLib)
# ──────────────────────────────────────────────────────────────────────────────

file(GLOB NORD_SRC "${GM_SRC}/nord/n2x/n2xLib/*.cpp")
add_library(nordLib STATIC ${NORD_SRC})
target_include_directories(nordLib PUBLIC "${GM_SRC}" "${GM_SRC}/nord/n2x/n2xLib/..")
target_link_libraries(nordLib PUBLIC synthLib hardwareLib dsp56kEmu)

# ──────────────────────────────────────────────────────────────────────────────
# rLib — Roland common library (needed by jeLib)
# ──────────────────────────────────────────────────────────────────────────────

# JE-8086 (Roland JP-8000) excluded from WASM — ESP JIT has no interpreter fallback
if(NOT EMSCRIPTEN)
    add_library(rLib STATIC "${GM_SRC}/ronaldo/common/storage.cpp")
    target_include_directories(rLib PUBLIC "${GM_SRC}/ronaldo/common/.." "${GM_SRC}")

    # ──────────────────────────────────────────────────────────────────────────────
    # esp — Roland ESP DSP (JIT-only, not available on WASM)
    # ──────────────────────────────────────────────────────────────────────────────

    file(GLOB ESP_SRC "${GM_SRC}/ronaldo/esp/*.cpp")
    add_library(esp STATIC ${ESP_SRC})
    target_include_directories(esp PUBLIC "${GM_SRC}/ronaldo/esp/.." "${GM_SRC}")
    target_link_libraries(esp PUBLIC asmjit)

    # ──────────────────────────────────────────────────────────────────────────────
    # ronaldo — Roland JP-8000 (JE-8086 / jeLib)
    # ──────────────────────────────────────────────────────────────────────────────

    file(GLOB RONALDO_SRC "${GM_SRC}/ronaldo/je8086/jeLib/*.cpp")
    add_library(ronaldoLib STATIC ${RONALDO_SRC})
    target_include_directories(ronaldoLib PUBLIC "${GM_SRC}" "${GM_SRC}/ronaldo/je8086/jeLib/..")
    target_link_libraries(ronaldoLib PUBLIC synthLib hardwareLib rLib esp)
endif()

# ──────────────────────────────────────────────────────────────────────────────
# WASM Bridge — our entry point
# ──────────────────────────────────────────────────────────────────────────────

add_executable(gearmulator_wasm src/gearmulator_bridge.cpp)

if(EMSCRIPTEN)
    # Build Virus only for now — other synths with mc68k have duplicate symbol conflicts
    # (each synth defines global m68k_read/write callbacks for Musashi, can't coexist in one binary)
    target_link_libraries(gearmulator_wasm PRIVATE
        virusLib
        synthLib hardwareLib baseLib dsp56kEmu dsp56kBase
        mc68k asmjit libresample
    )
    target_compile_definitions(gearmulator_wasm PRIVATE
        GM_NO_JP8000=1
        GM_NO_WALDORF_MQ=1
        GM_NO_WALDORF_XT=1
        GM_NO_NORD=1
    )
else()
    target_link_libraries(gearmulator_wasm PRIVATE
        virusLib mqLib xtLib nordLib ronaldoLib
        synthLib hardwareLib baseLib dsp56kEmu dsp56kBase
        mc68k rLib esp asmjit libresample
    )
endif()

if(EMSCRIPTEN)
    set_target_properties(gearmulator_wasm PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "\
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createGearmulator' \
            -s EXPORTED_FUNCTIONS='[\"_gm_create\",\"_gm_destroy\",\"_gm_process\",\"_gm_sendMidi\",\"_gm_sendSysex\",\"_gm_getSamplerate\",\"_gm_isValid\",\"_gm_getState\",\"_gm_setState\",\"_gm_setDspClockPercent\",\"_gm_getDspClockHz\",\"_malloc\",\"_free\"]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPF32\",\"HEAP8\",\"HEAPU8\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=67108864 \
            -s MAXIMUM_MEMORY=268435456 \
            -s PTHREAD_POOL_SIZE=4 \
            -s WASM=1 \
            -pthread \
            --no-entry \
        "
    )
endif()
