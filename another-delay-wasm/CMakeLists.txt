cmake_minimum_required(VERSION 3.13)
project(AnotherDelayWASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/another-delay")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(AnotherDelay AnotherDelayWASM.cpp)

target_compile_options(AnotherDelay PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(AnotherDelay PROPERTIES
  OUTPUT_NAME "AnotherDelay"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(AnotherDelay PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createAnotherDelay'"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_another_delay_create','_another_delay_destroy','_another_delay_process','_another_delay_set_delay_time','_another_delay_set_feedback','_another_delay_set_lowpass','_another_delay_set_highpass','_another_delay_set_flutter_freq','_another_delay_set_flutter_depth','_another_delay_set_wow_freq','_another_delay_set_wow_depth','_another_delay_set_reverb_enabled','_another_delay_set_room_size','_another_delay_set_damping','_another_delay_set_width','_another_delay_set_gain']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s ALLOW_MEMORY_GROWTH=0"
  "SHELL:-s INITIAL_MEMORY=8388608"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:--no-entry"
)
