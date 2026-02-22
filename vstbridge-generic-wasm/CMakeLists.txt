cmake_minimum_required(VERSION 3.13)
project(VSTBridgeGeneric C)

set(CMAKE_C_STANDARD 11)

set(SOURCES
    src/vstbridge_generic.c
    ../hwui-common/src/hwui_common.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/vstbridge")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(VSTBridgeGeneric ${SOURCES})

target_include_directories(VSTBridgeGeneric PRIVATE
    src
    ../hwui-common/src
)

set_target_properties(VSTBridgeGeneric PROPERTIES
    OUTPUT_NAME "VSTBridgeGeneric"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(VSTBridgeGeneric PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
)

target_link_options(VSTBridgeGeneric PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createVSTBridgeGeneric'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_vstbridge_generic_init_with_data','_vstbridge_generic_start','_vstbridge_generic_shutdown','_vstbridge_generic_load_config','_vstbridge_generic_dump_config','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
)
