cmake_minimum_required(VERSION 3.13)
project(openmpt_soundlib_wasm CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_C_STANDARD 11)

# Path to openmpt source
set(OPENMPT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../third-party/openmpt-master")

# ─── Build flags ────────────────────────────────────────────────────────────
add_compile_definitions(
  LIBOPENMPT_BUILD
  MPT_BUILD_WASM
  ENABLE_TESTS              # This triggers #undef MODPLUG_NO_FILESAVE, enabling Save functions
  NO_PLUGINS         # Skip VST/DMO plugin loading (stubs remain for link)
  NO_DMO             # Skip DirectX DMO effects
  NO_ASSERTS
  MPT_LOG_GLOBAL_LEVEL_STATIC
  MPT_LOG_GLOBAL_LEVEL=0
  # Use bundled minimp3/miniz/stb_vorbis (no external deps)
  MPT_WITH_MINIMP3
  MPT_WITH_MINIZ
  MINIZ_NO_STDIO
  MPT_WITH_STBVORBIS
)

# ─── Include paths ──────────────────────────────────────────────────────────
# Order matters — OpenMPT's headers use includes like "BuildSettings.h"
# that need to resolve from the common/ directory (for openmpt/all/BuildSettings.hpp)
include_directories(
  ${OPENMPT_ROOT}
  ${OPENMPT_ROOT}/src
  ${OPENMPT_ROOT}/common          # BuildSettings.h, BuildSettingsCompiler.h
  ${OPENMPT_ROOT}/src/openmpt/all # So "BuildSettings.h" also resolves via common/
  ${OPENMPT_ROOT}/soundlib
  ${OPENMPT_ROOT}/include
  ${OPENMPT_ROOT}/include/ancient/api  # ancient decompression library (for unarchiver)
  ${OPENMPT_ROOT}/include/ancient/api/ancient  # ancient.hpp direct include from src/
)

# ─── Source files ───────────────────────────────────────────────────────────

# Common
file(GLOB COMMON_SOURCES "${OPENMPT_ROOT}/common/*.cpp")

# Soundlib (core — loaders + save)
file(GLOB SOUNDLIB_SOURCES "${OPENMPT_ROOT}/soundlib/*.cpp")

# Soundlib plugins (needed for link: PlugInterface, PluginManager, etc.)
file(GLOB SOUNDLIB_PLUGIN_SOURCES "${OPENMPT_ROOT}/soundlib/plugins/*.cpp")
file(GLOB SOUNDLIB_DMO_SOURCES "${OPENMPT_ROOT}/soundlib/plugins/dmo/*.cpp")

# SoundDSP
file(GLOB SOUNDDSP_SOURCES "${OPENMPT_ROOT}/sounddsp/*.cpp")

# Unarchiver (for compressed modules)
file(GLOB UNARCHIVER_SOURCES "${OPENMPT_ROOT}/unarchiver/*.cpp")

# Bundled libraries
set(BUNDLED_C_SOURCES
  ${OPENMPT_ROOT}/include/miniz/miniz.c
  ${OPENMPT_ROOT}/include/minimp3/minimp3.c
  ${OPENMPT_ROOT}/include/stb_vorbis/stb_vorbis.c
)

# Our bridge
set(BRIDGE_SOURCES
  ${CMAKE_CURRENT_SOURCE_DIR}/src/openmpt_soundlib_bridge.cpp
)

# Collect all sources
set(ALL_SOURCES
  ${COMMON_SOURCES}
  ${SOUNDLIB_SOURCES}
  ${SOUNDLIB_PLUGIN_SOURCES}
  ${SOUNDLIB_DMO_SOURCES}
  ${SOUNDDSP_SOURCES}
  ${UNARCHIVER_SOURCES}
  ${BUNDLED_C_SOURCES}
  ${BRIDGE_SOURCES}
)

# Remove files that need external libraries we don't have
list(FILTER ALL_SOURCES EXCLUDE REGEX "Load_mid\\.cpp")   # MIDI needs extra deps

# Ancient decompression library (needed for MO3 support)
file(GLOB ANCIENT_SOURCES "${OPENMPT_ROOT}/include/ancient/src/*.cpp")
file(GLOB ANCIENT_COMMON_SOURCES "${OPENMPT_ROOT}/include/ancient/src/common/*.cpp")
list(APPEND ALL_SOURCES ${ANCIENT_SOURCES} ${ANCIENT_COMMON_SOURCES})
add_compile_definitions(MPT_WITH_ANCIENT)

add_executable(OpenMPTSoundlib ${ALL_SOURCES})

# ─── Emscripten link options ────────────────────────────────────────────────
target_link_options(OpenMPTSoundlib PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createOpenMPTSoundlib'"
  "SHELL:-s EXPORTED_FUNCTIONS=[\
'_malloc',\
'_free',\
'_osl_load',\
'_osl_destroy',\
'_osl_get_info_json',\
'_osl_get_num_channels',\
'_osl_get_num_patterns',\
'_osl_get_num_orders',\
'_osl_get_num_instruments',\
'_osl_get_num_samples',\
'_osl_get_order_pattern',\
'_osl_get_pattern_num_rows',\
'_osl_get_pattern_data',\
'_osl_set_pattern_cell',\
'_osl_get_instrument_names_json',\
'_osl_get_sample_names_json',\
'_osl_get_sample_info_json',\
'_osl_get_sample_data',\
'_osl_get_sample_data_size',\
'_osl_set_sample_data',\
'_osl_save_mod',\
'_osl_save_xm',\
'_osl_save_it',\
'_osl_save_s3m',\
'_osl_get_save_buffer',\
'_osl_get_save_buffer_size',\
'_osl_free_save_buffer',\
'_osl_create_new',\
'_osl_resize_pattern',\
'_osl_add_pattern',\
'_osl_set_order',\
'_osl_set_initial_speed',\
'_osl_set_initial_tempo'\
]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','HEAPU8','HEAP32','HEAPF32']"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=33554432"
  "SHELL:-s STACK_SIZE=1048576"
  "SHELL:-s NO_FILESYSTEM=0"
  "SHELL:-s ENVIRONMENT='web,worker'"
  -O2
  --no-entry
)

set_target_properties(OpenMPTSoundlib PROPERTIES
  OUTPUT_NAME "OpenMPTSoundlib"
  SUFFIX ".js"
)
