cmake_minimum_required(VERSION 3.15)
project(sidmon_synth C)

set(CMAKE_C_STANDARD 11)

add_executable(SidMon src/sidmon_synth.c)

target_include_directories(SidMon PRIVATE include)

target_compile_options(SidMon PRIVATE
  -O2
  -ffast-math
)

set_target_properties(SidMon PROPERTIES
  OUTPUT_NAME "SidMon"
  SUFFIX ".js"
)

target_link_options(SidMon PRIVATE
  -sWASM=1
  -sEXPORTED_FUNCTIONS=['_smn_init','_smn_dispose','_smn_create_player','_smn_destroy_player','_smn_load_instrument','_smn_note_on','_smn_note_off','_smn_render','_smn_set_param','_smn_get_param','_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','HEAPF32','HEAPU8']
  -sMODULARIZE=1
  -sEXPORT_NAME='createSidMon'
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=4194304
  -sSINGLE_FILE=0
)

# Copy output to public/sidmon/
add_custom_command(TARGET SidMon POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/../public/sidmon
  COMMAND ${CMAKE_COMMAND} -E copy SidMon.js ${CMAKE_SOURCE_DIR}/../public/sidmon/SidMon.js
  COMMAND ${CMAKE_COMMAND} -E copy SidMon.wasm ${CMAKE_SOURCE_DIR}/../public/sidmon/SidMon.wasm
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
