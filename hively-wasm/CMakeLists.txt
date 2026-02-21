cmake_minimum_required(VERSION 3.13)
project(Hively C)

set(CMAKE_C_STANDARD 99)

# Source files
set(SOURCES
    common/hvl_replay.c
    common/HivelyWrapper.c
)

# Output name
set(OUTPUT_NAME "Hively")

# Output to public/hively/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/hively")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE common)

# Suppress warnings from original HVL code (uses abs() on int32/long)
target_compile_options(${OUTPUT_NAME} PRIVATE -Wno-absolute-value)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_hively_init"
        "_hively_load_tune"
        "_hively_free_tune"
        "_hively_init_subsong"
        "_hively_decode_frame"
        "_hively_get_frame_samples"
        "_hively_is_song_end"
        "_hively_get_position"
        "_hively_get_row"
        "_hively_get_speed"
        "_hively_get_channels"
        "_hively_get_positions"
        "_hively_get_subsongs"
        "_hively_get_track_length"
        "_hively_get_speed_multiplier"
        "_hively_get_restart"
        "_hively_get_name"
        "_hively_get_mixgain"
        "_hively_get_stereo_mode"
        "_hively_get_version"
        "_hively_get_num_instruments"
        "_hively_get_instrument_name"
        "_hively_get_instrument_data"
        "_hively_get_plist_entry"
        "_hively_get_track_nr"
        "_hively_get_position_data"
        "_hively_get_track_data"
        "_hively_create_player"
        "_hively_destroy_player"
        "_hively_player_set_instrument"
        "_hively_player_note_on"
        "_hively_player_note_off"
        "_hively_player_render"
    )

    # Join exported functions into a comma-separated list
    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createHively'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=4194304"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
