cmake_minimum_required(VERSION 3.13)
project(FurnacePSG C)

set(CMAKE_C_STANDARD 11)

set(SOURCES
    src/furnace_psg.c
    ../hwui-common/src/hwui_common.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/furnace")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FurnacePSG ${SOURCES})

target_include_directories(FurnacePSG PRIVATE
    src
    ../hwui-common/src
)

set_target_properties(FurnacePSG PROPERTIES
    OUTPUT_NAME "FurnacePSG"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(FurnacePSG PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
)

target_link_options(FurnacePSG PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFurnacePSG'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_furnace_psg_init','_furnace_psg_start','_furnace_psg_shutdown','_furnace_psg_load_config','_furnace_psg_dump_config','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
)
