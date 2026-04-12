cmake_minimum_required(VERSION 3.13)
project(CheeseCutter C CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_C_STANDARD 11)

# reSID sources (shared with GT Ultra)
set(RESID_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../gtultra-wasm/src/resid")
file(GLOB RESID_SRC "${RESID_DIR}/*.cpp")

# Our sources
set(CC_SRC
    src/cpu6502.c
    src/cc_bridge.cpp
)

add_executable(CheeseCutter ${CC_SRC} ${RESID_SRC})

target_include_directories(CheeseCutter PRIVATE
    src
    ${RESID_DIR}/..
    ${RESID_DIR}
)

# reSID needs RESID_INLINING and VERSION defined
target_compile_definitions(CheeseCutter PRIVATE
    RESID_INLINING=1
    VERSION="1.0"
    PACKAGE="resid"
)

# Emscripten flags
set_target_properties(CheeseCutter PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../public/cheesecutter"
)

target_link_options(CheeseCutter PRIVATE
    "-sMODULARIZE=1"
    "-sEXPORT_NAME=createCheeseCutter"
    "-sEXPORTED_FUNCTIONS=['_cc_init','_cc_load','_cc_set_multiplier','_cc_play_init','_cc_render','_cc_get_sid_regs','_cc_shutdown','_malloc','_free']"
    "-sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','setValue','HEAPF32','HEAPU8']"
    "-sALLOW_MEMORY_GROWTH=0"
    "-sINITIAL_MEMORY=4194304"
    "-sENVIRONMENT=web,worker"
    "-sNO_FILESYSTEM=1"
    "-sSINGLE_FILE=0"
    "-O2"
)
