cmake_minimum_required(VERSION 3.13)
project(HippelST C CXX)
# Jochen Hippel ST player (transpiled, src/hippelst_play.c) + the Furnace YM2149 core.
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(RUNTIME ${CMAKE_SOURCE_DIR}/../tools/asm68k-to-c/runtime)

add_executable(HippelST
  src/hippelst_api.c
  ${RUNTIME}/paula_soft.c
)
target_include_directories(HippelST PRIVATE src ${RUNTIME})
set_target_properties(HippelST PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/hippelst")
target_compile_options(HippelST PRIVATE -O2 -Wno-unused-label -Wno-unused-function -Wno-unused-variable)
set(EXPORTS "_malloc,_free,_hst_load,_hst_start,_hst_tick,_hst_regs,_hst_run,_hst_song_ends,_hst_first_end,_hst_state")
target_link_options(HippelST PRIVATE
  "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME=createHippelST"
  "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTS}]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[cwrap,ccall,HEAPU8]"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s MAXIMUM_MEMORY=8388608" "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=65536" "SHELL:-s ENVIRONMENT=web,worker,node"
  "SHELL:-s FILESYSTEM=0" -O2 --no-entry)
