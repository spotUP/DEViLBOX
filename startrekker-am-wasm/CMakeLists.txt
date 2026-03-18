cmake_minimum_required(VERSION 3.15)
project(StartrekkerAM C)

set(OUTPUT_NAME "StartrekkerAM")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/startrekker-am")

add_executable(${OUTPUT_NAME}
    src/startrekker_am.c
    src/startrekker_am_harness.c
    src/paula_soft.c
)

target_include_directories(${OUTPUT_NAME} PRIVATE src)

set_target_properties(${OUTPUT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    SUFFIX ".js"
)

target_link_options(${OUTPUT_NAME} PRIVATE
    "-sEXPORTED_FUNCTIONS=[\"_player_init\",\"_player_load\",\"_player_load_mod\",\"_player_load_nt\",\"_player_render\",\"_player_stop\",\"_player_is_finished\",\"_player_get_subsong_count\",\"_player_set_subsong\",\"_player_get_title\",\"_player_detect_duration\",\"_player_get_channel_levels\",\"_player_get_voice_info\",\"_player_set_nt_param\",\"_player_set_pattern_cell\",\"_paula_set_channel_gain\",\"_malloc\",\"_free\"]"
    "-sEXPORTED_RUNTIME_METHODS=[\"ccall\",\"cwrap\",\"HEAPU8\",\"HEAPF32\"]"
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=33554432
    -sMODULARIZE=1
    -sEXPORT_NAME="createStartrekkerAM"
    -sWASM=1
    -O2
)
