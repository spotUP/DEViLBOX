cmake_minimum_required(VERSION 3.13)
project(ixalance-wasm C CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_C_STANDARD 99)

set(SRC_DIR "${CMAKE_SOURCE_DIR}/src")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/ixalance")

add_executable(Ixalance
    src/ixalance_harness.cpp
    src/asmEmu.cpp
    src/FileMap.cpp
    src/FileMapSFXI.cpp
    src/FileSFXI.cpp
    src/Mixer1.cpp
    src/Mixer2.cpp
    src/Mixer3.cpp
    src/Mixer4.cpp
    src/MixerBase.cpp
    src/Module.cpp
    src/Packer.cpp
    src/PlayerCore.cpp
    src/PlayerIXS.cpp
    src/WaveGen.cpp
    src/WaveLibrary.c
)

target_include_directories(Ixalance PRIVATE src)

# EMSCRIPTEN is auto-defined by emcc; don't define LINUX (it has file I/O paths)
target_compile_definitions(Ixalance PRIVATE
    _WASM
)

target_compile_options(Ixalance PRIVATE
    -O2
    -Wno-deprecated
    -fno-strict-aliasing
    -Wno-unused-parameter
)

set_target_properties(Ixalance PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    SUFFIX ".js"
)

target_link_options(Ixalance PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createIxalance'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_ixalance_init','_ixalance_stop','_ixalance_render','_ixalance_get_sample_rate','_ixalance_set_channel_gain','_ixalance_get_channel_gain']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','HEAPU8','wasmMemory']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s USE_ZLIB=1"
)
