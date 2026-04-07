cmake_minimum_required(VERSION 3.20)
project(ZamDelay VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(ZamDelay ZamDelayWASM.cpp)
set_target_properties(ZamDelay PROPERTIES OUTPUT_NAME "ZamDelay" SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/zam-delay")
target_link_options(ZamDelay PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createZamDelay'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_zam_delay_create','_zam_delay_destroy','_zam_delay_process','_zam_delay_set_time','_zam_delay_set_feedback','_zam_delay_set_lpf','_zam_delay_set_hpf','_zam_delay_set_invert','_zam_delay_set_mix']"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2)
