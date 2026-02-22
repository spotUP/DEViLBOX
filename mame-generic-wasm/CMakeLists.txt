cmake_minimum_required(VERSION 3.13)
project(MAMEGeneric C)

set(CMAKE_C_STANDARD 11)

set(SOURCES
    src/mame_generic.c
    ../hwui-common/src/hwui_common.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/mame-generic")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(MAMEGeneric ${SOURCES})

target_include_directories(MAMEGeneric PRIVATE
    src
    ../hwui-common/src
)

set_target_properties(MAMEGeneric PROPERTIES
    OUTPUT_NAME "MAMEGeneric"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(MAMEGeneric PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
)

target_link_options(MAMEGeneric PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMAMEGeneric'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_mame_generic_init_with_data','_mame_generic_start','_mame_generic_shutdown','_mame_generic_load_config','_mame_generic_dump_config','_mame_generic_set_param','_mame_generic_get_param','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
)
