cmake_minimum_required(VERSION 3.13)
project(Cinter4 C)

set(CMAKE_C_STANDARD 99)
set(OUTPUT_NAME "Cinter4")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/cinter4")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/cinter4/cinter4.c
    src/cinter4/cinter4_wrapper.c
    src/cinter4/paula_soft.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src/cinter4)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_load" "_player_render" "_player_stop"
        "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration"
        "_player_load_raw"
        "_player_get_debug"
        "_player_work_addr" "_player_inst_addr" "_player_music_addr"
        "_paula_scope_ptr" "_paula_scope_len" "_paula_scope_pos"
    )
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})
    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','UTF8ToString','HEAPU8','HEAPF32','HEAP16']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=67108864
        -sMODULARIZE=1
        -sEXPORT_NAME="createCinter4"
        -O2
    )
    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
