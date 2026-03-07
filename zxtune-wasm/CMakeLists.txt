cmake_minimum_required(VERSION 3.13)
project(Zxtune C)

set(CMAKE_C_STANDARD 99)

# Source files
set(SOURCES
    src/ayumi.c
    src/zxtune_wrapper.c
)

# Output name
set(OUTPUT_NAME "Zxtune")

# Output to public/zxtune/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/zxtune")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE src)

# Suppress some warnings
target_compile_options(${OUTPUT_NAME} PRIVATE -Wno-unused-function)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_zxtune_init"
        "_zxtune_render"
        "_zxtune_stop"
        "_player_set_subsong"
        "_player_set_channel_gain"
        "_player_set_sample_rate"
    )

    # Join exported functions into a comma-separated list
    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createZxtune'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
