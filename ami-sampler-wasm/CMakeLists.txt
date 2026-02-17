cmake_minimum_required(VERSION 3.13)
project(AmiSamplerWASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/ami-sampler")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(AmiSampler AmiSamplerWASM.cpp)

target_compile_options(AmiSampler PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(AmiSampler PROPERTIES
  OUTPUT_NAME "AmiSampler"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(AmiSampler PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createAmiSampler'"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_ami_create','_ami_destroy','_ami_load_sample','_ami_resample','_ami_apply_8bit','_ami_apply_snh','_ami_set_model','_ami_set_led','_ami_apply_filters','_ami_process_full','_ami_get_output_ptr','_ami_get_output_length','_ami_get_output_rate']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32']"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:--no-entry"
)
