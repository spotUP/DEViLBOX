cmake_minimum_required(VERSION 3.13)
project(HivelyInsEd C)

set(CMAKE_C_STANDARD 11)

set(SOURCES src/hvl_insed.c)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/hively")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(HivelyInsEd ${SOURCES})

target_include_directories(HivelyInsEd PRIVATE src)

set_target_properties(HivelyInsEd PROPERTIES
    OUTPUT_NAME "HivelyInsEd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(HivelyInsEd PRIVATE
    -O2
    "SHELL:-s USE_SDL=2"
    "SHELL:-s USE_SDL_TTF=2"
    "SHELL:-s USE_SDL_IMAGE=2"
    "SHELL:-s SDL2_IMAGE_FORMATS='[\"png\"]'"
)

target_link_options(HivelyInsEd PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createHivelyInsEd'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s USE_SDL_TTF=2"
    "SHELL:-s USE_SDL_IMAGE=2"
    "SHELL:-s SDL2_IMAGE_FORMATS='[\"png\"]'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_insed_init','_insed_start','_insed_shutdown','_insed_set_param','_insed_get_param','_insed_set_plist_entry','_insed_get_plist_entry','_insed_load_from_buffer','_insed_dump_to_buffer','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8']"
    "SHELL:--embed-file ${CMAKE_SOURCE_DIR}/assets@/assets"
)
