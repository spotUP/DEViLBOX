cmake_minimum_required(VERSION 3.13)
project(SidMon1 C)

set(CMAKE_C_STANDARD 99)

# ── Target 1: SidMon1 synth (instrument preview) ──────────────────────────────

set(SYNTH_NAME "SidMon1")
set(SYNTH_SOURCES src/sidmon1_synth.c)

add_executable(${SYNTH_NAME} ${SYNTH_SOURCES})
target_include_directories(${SYNTH_NAME} PRIVATE include)
target_link_libraries(${SYNTH_NAME} m)

if(EMSCRIPTEN)
    set(SYNTH_EXPORTED
        "_malloc" "_free"
        "_sm1_init" "_sm1_dispose"
        "_sm1_create_player" "_sm1_destroy_player"
        "_sm1_load_instrument"
        "_sm1_note_on" "_sm1_note_off"
        "_sm1_render" "_sm1_set_param" "_sm1_get_param"
    )
    string(JOIN "," SYNTH_EXPORT_STR ${SYNTH_EXPORTED})

    set_target_properties(${SYNTH_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/sidmon1"
        OUTPUT_NAME ${SYNTH_NAME}
        SUFFIX ".js"
    )
    target_link_options(${SYNTH_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSidMon1'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=4194304"
        "SHELL:-s EXPORTED_FUNCTIONS=[${SYNTH_EXPORT_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
endif()

# ── Target 2: SidMon1Replayer (full song playback) ───────────────────────────

set(REPLAYER_NAME "SidMon1Replayer")
set(REPLAYER_OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sidmon1")
file(MAKE_DIRECTORY ${REPLAYER_OUTPUT_DIR})

add_executable(${REPLAYER_NAME}
    src/sidmon1/sidmon1.c
    src/sidmon1/sidmon1_wrapper.c
    src/sidmon1/paula_soft.c
)
target_include_directories(${REPLAYER_NAME} PRIVATE src/sidmon1)
target_link_libraries(${REPLAYER_NAME} m)

if(EMSCRIPTEN)
    set(REPLAYER_EXPORTED
        "_malloc" "_free"
        "_player_init" "_player_load" "_player_render" "_player_stop" "_player_pause" "_player_resume"
        "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration"
        "_player_get_channel_levels" "_player_set_channel_gain"
        "_player_get_num_instruments"
        "_player_get_instrument_param" "_player_set_instrument_param"
        "_player_note_on" "_player_note_off"
    )
    string(JOIN "," REPLAYER_EXPORT_STR ${REPLAYER_EXPORTED})

    set_target_properties(${REPLAYER_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${REPLAYER_OUTPUT_DIR}"
        SUFFIX ".js"
    )
    target_link_options(${REPLAYER_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${REPLAYER_EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMODULARIZE=1
        -sEXPORT_NAME="createSidMon1Replayer"
        -O2
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake cmake ..)")
endif()
