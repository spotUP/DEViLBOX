cmake_minimum_required(VERSION 3.13)
project(Ma C)

set(CMAKE_C_STANDARD 11)
set(OUTPUT_NAME "Ma")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/ma")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/ma_harness.c
    src/ma/music_assembler.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src/ma src)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_render" "_player_stop" "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration" "_player_set_channel_gain"
        "_ma_get_num_tracks" "_ma_get_track_length" "_ma_get_cell" "_ma_set_cell"
        "_ma_note_on_preview" "_ma_note_off_preview" "_ma_render_preview_buf"
        "_ma_get_instrument_count"
        "_ma_get_instrument_param" "_ma_set_instrument_param"
        "_ma_save" "_ma_save_ptr" "_ma_save_free"
    )
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})
    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMODULARIZE=1
        -sEXPORT_NAME="createMa"
        -O2
    )
    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
