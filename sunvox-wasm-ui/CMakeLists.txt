cmake_minimum_required(VERSION 3.13)
project(SunVoxUI CXX)

set(CMAKE_CXX_STANDARD 11)

set(SOURCES
    src/SunVoxUI.cpp
)

set(OUTPUT_NAME "SunVoxUI")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sunvox")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE
    src
)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_sunvox_ui_create"
        "_sunvox_ui_destroy"
        "_sunvox_ui_set_module"
        "_sunvox_ui_update_values"
        "_sunvox_ui_mouse_event"
        "_sunvox_ui_key_event"
        "_sunvox_ui_tick"
        "_sunvox_ui_get_framebuffer"
        "_sunvox_ui_get_clicked_ctl"
        "_sunvox_ui_get_clicked_value"
        "_sunvox_ui_get_width"
        "_sunvox_ui_get_height"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSunVoxUI'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=4194304"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString','FS']"
        "SHELL:-s FILESYSTEM=1"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
