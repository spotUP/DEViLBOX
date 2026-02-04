cmake_minimum_required(VERSION 3.15)
project(CZ101WASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten flags
set(CMAKE_EXECUTABLE_SUFFIX ".js")

add_executable(CZ101
    UPD933Wrapper.cpp
)

# Emscripten options for AudioWorklet compatibility
target_link_options(CZ101 PRIVATE
    -sEXPORT_NAME=CZ101Module
    -sMODULARIZE=1
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=16777216
    -sMAXIMUM_MEMORY=67108864
    -sEXPORTED_FUNCTIONS=["_upd933_create","_upd933_destroy","_upd933_reset","_upd933_write","_upd933_set_cs","_upd933_render","_upd933_get_buffer","_malloc","_free"]
    -sEXPORTED_RUNTIME_METHODS=["ccall","cwrap"]
    -sAUDIO_WORKLET=1
    -sWASM=1
    -O3
)

# Copy to public directory
add_custom_command(TARGET CZ101 POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_BINARY_DIR}/CZ101.wasm
        ${CMAKE_SOURCE_DIR}/../../../../public/cz101/CZ101.wasm
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_BINARY_DIR}/CZ101.js
        ${CMAKE_SOURCE_DIR}/../../../../public/cz101/CZ101.js
)
