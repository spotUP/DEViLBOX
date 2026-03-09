cmake_minimum_required(VERSION 3.13)
project(Sd2 C)

set(CMAKE_C_STANDARD 11)
set(OUTPUT_NAME "Sd2")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/sidmon2")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/sd2_harness.c
    src/sd2/sidmon2.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src/sd2 src)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_render" "_player_stop" "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration" "_player_set_channel_gain"
        "_sd2_bridge_get_num_tracks" "_sd2_bridge_get_track_length"
        "_sd2_bridge_get_cell" "_sd2_bridge_set_cell"
        "_sd2_note_on" "_sd2_note_off" "_sd2_render_preview"
        "_sd2_save" "_sd2_save_ptr" "_sd2_save_free"
    )
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})
    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMODULARIZE=1
        -sEXPORT_NAME="createSd2"
        -O2
    )
    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
