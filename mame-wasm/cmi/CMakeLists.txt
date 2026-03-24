cmake_minimum_required(VERSION 3.10)
# Fairlight CMI-01A Channel Controller WASM Build
# Based on MAME's CMI-01A emulator by Phil Bennett
# Standalone version without MAME framework dependencies
#
# The CMI-01A is the sound generation card from the Fairlight CMI IIx.
# Each card has 16KB wave RAM, cascaded SSM2045 filters, 8-bit envelope.
# Filter coefficients calibrated from CMI Mainframe Service Manual page 133.

set(CMI_SOURCES
    CMISynth.cpp
)

add_executable(CMI_WASM ${CMI_SOURCES})

target_include_directories(CMI_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${CMI_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(CMI_WASM PROPERTIES
    OUTPUT_NAME "CMI"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(CMI_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createCMIModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
