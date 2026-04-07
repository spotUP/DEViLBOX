cmake_minimum_required(VERSION 3.20)
project(Saturator VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(Saturator SaturatorWASM.cpp)
set_target_properties(Saturator PROPERTIES OUTPUT_NAME "Saturator" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/saturator")
target_link_options(Saturator PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createSaturator'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_saturator_create','_saturator_destroy','_saturator_process','_saturator_set_drive','_saturator_set_blend','_saturator_set_preFreq','_saturator_set_postFreq','_saturator_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
