cmake_minimum_required(VERSION 3.20)
project(BassEnhancer VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(BassEnhancer BassEnhancerWASM.cpp)
set_target_properties(BassEnhancer PROPERTIES OUTPUT_NAME "BassEnhancer" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/bass-enhancer")
target_link_options(BassEnhancer PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createBassEnhancer'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_bass_enhancer_create','_bass_enhancer_destroy','_bass_enhancer_process','_bass_enhancer_set_frequency','_bass_enhancer_set_amount','_bass_enhancer_set_drive','_bass_enhancer_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
