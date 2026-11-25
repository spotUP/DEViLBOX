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

# Newer emcc defines only __EMSCRIPTEN__; the webixs sources test EMSCRIPTEN. Don't define LINUX (it has file I/O paths)
target_compile_definitions(Ixalance PRIVATE
    _WASM
    EMSCRIPTEN
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

# IxalanceEdit: node + web module for the editor. Same replayer plus ixs_grid.cpp
# (grid decode, edit save, row log probe). Loaded by src/engine/ixalance/ixalanceEditWasm.ts.
add_executable(IxalanceEdit
    src/ixs_grid.cpp
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
target_include_directories(IxalanceEdit PRIVATE src)
target_compile_definitions(IxalanceEdit PRIVATE _WASM EMSCRIPTEN)
target_compile_options(IxalanceEdit PRIVATE -O2 -Wno-deprecated -fno-strict-aliasing -Wno-unused-parameter -sUSE_ZLIB=1)
set_target_properties(IxalanceEdit PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    SUFFIX ".js"
)
target_link_options(IxalanceEdit PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s EXPORT_NAME='createIxalanceEdit'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_ixalance_init','_ixalance_stop','_ixalance_render','_ixs_grid_open','_ixs_grid_close','_ixs_grid_channels','_ixs_grid_order_length','_ixs_grid_order','_ixs_grid_pattern_count','_ixs_grid_pattern_rows','_ixs_grid_pattern','_ixs_edit_set','_ixs_edit_save','_ixs_edit_saved_ptr','_ixs_rowlog_enable','_ixs_rowlog_count','_ixs_rowlog_record_size','_ixs_rowlog_ptr']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['HEAPU8','HEAP32','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT='web,worker,node'"
    "SHELL:-s INVOKE_RUN=0"
    "SHELL:-s USE_ZLIB=1"
)
