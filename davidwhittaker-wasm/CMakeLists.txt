cmake_minimum_required(VERSION 3.13)
project(DavidWhittaker C)

set(CMAKE_C_STANDARD 99)

# Source files
set(SOURCES
    src/davidwhittaker_synth.c
)

# Output name
set(OUTPUT_NAME "DavidWhittaker")

# Output to public/davidwhittaker/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/davidwhittaker")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE include)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_dw_init"
        "_dw_dispose"
        "_dw_create_player"
        "_dw_destroy_player"
        "_dw_load_instrument"
        "_dw_note_on"
        "_dw_note_off"
        "_dw_render"
        "_dw_set_param"
        "_dw_get_param"
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
        "SHELL:-s EXPORT_NAME='createDavidWhittaker'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=4194304"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake cmake ..)")
endif()
