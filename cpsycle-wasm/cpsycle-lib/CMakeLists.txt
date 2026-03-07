# cpsycle - Pure C rewrite of the Psycle tracker audio engine
#
# Builds the audio engine as static libraries for embedding in other projects.
# Only the core playback components are included (no UI, no external plugin loading).
#
# Targets exported:
#   cpsycle_container  - Data structures (list, hashtable, signal)
#   cpsycle_file       - File I/O and compression
#   cpsycle_dsp        - DSP operations, filters, resampling
#   cpsycle_thread     - Threading primitives
#   cpsycle_audio      - Audio engine core (player, sequencer, machines)
#
# Requirements:
#   - C11 compiler
#   - zlib (found via find_package)
#   - pthreads on Unix
#
# Note: Warning suppression is left to the consuming project since compiler
# flag conventions vary (GCC/Clang use -w, MSVC/clang-cl use /w).

cmake_minimum_required(VERSION 3.16)

find_package(ZLIB REQUIRED)

# --- cpsycle_container ---
file(GLOB CONTAINER_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/container/src/*.c")
add_library(cpsycle_container STATIC ${CONTAINER_SOURCES})
target_include_directories(cpsycle_container PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/container/src)
set_target_properties(cpsycle_container PROPERTIES POSITION_INDEPENDENT_CODE ON)

# --- cpsycle_file ---
file(GLOB FILE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/file/src/*.c")
add_library(cpsycle_file STATIC ${FILE_SOURCES})
target_include_directories(cpsycle_file PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/file/src)
target_link_libraries(cpsycle_file PUBLIC cpsycle_container ZLIB::ZLIB)
set_target_properties(cpsycle_file PROPERTIES POSITION_INDEPENDENT_CODE ON)

# --- cpsycle_thread ---
file(GLOB THREAD_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/thread/src/*.c")
add_library(cpsycle_thread STATIC ${THREAD_SOURCES})
target_include_directories(cpsycle_thread PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/thread/src)
set_target_properties(cpsycle_thread PROPERTIES POSITION_INDEPENDENT_CODE ON)

# --- cpsycle_dsp ---
file(GLOB DSP_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/dsp/src/*.c")
if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64|amd64")
    list(FILTER DSP_SOURCES EXCLUDE REGEX ".*-sse2\\.c$")
endif()
add_library(cpsycle_dsp STATIC ${DSP_SOURCES})
target_include_directories(cpsycle_dsp PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/dsp/src)
target_link_libraries(cpsycle_dsp PUBLIC cpsycle_container)
set_target_properties(cpsycle_dsp PROPERTIES POSITION_INDEPENDENT_CODE ON)

# --- cpsycle_audio ---
file(GLOB AUDIO_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/audio/src/*.c")
add_library(cpsycle_audio STATIC ${AUDIO_SOURCES})
target_include_directories(cpsycle_audio PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/audio/src
    ${CMAKE_CURRENT_SOURCE_DIR}/driver
)
target_link_libraries(cpsycle_audio PUBLIC
    cpsycle_dsp
    cpsycle_file
    cpsycle_thread
    cpsycle_container
)
set_target_properties(cpsycle_audio PROPERTIES POSITION_INDEPENDENT_CODE ON)
