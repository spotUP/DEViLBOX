cmake_minimum_required(VERSION 3.20)
project(TransientDesigner VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(TransientDesigner TransientDesignerWASM.cpp)
set_target_properties(TransientDesigner PROPERTIES OUTPUT_NAME "TransientDesigner" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/transient-designer")
target_link_options(TransientDesigner PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createTransientDesigner'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_transient_designer_create','_transient_designer_destroy','_transient_designer_process','_transient_designer_set_attack','_transient_designer_set_sustain','_transient_designer_set_output']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
