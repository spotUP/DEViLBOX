cmake_minimum_required(VERSION 3.13)
project(SynthV1)
set(CMAKE_CXX_STANDARD 17)

file(GLOB SOURCES "src/*.cpp" "common/*.cpp")

add_executable(SynthV1 ${SOURCES})
target_include_directories(SynthV1 PRIVATE src common)
target_compile_options(SynthV1 PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(SynthV1 PROPERTIES OUTPUT_NAME "SynthV1" SUFFIX ".js")

target_link_options(SynthV1 PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSynthV1'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_synthv1_create','_synthv1_destroy','_synthv1_process','_synthv1_note_on','_synthv1_note_off','_synthv1_set_param','_synthv1_get_param','_synthv1_get_num_params','_synthv1_all_notes_off','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','wasmMemory']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s SINGLE_FILE=0"
)
