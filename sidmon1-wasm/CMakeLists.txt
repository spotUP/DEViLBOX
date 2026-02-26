cmake_minimum_required(VERSION 3.13)
project(SidMon1 C)

set(CMAKE_C_STANDARD 99)

# Source files
set(SOURCES
    src/sidmon1_synth.c
)

# Output name
set(OUTPUT_NAME "SidMon1")

# Output to build directory (copy to public/sidmon1 manually after build)
set(OUTPUT_DIR "${CMAKE_BINARY_DIR}")

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE include)

# Math library (for sinf, powf)
target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_sm1_init"
        "_sm1_dispose"
        "_sm1_create_player"
        "_sm1_destroy_player"
        "_sm1_load_instrument"
        "_sm1_note_on"
        "_sm1_note_off"
        "_sm1_render"
        "_sm1_set_param"
        "_sm1_get_param"
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
        "SHELL:-s EXPORT_NAME='createSidMon1'"
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
