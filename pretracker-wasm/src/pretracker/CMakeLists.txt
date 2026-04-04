# CMakeLists.txt — PreTracker replayer (decompiled from pretracker.bin)
# Build: cd build && emcmake cmake .. && emmake make
cmake_minimum_required(VERSION 3.13)
project(Pretracker C)

set(OUTPUT_NAME "Pretracker")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../../public/pretracker")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    prt_bin.c
    pretracker_wrapper.c
    paula_soft.c
)

target_compile_options(${OUTPUT_NAME} PRIVATE
    -Wno-unused-variable -Wno-unused-label -Wno-unused-function
    -Wno-sometimes-uninitialized -Wno-parentheses
)

target_include_directories(${OUTPUT_NAME} PRIVATE .)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_render" "_player_stop"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration"
        "_player_set_sample_rate" "_player_set_channel_gain"
        "_player_get_channel_levels"
    )
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})
    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','UTF8ToString']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMODULARIZE=1
        -sEXPORT_NAME="createPretracker"
        -O2
    )
    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
