cmake_minimum_required(VERSION 3.13)
project(SymphonieWasm C)

set(CMAKE_C_STANDARD 11)

# Source files
set(SOURCES
    src/symphonie/symphonie_player.c
    src/symphonie/symphonie_wrapper.c
)

add_executable(Symphonie ${SOURCES})

target_include_directories(Symphonie PRIVATE src/symphonie)

# Output to public/symphonie/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/symphonie")

set_target_properties(Symphonie PROPERTIES
    OUTPUT_NAME "SymphonieWasm"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

# Emscripten flags
target_link_options(Symphonie PRIVATE
    -sWASM=1
    -sMODULARIZE=1
    -sEXPORT_NAME='createSymphonie'
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=16777216
    -sEXPORTED_FUNCTIONS=['_player_init','_player_stop','_player_play','_player_render','_player_is_finished','_player_set_num_channels','_player_set_speed','_player_set_master_volume','_player_set_instrument','_player_set_instrument_sample','_player_set_instrument_loop','_player_set_pattern','_player_set_pattern_note','_player_set_position','_player_set_sequence','_player_get_seq_idx','_player_get_pos_idx','_player_get_row_idx','_player_set_pattern_step','_player_malloc','_player_free','_malloc','_free']
    -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','HEAP16','HEAPU8']
    "-sENVIRONMENT=web,worker"
    --no-entry
    -O2
)
