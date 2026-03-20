cmake_minimum_required(VERSION 3.13)
project(SteveTurner C)

set(CMAKE_C_STANDARD 99)
set(OUTPUT_NAME "SteveTurner")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/steveturner")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/steveturner/steveturner.c
    src/steveturner/steveturner_wrapper.c
    src/steveturner/paula_soft.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src/steveturner)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
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
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})
    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=33554432
        -sMODULARIZE=1
        -sEXPORT_NAME="createSteveTurner"
        -O2
    )
    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
