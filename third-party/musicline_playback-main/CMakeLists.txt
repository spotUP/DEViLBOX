cmake_minimum_required(VERSION 3.16)
project(musicline VERSION 0.0.1 DESCRIPTION "Musicline playback library" LANGUAGES C CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Define sources for the musicline library (exclude compare/ and uade/ directories)
file(GLOB MUSICLINE_SOURCES
    "musicline/*.cpp"
)

# Define headers
include_directories("musicline")

# Create musicline library
add_library(musicline STATIC ${MUSICLINE_SOURCES})

if (WIN32)
    target_compile_definitions(musicline PRIVATE UNICODE _UNICODE)
endif()

# UADE (Amiga emulator for playback comparison)
add_subdirectory(musicline/uade)

# Player tool
add_subdirectory(musicline/player)
