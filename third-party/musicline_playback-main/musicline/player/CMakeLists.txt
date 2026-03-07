# Musicline Player Tool

cmake_minimum_required(VERSION 3.16)

# Build local UADE (NOT system UADE!) - only if not already added by parent
if(NOT TARGET uadecore)
    add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../uade ${CMAKE_CURRENT_BINARY_DIR}/uade)
endif()

# Check if UADE was actually built (it's skipped on MSVC)
if(TARGET uade_full)
    set(HAVE_UADE TRUE)
else()
    set(HAVE_UADE FALSE)
endif()

# Musicline core sources (from parent directory)
set(MUSICLINE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/../arpeggio.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../channel.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../file.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../fx.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../init.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../inst.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../module.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../musicline.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../playinst_256_effects.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../playinst.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../playinst_filter.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../playinst_render.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../playinst_resonance.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../sfx.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../tables.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../target_math.cpp
)

# Source files
set(PLAYER_SOURCES
    main.cpp
    mline_backend.cpp
    audio_output.cpp
    wav_writer.cpp
    miniaudio_impl.cpp
    ${MUSICLINE_SOURCES}
)

# Conditionally include UADE backend
if(HAVE_UADE)
    list(APPEND PLAYER_SOURCES uade_backend.cpp)
endif()

# Create executable
add_executable(mline_play ${PLAYER_SOURCES})

# Include directories
target_include_directories(mline_play PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${CMAKE_CURRENT_SOURCE_DIR}/../../ext
)

# Link UADE if available
if(HAVE_UADE)
    target_link_libraries(mline_play PRIVATE uade_full)
    target_compile_definitions(mline_play PRIVATE HAVE_UADE=1)
endif()

# C++17 for filesystem
target_compile_features(mline_play PRIVATE cxx_std_17)

# Set output directory
set_target_properties(mline_play PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Platform-specific settings
if(UNIX AND NOT APPLE)
    target_link_libraries(mline_play PRIVATE pthread dl m)
endif()

if(HAVE_UADE)
    message(STATUS "mline_play tool configured (with UADE backend)")
else()
    message(STATUS "mline_play tool configured (MLINE only, no UADE)")
endif()
