cmake_minimum_required(VERSION 3.13)
project(SonicArranger C)

set(CMAKE_C_STANDARD 99)

set(SOURCES
    src/sonic_arranger_synth.c
)

set(OUTPUT_NAME "SonicArranger")

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sonic-arranger")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE include)

target_link_libraries(${OUTPUT_NAME} m)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_sa_init"
        "_sa_dispose"
        "_sa_create_player"
        "_sa_destroy_player"
        "_sa_load_instrument"
        "_sa_note_on"
        "_sa_note_off"
        "_sa_render"
        "_sa_set_param"
        "_sa_get_param"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSonicArranger'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=8388608"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake cmake ..)")
endif()
