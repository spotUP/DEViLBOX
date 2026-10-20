cmake_minimum_required(VERSION 3.15)
project(Odin2UI LANGUAGES CXX)

set(ODIN2_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
include("${CMAKE_CURRENT_SOURCE_DIR}/Odin2Sources.cmake")

set(BRIDGE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/Odin2UIBridge.cpp")

add_executable(Odin2UI ${ODIN2_ALL_SOURCES} ${BRIDGE_SOURCES})
target_include_directories(Odin2UI PRIVATE ${ODIN2_INCLUDE_DIRS})
target_compile_definitions(Odin2UI PRIVATE ${ODIN2_COMPILE_DEFS})
target_compile_options(Odin2UI PRIVATE ${ODIN2_COMPILE_OPTS})

# ── Linker flags ─────────────────────────────────────────────────────────────
set(EXPORTED_FUNCS
    "_odin2_ui_init"
    "_odin2_ui_init_scaled"
    "_odin2_ui_tick"
    "_odin2_ui_get_fb"
    "_odin2_ui_get_width"
    "_odin2_ui_get_height"
    "_odin2_ui_on_mouse_down"
    "_odin2_ui_on_mouse_up"
    "_odin2_ui_on_mouse_move"
    "_odin2_ui_on_mouse_wheel"
    "_odin2_ui_set_param"
    "_odin2_ui_get_param"
    "_odin2_ui_get_param_count"
    "_odin2_ui_get_program"
    "_odin2_ui_set_program"
    "_odin2_ui_get_program_count"
    "_odin2_ui_shutdown"
    "_malloc"
    "_free"
)

string(REPLACE ";" "," EXPORTED_FUNCS_STR "${EXPORTED_FUNCS}")

target_link_libraries(Odin2UI PRIVATE "${JUCE_LIB}")

set_target_properties(Odin2UI PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/odin2"
    OUTPUT_NAME "Odin2UI"
)

target_link_options(Odin2UI PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOdin2UIModule'"
    "SHELL:-s EXPORTED_FUNCTIONS='[${EXPORTED_FUNCS_STR}]'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"setValue\",\"getValue\"]'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s INITIAL_MEMORY=134217728"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s USE_FREETYPE=1"
    -fexceptions
    -O2
)
