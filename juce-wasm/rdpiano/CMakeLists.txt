# RdPiano (Roland SA-synthesis Digital Piano) WASM Build
# Based on librdpiano by Giulio Zausa (GPL-3.0)

set(RDPIANO_CXX_SOURCES
    RdPianoSynth.cpp
    mcu.cpp
    sound_chip.cpp
    spaced.cpp
    phaser.cpp
)

set(RDPIANO_C_SOURCES
    resample.c
    resamplesubs.c
    filterkit.c
)

add_executable(RdPianoWASM ${RDPIANO_CXX_SOURCES} ${RDPIANO_C_SOURCES})

target_include_directories(RdPianoWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

target_compile_definitions(RdPianoWASM PRIVATE
    RDPIANO_WASM=1
)

# C++ compile flags
set_source_files_properties(${RDPIANO_CXX_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -fno-exceptions -Wno-constant-logical-operand -Wno-deprecated-declarations"
)

# C compile flags
set_source_files_properties(${RDPIANO_C_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -Wno-unused-variable -Wno-implicit-function-declaration"
)

set_target_properties(RdPianoWASM PROPERTIES
    OUTPUT_NAME "RdPiano"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/rdpiano"
)

target_link_options(RdPianoWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createRdPianoModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s TOTAL_STACK=8388608"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
