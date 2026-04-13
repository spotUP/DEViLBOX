cmake_minimum_required(VERSION 3.20)
project(FurnaceFileOps VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Must build with Emscripten: emcmake cmake ..")
endif()

# Furnace source tree location
set(FURNACE_ROOT "${CMAKE_SOURCE_DIR}/../third-party/furnace-master")
set(FURNACE_SRC "${FURNACE_ROOT}/src")
set(FURNACE_ENGINE "${FURNACE_SRC}/engine")
set(FURNACE_EXTERN "${FURNACE_ROOT}/extern")

# ============================================================
# zlib (from Furnace extern)
# ============================================================
set(ZLIB_SOURCES
  ${FURNACE_EXTERN}/zlib/adler32.c
  ${FURNACE_EXTERN}/zlib/compress.c
  ${FURNACE_EXTERN}/zlib/crc32.c
  ${FURNACE_EXTERN}/zlib/deflate.c
  ${FURNACE_EXTERN}/zlib/gzclose.c
  ${FURNACE_EXTERN}/zlib/gzlib.c
  ${FURNACE_EXTERN}/zlib/gzread.c
  ${FURNACE_EXTERN}/zlib/gzwrite.c
  ${FURNACE_EXTERN}/zlib/infback.c
  ${FURNACE_EXTERN}/zlib/inffast.c
  ${FURNACE_EXTERN}/zlib/inflate.c
  ${FURNACE_EXTERN}/zlib/inftrees.c
  ${FURNACE_EXTERN}/zlib/trees.c
  ${FURNACE_EXTERN}/zlib/uncompr.c
  ${FURNACE_EXTERN}/zlib/zutil.c
)

# ============================================================
# Furnace engine sources needed for file ops
# ============================================================
set(FILEOPS_SOURCES
  # File operations
  ${FURNACE_ENGINE}/fileOps/fur.cpp
  ${FURNACE_ENGINE}/fileOps/dmf.cpp
  src/fileOpsCommon_patched.cpp

  # I/O
  ${FURNACE_ENGINE}/safeReader.cpp
  ${FURNACE_ENGINE}/safeWriter.cpp

  # Data structures
  ${FURNACE_ENGINE}/song.cpp
  ${FURNACE_ENGINE}/instrument.cpp
  ${FURNACE_ENGINE}/sample.cpp
  ${FURNACE_ENGINE}/wavetable.cpp
  ${FURNACE_ENGINE}/pattern.cpp
  ${FURNACE_ENGINE}/assetDir.cpp

  # System definitions (getSystemDef, getSystemName, convertOldFlags)
  ${FURNACE_ENGINE}/sysDef.cpp

  # Legacy sample conversion
  ${FURNACE_ENGINE}/legacySample.cpp

  # Config
  ${FURNACE_ENGINE}/config.cpp

  # Macro interpolator (needed by instrument.h → macroInt.h)
  ${FURNACE_ENGINE}/macroInt.cpp

  # blip_buf (needed by dispatch.h)
  ${FURNACE_EXTERN}/blip_buf/blip_buf.c

  # Our stubs and wrapper
  src/FurnaceFileOps.cpp
  stubs/engine_stubs.cpp
  stubs/dispatch_stub.cpp
)

# ============================================================
# Include paths
# ============================================================
include_directories(
  # Our stubs FIRST — override problematic headers (fmt/, sfWrapper.h, ta-log.h)
  ${CMAKE_SOURCE_DIR}/stubs

  # Furnace headers
  ${FURNACE_ENGINE}
  ${FURNACE_ENGINE}/fileOps
  ${FURNACE_ENGINE}/platform
  ${FURNACE_ENGINE}/platform/sound
  ${FURNACE_SRC}

  # External libraries
  ${FURNACE_EXTERN}/zlib
  ${FURNACE_EXTERN}/blip_buf
  ${FURNACE_EXTERN}/adpcm
)

# ============================================================
# Build WASM executable
# ============================================================
add_executable(FurnaceFileOps
  ${ZLIB_SOURCES}
  ${FILEOPS_SOURCES}
)

# Force-include our preempt header to stub ta-log.h, sfWrapper.h, etc.
target_compile_options(FurnaceFileOps PRIVATE
  -include "${CMAKE_SOURCE_DIR}/stubs/fileops_preempt.h"
)

# Enable C++ exception handling (required for NotZlibException catch in load())
target_compile_options(FurnaceFileOps PRIVATE -fexceptions)

# Suppress warnings from Furnace source
target_compile_options(FurnaceFileOps PRIVATE
  -Wno-unused-variable
  -Wno-unused-but-set-variable
  -Wno-sign-compare
  -Wno-missing-field-initializers
  -Wno-deprecated-declarations
  -Wno-unused-parameter
  -Wno-unused-function
  -Wno-implicit-fallthrough
)

# Output configuration
set_target_properties(FurnaceFileOps PROPERTIES
  OUTPUT_NAME "FurnaceFileOps"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/furnace-fileops"
)

# Emscripten link flags
target_link_options(FurnaceFileOps PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createFurnaceFileOps'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_fur_load','_fur_save','_fur_free_buffer','_fur_get_error','_fur_get_num_subsongs','_fur_get_num_channels','_fur_get_num_instruments','_fur_get_num_samples','_fur_get_num_wavetables','_fur_get_pat_len','_fur_get_orders_len','_fur_get_cell','_fur_get_order','_fur_get_effect_cols','_fur_get_system_id','_fur_get_system_len','_fur_get_system_channels','_fur_get_system_flags','_fur_get_song_name','_fur_get_song_author','_fur_get_speed','_fur_get_tempo','_fur_get_hz','_fur_get_virtual_tempo','_fur_get_groove','_fur_get_ins_data','_fur_get_sample_data','_fur_get_sample_info','_fur_get_wave_data','_fur_get_wave_info','_fur_get_channel_name','_fur_set_cell','_fur_get_subsong_name','_fur_get_tuning','_fur_get_packed_compat_flags','_fur_get_speed_len','_fur_get_dispatch_compat_flags','_fur_get_dispatch_compat_flags_size']"
  "SHELL:-s INITIAL_MEMORY=67108864"
  "SHELL:-s STACK_SIZE=2097152"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
  -O2
)
