cmake_minimum_required(VERSION 3.13)
project(Klystrack C)

set(CMAKE_C_STANDARD 99)

# Source files — klystron sound engine + wrapper
set(SOURCES
    common/cyd.c
    common/cydosc.c
    common/cydflt.c
    common/cydfm.c
    common/cydfx.c
    common/cydrvb.c
    common/cydchr.c
    common/cydcrush.c
    common/cydwave.c
    common/cydentry.c
    common/freqs.c
    common/music.c
    common/pack.c
    common/KlysWrapper.c
)

set(OUTPUT_NAME "Klystrack")

# Output to public/klystrack/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/klystrack")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE common)

# Defines for klystron:
#  NOSDL_MIXER    — skip SDL_mixer, call cyd_output_buffer_stereo directly
#  STEREOOUTPUT   — enable stereo panning
#  REDUCESIZE     — suppress warning() macro (uses fprintf)
target_compile_definitions(${OUTPUT_NAME} PRIVATE
    NOSDL_MIXER
    STEREOOUTPUT
)

# Suppress warnings from original C code
target_compile_options(${OUTPUT_NAME} PRIVATE
    -Wno-unused-variable
    -Wno-unused-function
    -Wno-sign-compare
    -Wno-pointer-sign
    -Wno-absolute-value
)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_klys_init"
        "_klys_load_song"
        "_klys_free_song"
        "_klys_decode"
        "_klys_pause"
        "_klys_stop"
        "_klys_get_song_position"
        "_klys_get_pattern_position"
        "_klys_get_song_speed"
        "_klys_get_song_speed2"
        "_klys_get_song_rate"
        "_klys_get_num_channels"
        "_klys_get_song_length"
        "_klys_get_num_instruments"
        "_klys_get_num_patterns"
        "_klys_get_pattern_length"
        "_klys_get_title"
        "_klys_get_instrument_name"
        "_klys_get_loop_point"
        "_klys_get_master_volume"
        "_klys_get_flags"
        "_klys_get_pattern_data"
        "_klys_get_sequence_data"
        "_klys_get_instrument_data"
        "_klys_get_track_status"
        "_klys_is_playing"
        "_klys_set_pattern_step"
        "_klys_set_sequence_entry"
        "_klys_set_instrument_param"
        "_klys_set_instrument_program_step"
        "_klys_save_song"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createKlystrack'"
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
