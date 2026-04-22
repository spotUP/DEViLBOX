cmake_minimum_required(VERSION 3.5)

project(demucs-wasm)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Global compiler flags
set(CMAKE_CXX_FLAGS "-Wall -Wextra")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -ffast-math -msimd128 -msse4.2 -flto -fno-exceptions -fno-signed-zeros -fassociative-math -freciprocal-math -fno-math-errno -fno-rounding-math -funsafe-math-optimizations -fno-trapping-math -fno-rtti -DNDEBUG")

set(DEMUCS_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../third-party/demucs.cpp-main")

include_directories(${DEMUCS_ROOT}/vendor/eigen)
include_directories(${DEMUCS_ROOT}/src)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Only Emscripten build target is supported")
endif()

set(COMMON_LINK_FLAGS "-flto -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB -s STACK_SIZE=5MB -s MODULARIZE=1 -s ENVIRONMENT='web,worker'")

# Collect demucs.cpp inference library sources + WASM bridge
file(GLOB DEMUCS_LIB_SOURCES "${DEMUCS_ROOT}/src/*.cpp")
set(BRIDGE_SOURCE "${DEMUCS_ROOT}/src_wasm/demucs.cpp")

add_executable(demucs ${DEMUCS_LIB_SOURCES} ${BRIDGE_SOURCE})

# Include the src_wasm/ headers (model_load.hpp)
target_include_directories(demucs PRIVATE ${DEMUCS_ROOT}/src_wasm)

set_target_properties(demucs PROPERTIES
    LINK_FLAGS "${COMMON_LINK_FLAGS} -s EXPORT_NAME='libdemucs' -s EXPORTED_FUNCTIONS=\"['_malloc', '_free', '_modelInit', '_modelDemixSegment']\" -s EXPORTED_RUNTIME_METHODS=\"['HEAPU8', 'HEAPF32']\""
)

# Copy output to public/demucs/
add_custom_command(TARGET demucs POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        $<TARGET_FILE_DIR:demucs>/demucs.js
        ${CMAKE_CURRENT_SOURCE_DIR}/../public/demucs/demucs.js
    COMMAND ${CMAKE_COMMAND} -E copy
        $<TARGET_FILE_DIR:demucs>/demucs.wasm
        ${CMAKE_CURRENT_SOURCE_DIR}/../public/demucs/demucs.wasm
    COMMENT "Copied demucs WASM artifacts to public/demucs/"
)
