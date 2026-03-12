cmake_minimum_required(VERSION 3.16)
project(cpsycle-wasm C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/cpsycle")

# For Emscripten, USE_ZLIB=1 provides zlib as a port.
# Create a ZLIB::ZLIB imported target so the sub-project's find_package succeeds.
if(EMSCRIPTEN)
    add_library(ZLIB::ZLIB INTERFACE IMPORTED)
    set_target_properties(ZLIB::ZLIB PROPERTIES
        INTERFACE_COMPILE_OPTIONS "-sUSE_ZLIB=1"
        INTERFACE_LINK_OPTIONS "-sUSE_ZLIB=1"
    )
    set(ZLIB_FOUND TRUE)
    set(ZLIB_LIBRARIES "")
    set(ZLIB_INCLUDE_DIRS "")
endif()

# Build cpsycle static libraries
add_subdirectory(cpsycle-lib ${CMAKE_CURRENT_BINARY_DIR}/cpsycle-build EXCLUDE_FROM_ALL)

# Suppress warnings for cpsycle C code
if(CMAKE_C_COMPILER_ID MATCHES "Clang")
    set(CPSYCLE_EXTRA_C_FLAGS
        -Wno-incompatible-function-pointer-types
        -Wno-int-conversion
        -Wno-implicit-function-declaration
        -w
    )
endif()

foreach(tgt cpsycle_container cpsycle_file cpsycle_thread cpsycle_dsp cpsycle_audio)
    if(TARGET ${tgt})
        target_compile_options(${tgt} PRIVATE ${CPSYCLE_EXTRA_C_FLAGS})
        set_target_properties(${tgt} PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED ON)
    endif()
endforeach()

# Build harness
add_executable(Cpsycle
    cpsycle_harness.c
    cpsycle_stubs.c
)

target_link_libraries(Cpsycle PRIVATE
    cpsycle_audio
    cpsycle_dsp
    cpsycle_file
    cpsycle_thread
    cpsycle_container
)

target_compile_options(Cpsycle PRIVATE
    -O2
    -w
)

set_target_properties(Cpsycle PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    SUFFIX ".js"
    C_STANDARD 11
)

target_link_options(Cpsycle PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createCpsycle'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_cpsycle_init','_cpsycle_stop','_cpsycle_render','_cpsycle_get_sample_rate']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','HEAPU8','wasmMemory']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s USE_ZLIB=1"
)
