cmake_minimum_required(VERSION 3.13)
project(FurnaceFM C)

set(CMAKE_C_STANDARD 11)

set(SOURCES
    src/furnace_fm.c
    ../hwui-common/src/hwui_common.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/furnace")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FurnaceFM ${SOURCES})

target_include_directories(FurnaceFM PRIVATE
    src
    ../hwui-common/src
)

set_target_properties(FurnaceFM PROPERTIES
    OUTPUT_NAME "FurnaceFM"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(FurnaceFM PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
)

target_link_options(FurnaceFM PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFurnaceFM'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_furnace_fm_init','_furnace_fm_start','_furnace_fm_shutdown','_furnace_fm_load_config','_furnace_fm_dump_config','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
)
