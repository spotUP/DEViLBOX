cmake_minimum_required(VERSION 3.13)
project(TalNoizeMaker LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

# Collect all Engine source files (mostly headers, one .cpp)
file(GLOB ENGINE_SOURCES
    src/Engine/*.h
    src/Engine/*.cpp
)

# Collect Effects source files
file(GLOB_RECURSE EFFECTS_SOURCES
    src/Effects/*.h
)

# Collect EnvelopeEditor source files
file(GLOB ENVELOPE_SOURCES
    src/EnvelopeEditor/*.h
)

add_executable(TalNoizeMaker
    common/tal_noisemaker_bridge.cpp
    ${ENGINE_SOURCES}
)

target_include_directories(TalNoizeMaker PRIVATE
    src
    src/Engine
    src/Effects
    src/Effects/Chorus
    src/Effects/Delay
    src/Effects/Reverb
    src/EnvelopeEditor
)

target_compile_definitions(TalNoizeMaker PRIVATE
    WASM_BUILD=1
)

# Output to public/tal-noisemaker/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/tal-noisemaker")
set_target_properties(TalNoizeMaker PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    OUTPUT_NAME "TalNoizeMaker"
    SUFFIX ".js"
)

# Emscripten exported functions
set(EXPORTED_FUNCTIONS
    "_tal_nm_create"
    "_tal_nm_destroy"
    "_tal_nm_process"
    "_tal_nm_note_on"
    "_tal_nm_note_off"
    "_tal_nm_all_notes_off"
    "_tal_nm_set_param"
    "_tal_nm_get_param"
    "_tal_nm_pitch_bend"
    "_tal_nm_get_num_params"
    "_tal_nm_set_bpm"
    "_malloc"
    "_free"
)

string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

target_link_options(TalNoizeMaker PRIVATE
    -O2
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createTalNoizeMaker"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,wasmMemory]"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s WASM=1"
    "SHELL:-s NO_EXIT_RUNTIME=1"
)

target_compile_options(TalNoizeMaker PRIVATE -O2 -Wno-writable-strings)
