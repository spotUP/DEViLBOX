cmake_minimum_required(VERSION 3.13)
project(pt2_replayer C)

set(CMAKE_C_STANDARD 99)

set(SOURCES
    src/PT2Bridge.c
    src/pt2_replayer.c
    src/pt2_audio.c
    src/pt2_paula.c
    src/pt2_helpers.c
    src/pt2_config.c
    src/pt2_tables.c
    src/pt2_blep.c
    src/pt2_rcfilters.c
    src/pt2_downsample2x.c
    src/pt2_module_loader.c
    src/pt2_module_saver.c
    src/pt2_structs.c
    src/pt2_globals.c
    src/modloaders/pt2_load_mod15.c
    src/modloaders/pt2_load_mod31.c
    src/modloaders/pt2_pp_unpack.c
    src/modloaders/pt2_xpk_unpack.c
)

add_executable(pt2_replayer ${SOURCES})
target_include_directories(pt2_replayer PRIVATE src)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCS
        "_pt2_init"
        "_pt2_load_module"
        "_pt2_render"
        "_pt2_play"
        "_pt2_play_pattern"
        "_pt2_stop"
        "_pt2_set_position"
        "_pt2_get_position"
        "_pt2_get_row"
        "_pt2_get_pattern"
        "_pt2_get_speed"
        "_pt2_get_bpm"
        "_pt2_is_playing"
        "_pt2_get_song_length"
        "_pt2_get_num_channels"
        "_pt2_get_song_name"
        "_pt2_get_order_entry"
        "_pt2_set_order_entry"
        "_pt2_set_song_length"
        "_pt2_get_pattern_cell"
        "_pt2_set_pattern_cell"
        "_pt2_get_pattern_ptr"
        "_pt2_get_num_patterns"
        "_pt2_get_sample_name"
        "_pt2_get_sample_length"
        "_pt2_get_sample_loop_start"
        "_pt2_get_sample_loop_length"
        "_pt2_get_sample_volume"
        "_pt2_get_sample_finetune"
        "_pt2_set_sample_volume"
        "_pt2_set_sample_finetune"
        "_pt2_set_sample_loop_start"
        "_pt2_set_sample_loop_length"
        "_pt2_set_sample_name"
        "_pt2_get_sample_data_ptr"
        "_pt2_set_sample_data"
        "_pt2_get_channel_volume"
        "_pt2_get_channel_period"
        "_pt2_get_channel_sample"
        "_pt2_set_mute"
        "_pt2_get_mute"
        "_pt2_set_stereo_separation"
        "_pt2_set_amiga_model"
        "_pt2_set_led_filter"
        "_pt2_set_oversampling"
        "_pt2_save_module"
        "_pt2_free"
        "_malloc"
        "_free"
    )
    string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCS})

    set_target_properties(pt2_replayer PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "--no-entry"
    )
    target_compile_options(pt2_replayer PRIVATE -O2)
    target_link_options(pt2_replayer PRIVATE
        "-sEXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']"
        "-sMODULARIZE=1"
        "-sEXPORT_NAME='createPT2Replayer'"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sINITIAL_MEMORY=16777216"
        "-sSTACK_SIZE=1048576"
        "-sFILESYSTEM=1"
        "-O2"
    )
endif()
