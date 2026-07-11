cmake_minimum_required(VERSION 3.13)
project(Maxtrax C)

set(CMAKE_C_STANDARD 11)

set(RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../tools/asm68k-to-c/runtime")

add_executable(Maxtrax
    src/maxtrax_harness.c
    ${RUNTIME_DIR}/paula_soft.c
)

target_include_directories(Maxtrax PRIVATE
    src
    src/generated/maxtrax
    ${RUNTIME_DIR}
)

if(EMSCRIPTEN)
    set_target_properties(Maxtrax PROPERTIES
        OUTPUT_NAME "Maxtrax"
        SUFFIX ".js"
    )
    target_link_options(Maxtrax PRIVATE
        "SHELL:-s WASM=1"
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createMaxtrax'"
        "SHELL:-s EXPORTED_FUNCTIONS=['_maxtrax_load','_maxtrax_render','_maxtrax_stop','_maxtrax_get_sample_rate','_maxtrax_get_cmd_count','_maxtrax_get_seed_pool_depth','_maxtrax_get_tick_unit','_maxtrax_get_event_count','_maxtrax_set_event','_maxtrax_recook','_malloc','_free']"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s STACK_SIZE=65536"
        -O2
    )
endif()
