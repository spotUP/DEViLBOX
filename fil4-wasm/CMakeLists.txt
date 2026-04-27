cmake_minimum_required(VERSION 3.20)
project(Fil4 VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_C_STANDARD 99)

# iir.h is header-only — only compile fil4_wasm.cpp (the C++ wrapper)
add_executable(Fil4 src/fil4_wasm.cpp)

set_target_properties(Fil4 PROPERTIES
    OUTPUT_NAME "Fil4"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/fil4"
)

target_include_directories(Fil4 PRIVATE src)

target_link_options(Fil4 PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFil4'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_fil4_create','_fil4_destroy','_fil4_process','_fil4_set_hp','_fil4_set_lp','_fil4_set_shelf','_fil4_set_band','_fil4_set_gain','_fil4_get_magnitude']"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s STACK_SIZE=524288"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s FILESYSTEM=0"
    -O3
)
