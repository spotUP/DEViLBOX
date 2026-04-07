cmake_minimum_required(VERSION 3.20)
project(MultibandComp VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(MultibandComp MultibandCompWASM.cpp)
set_target_properties(MultibandComp PROPERTIES OUTPUT_NAME "MultibandComp" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-comp")
target_link_options(MultibandComp PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createMultibandComp'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_comp_create','_multiband_comp_destroy','_multiband_comp_process','_multiband_comp_set_low_crossover','_multiband_comp_set_high_crossover','_multiband_comp_set_low_threshold','_multiband_comp_set_mid_threshold','_multiband_comp_set_high_threshold','_multiband_comp_set_low_ratio','_multiband_comp_set_mid_ratio','_multiband_comp_set_high_ratio','_multiband_comp_set_low_gain','_multiband_comp_set_mid_gain','_multiband_comp_set_high_gain']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
