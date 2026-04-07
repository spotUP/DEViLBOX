cmake_minimum_required(VERSION 3.20)
project(Expander VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(Expander ExpanderWASM.cpp)
set_target_properties(Expander PROPERTIES OUTPUT_NAME "Expander" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/expander")
target_link_options(Expander PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createExpander'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_expander_create','_expander_destroy','_expander_process','_expander_set_threshold','_expander_set_ratio','_expander_set_attack','_expander_set_release','_expander_set_range','_expander_set_knee']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
