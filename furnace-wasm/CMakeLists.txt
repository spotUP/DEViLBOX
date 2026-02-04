cmake_minimum_required(VERSION 3.20)
project(FurnaceDispatch VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Must build with Emscripten: emcmake cmake ..")
endif()

# Furnace source tree location
set(FURNACE_ROOT "${CMAKE_SOURCE_DIR}/../Reference Code/furnace-master")
set(FURNACE_SRC "${FURNACE_ROOT}/src")
set(FURNACE_ENGINE "${FURNACE_SRC}/engine")
set(FURNACE_PLATFORM "${FURNACE_ENGINE}/platform")
set(FURNACE_EXTERN "${FURNACE_ROOT}/extern")

# ============================================================
# Platform build options
# ============================================================
option(BUILD_GB      "Build Game Boy dispatch"     ON)
option(BUILD_NES     "Build NES dispatch"           OFF)
option(BUILD_SMS     "Build SMS/PSG dispatch"       OFF)
option(BUILD_AY      "Build AY-3-8910 dispatch"     OFF)
option(BUILD_GENESIS "Build Genesis/OPN2 dispatch"  OFF)
option(BUILD_ARCADE  "Build Arcade/OPM dispatch"    OFF)

# ============================================================
# Common source files
# ============================================================
set(COMMON_SOURCES
  # Our WASM wrapper and engine stub
  common/FurnaceDispatchWrapper.cpp
  common/DivEngineStub.cpp
  common/InstrumentStub.cpp

  # Furnace engine core (actual source files we need)
  ${FURNACE_ENGINE}/macroInt.cpp
  ${FURNACE_ENGINE}/waveSynth.cpp

  # DivDispatch base class default virtual method implementations
  ${FURNACE_PLATFORM}/abstract.cpp

  # blip_buf resampling (used by all dispatches)
  ${FURNACE_EXTERN}/blip_buf/blip_buf.c
)

# ============================================================
# Platform-specific sources
# ============================================================
set(PLATFORM_SOURCES "")

if(BUILD_GB)
  list(APPEND PLATFORM_SOURCES
    ${FURNACE_PLATFORM}/gb.cpp
    ${FURNACE_PLATFORM}/sound/gb/apu.c
    ${FURNACE_PLATFORM}/sound/gb/timing.c
  )
  add_compile_definitions(FURNACE_BUILD_GB)
  message(STATUS "Building: Game Boy dispatch")
endif()

# Future platforms (commented out for now):
# if(BUILD_NES)
#   list(APPEND PLATFORM_SOURCES ${FURNACE_PLATFORM}/nes.cpp ...)
#   add_compile_definitions(FURNACE_BUILD_NES)
# endif()

# ============================================================
# Include paths
# Order matters: our stubs MUST come first (but we use -include
# for the preempt header, so include order is for finding the
# real Furnace headers that we DO want to use)
# ============================================================
include_directories(
  # Furnace engine headers (dispatch.h, chipUtils.h, macroInt.h, etc.)
  ${FURNACE_ENGINE}
  # Furnace platform headers (gb.h, nes.h, etc.)
  ${FURNACE_PLATFORM}
  # Furnace platform sound cores
  ${FURNACE_PLATFORM}/sound
  # Furnace root src (for ta-utils.h, pch.h, fixedQueue.h paths)
  ${FURNACE_SRC}
  # blip_buf
  ${FURNACE_EXTERN}/blip_buf
  # Our common headers
  ${CMAKE_SOURCE_DIR}/common
)

# ============================================================
# Build WASM executable
# ============================================================
add_executable(FurnaceDispatch ${COMMON_SOURCES} ${PLATFORM_SOURCES})

# Force-include our preemptive header before ALL source files
# This defines include guards for headers we stub (engine.h, song.h, etc.)
target_compile_options(FurnaceDispatch PRIVATE
  -include "${CMAKE_SOURCE_DIR}/common/furnace_preempt.h"
)

# Suppress warnings from Furnace source code
target_compile_options(FurnaceDispatch PRIVATE
  -Wno-unused-variable
  -Wno-unused-but-set-variable
  -Wno-sign-compare
  -Wno-missing-field-initializers
)

# Output configuration
set_target_properties(FurnaceDispatch PROPERTIES
  OUTPUT_NAME "FurnaceDispatch"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/furnace-dispatch"
)

# Emscripten link flags
target_link_options(FurnaceDispatch PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createFurnaceDispatch'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_furnace_init','_furnace_dispatch_create','_furnace_dispatch_destroy','_furnace_dispatch_reset','_furnace_dispatch_cmd','_furnace_dispatch_tick','_furnace_dispatch_render','_furnace_dispatch_get_num_channels','_furnace_dispatch_get_osc_needle','_furnace_dispatch_get_osc_data','_furnace_dispatch_mute','_furnace_dispatch_set_compat_flag','_furnace_dispatch_set_tick_rate','_furnace_dispatch_set_tuning','_furnace_dispatch_set_gb_instrument','_furnace_dispatch_set_wavetable','_furnace_dispatch_force_ins','_furnace_dispatch_poke']"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s STACK_SIZE=1048576"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  -O2
)
