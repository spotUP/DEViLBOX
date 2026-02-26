cmake_minimum_required(VERSION 3.13)
project(RobHubbard C)

set(CMAKE_C_STANDARD 99)

# Source files
set(SOURCES
    src/robhubbard_synth.c
)

# Output name
set(OUTPUT_NAME "RobHubbard")

# Output to public/robhubbard/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/robhubbard")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE include)

# Math library (for sinf, powf)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_rh_init"
        "_rh_dispose"
        "_rh_create_player"
        "_rh_destroy_player"
        "_rh_load_instrument"
        "_rh_note_on"
        "_rh_note_off"
        "_rh_render"
        "_rh_set_param"
        "_rh_get_param"
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
        "SHELL:-s EXPORT_NAME='createRobHubbard'"
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
