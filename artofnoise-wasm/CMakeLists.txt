cmake_minimum_required(VERSION 3.13)
project(ArtOfNoise C)
set(CMAKE_C_STANDARD 11)

set(OUTPUT_NAME "ArtOfNoise")
set(OUTPUT_DIR  "${CMAKE_SOURCE_DIR}/../public/artofnoise")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    src/aon_player.c
    src/aon_wrapper.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc" "_free"
        "_player_init" "_player_load" "_player_render" "_player_stop"
        "_player_set_sample_rate"
        "_player_is_finished" "_player_get_subsong_count" "_player_set_subsong"
        "_player_get_title" "_player_detect_duration"
        "_player_get_channel_levels" "_player_set_channel_gain"
        "_player_get_instrument_count" "_player_get_instrument_param" "_player_set_instrument_param"
    )
    string(JOIN "," EXPORT_STR ${EXPORTED_FUNCTIONS})

    target_link_options(${OUTPUT_NAME} PRIVATE
        -sEXPORTED_FUNCTIONS=[${EXPORT_STR}]
        -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','UTF8ToString']
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=16777216
        -sMODULARIZE=1
        -sEXPORT_NAME="createArtOfNoise"
        -O2
    )

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        SUFFIX ".js"
    )
endif()
