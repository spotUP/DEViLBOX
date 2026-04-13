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
    -sEXPORTED_FUNCTIONS=['_player_init','_player_stop','_player_play','_player_render','_player_is_finished','_player_set_num_channels','_player_set_speed','_player_set_master_volume','_player_set_instrument','_player_set_instrument_sample','_player_set_instrument_loop','_player_set_pattern','_player_set_pattern_note','_player_set_position','_player_set_sequence','_player_get_seq_idx','_player_get_pos_idx','_player_get_row_idx','_player_set_pattern_step','_sym_set_instrument_param','_player_malloc','_player_free','_malloc','_free','_player_debug_playing','_player_debug_num_channels','_player_debug_num_instruments','_player_debug_num_patterns','_player_debug_num_positions','_player_debug_num_sequences','_player_debug_speed','_player_debug_speed_count','_player_debug_samples_per_tick','_player_debug_tick_accum','_player_debug_voice_status','_player_debug_voice_end_reached','_player_debug_voice_freq','_player_debug_voice_volume','_player_debug_voice_has_sample','_player_debug_voice_has_instrument','_player_debug_inst_type','_player_debug_inst_num_samples','_player_debug_inst_has_data','_player_debug_pat_num_rows','_player_debug_pat_has_data','_player_debug_pat_note']
    -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','HEAP16','HEAPU8','lengthBytesUTF8','stringToUTF8']
    "-sENVIRONMENT=web,worker"
    --no-entry
    -O2
)
