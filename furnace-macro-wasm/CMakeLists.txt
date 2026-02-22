cmake_minimum_required(VERSION 3.13)
project(FurnaceMacro C)

set(CMAKE_C_STANDARD 11)

set(SOURCES
    src/furnace_macro.c
    ../hwui-common/src/hwui_common.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/furnace")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FurnaceMacro ${SOURCES})

target_include_directories(FurnaceMacro PRIVATE
    src
    ../hwui-common/src
)

set_target_properties(FurnaceMacro PROPERTIES
    OUTPUT_NAME "FurnaceMacro"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(FurnaceMacro PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
)

target_link_options(FurnaceMacro PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFurnaceMacro'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_furnace_macro_init','_furnace_macro_start','_furnace_macro_shutdown','_furnace_macro_load_config','_furnace_macro_dump_config','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
)
