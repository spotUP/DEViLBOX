cmake_minimum_required(VERSION 3.13)
project(PT2SampEd C)

set(CMAKE_C_STANDARD 11)
set(SOURCES
    src/pt2_sampled.c
    src/pt2_sampler.c
    src/pt2_visuals.c
    src/pt2_textout.c
    src/pt2_bmp.c
    src/pt2_rcfilters.c
    src/pt2_gfx_font.c
    src/pt2_gfx_sampler.c
)
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/pt2")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(PT2SampEd ${SOURCES})
target_include_directories(PT2SampEd PRIVATE src)

set_target_properties(PT2SampEd PROPERTIES
    OUTPUT_NAME "PT2SampEd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(PT2SampEd PRIVATE
    -O2
)

target_link_options(PT2SampEd PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createPT2SampEd'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s EXPORTED_FUNCTIONS=['_pt2_sampled_init','_pt2_sampled_start','_pt2_sampled_shutdown','_pt2_sampled_load_pcm','_pt2_sampled_set_param','_pt2_sampled_get_param','_pt2_sampled_load_config','_pt2_sampled_dump_config','_pt2_sampled_get_fb','_pt2_sampled_on_mouse_down','_pt2_sampled_on_mouse_up','_pt2_sampled_on_mouse_move','_pt2_sampled_on_wheel','_pt2_sampled_on_key_down','_pt2_sampled_tick','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8','HEAP16']"
)
