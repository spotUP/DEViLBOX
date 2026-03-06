cmake_minimum_required(VERSION 3.13)
project(JamCracker C)

set(CMAKE_C_STANDARD 11)

add_executable(JamCracker src/jc_harness.c src/paula_soft.c)
target_include_directories(JamCracker PRIVATE src)

# Emscripten settings
if(EMSCRIPTEN)
  set_target_properties(JamCracker PROPERTIES
    OUTPUT_NAME "JamCracker"
    SUFFIX ".js"
  )
  target_link_options(JamCracker PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createJamCracker'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_jc_init','_jc_render','_jc_stop','_jc_get_song_pos','_jc_get_row','_jc_get_speed','_jc_get_tick','_jc_get_song_length','_jc_get_num_patterns','_jc_get_num_instruments','_jc_get_sample_rate','_jc_get_pattern_rows','_jc_get_pattern_cell','_jc_set_pattern_cell','_jc_get_song_entry','_jc_note_on','_jc_note_off','_jc_render_preview','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
