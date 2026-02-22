cmake_minimum_required(VERSION 3.13)
project(FT2SampEd C)

set(CMAKE_C_STANDARD 11)
set(SOURCES src/ft2_sampled.c ../hwui-common/src/hwui_common.c)
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/ft2")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FT2SampEd ${SOURCES})
target_include_directories(FT2SampEd PRIVATE src ../hwui-common/src)

set_target_properties(FT2SampEd PROPERTIES
    OUTPUT_NAME "FT2SampEd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(FT2SampEd PRIVATE
    -O2
)

target_link_options(FT2SampEd PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFT2SampEd'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s EXPORTED_FUNCTIONS=['_ft2_sampled_init','_ft2_sampled_start','_ft2_sampled_shutdown','_ft2_sampled_load_pcm','_ft2_sampled_set_param','_ft2_sampled_get_param','_ft2_sampled_set_loop','_ft2_sampled_set_vol_env_point','_ft2_sampled_set_pan_env_point','_ft2_sampled_load_config','_ft2_sampled_dump_config','_ft2_sampled_on_mouse_down','_ft2_sampled_on_mouse_up','_ft2_sampled_on_mouse_move','_ft2_sampled_on_wheel','_ft2_sampled_on_key_down','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8','HEAP16']"
)
