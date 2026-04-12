cmake_minimum_required(VERSION 3.13)
project(Pretracker C)

set(CMAKE_C_STANDARD 99)
set(OUTPUT_NAME "Pretracker")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/pretracker")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/pretracker_harness.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src/pretracker)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_render" "_player_stop" "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration" "_player_set_channel_gain"
        "_player_get_channel_levels"
        "_player_get_author" "_player_get_num_waves" "_player_get_num_instruments"
        "_player_get_num_positions" "_player_get_num_steps"
        "_player_get_wave_name" "_player_get_instrument_name"
        "_player_get_track_cell" "_player_cell_note" "_player_cell_instrument"
        "_player_cell_has_arpeggio" "_player_cell_effect_cmd" "_player_cell_effect_data"
        "_player_get_position_entry" "_player_pos_track_num" "_player_pos_pitch_shift"
        "_player_get_position" "_player_get_row" "_player_get_speed"
        "_player_get_channel_instrument" "_player_get_channel_volume"
        "_player_get_channel_wave" "_player_get_channel_adsr_phase"
        "_player_set_solo_channel" "_player_set_stereo_mix" "_player_set_interp_mode"
        "_player_get_wave_info" "_player_get_inst_info"
        "_player_set_wave_info" "_player_set_inst_info"
        "_player_get_raw_inst_info" "_player_set_raw_inst_info"
        "_player_get_scope_buffer" "_player_get_scope_buffer_size"
        "_player_set_inst_pattern_step" "_player_set_track_cell" "_player_set_position_entry"
        "_player_get_inst_pattern_steps" "_player_get_inst_pattern_step"
        "_player_get_num_tracks" "_player_get_raw_file_size" "_player_get_raw_file_data"
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
