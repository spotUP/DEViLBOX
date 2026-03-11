cmake_minimum_required(VERSION 3.16)
project(TunefishSynth)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Tunefish source
set(TUNEFISH_DIR "${CMAKE_SOURCE_DIR}/../third-party/tunefish/src/tunefish4/Source")

# Runtime sources
set(RUNTIME_SOURCES
    ${TUNEFISH_DIR}/runtime/runtime.cpp
    ${TUNEFISH_DIR}/runtime/array.cpp
    ${TUNEFISH_DIR}/runtime/random.cpp
)

# Synth sources
set(SYNTH_SOURCES
    ${TUNEFISH_DIR}/synth/tf4.cpp
    ${TUNEFISH_DIR}/synth/tf4fx.cpp
)

# WASM wrapper
set(WRAPPER_SOURCES
    src/tunefish_wasm.cpp
)

if(EMSCRIPTEN)
    add_executable(TunefishSynth 
        ${RUNTIME_SOURCES}
        ${SYNTH_SOURCES}
        ${WRAPPER_SOURCES}
    )
    
    # Our WASM-compatible headers (SSE stubs) must come first
    target_include_directories(TunefishSynth PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${TUNEFISH_DIR}/runtime
        ${TUNEFISH_DIR}/synth
    )
    
    target_compile_options(TunefishSynth PRIVATE
        -O2
        -fno-exceptions
        -fno-rtti
        -DWASM_BUILD
        -Wno-deprecated-declarations
        -Wno-unused-value
        -Wno-delete-incomplete
        -include ${CMAKE_SOURCE_DIR}/include/wasm_compat.h
    )
    
    # Note: We do NOT define ePLAYER because it triggers x86 assembly optimizations
    # The standard C fallbacks work fine for WASM
    
    set_target_properties(TunefishSynth PROPERTIES
        LINK_FLAGS "\
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createTunefishSynth' \
            -s EXPORTED_FUNCTIONS='[\
                \"_tunefish_create\",\
                \"_tunefish_destroy\",\
                \"_tunefish_set_param\",\
                \"_tunefish_get_param\",\
                \"_tunefish_note_on\",\
                \"_tunefish_note_off\",\
                \"_tunefish_all_notes_off\",\
                \"_tunefish_pitch_bend\",\
                \"_tunefish_mod_wheel\",\
                \"_tunefish_render\",\
                \"_tunefish_set_sample_rate\",\
                \"_tunefish_get_num_params\",\
                \"_malloc\",\
                \"_free\"\
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"HEAPF32\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=16777216 \
            -s ENVIRONMENT='web,worker' \
            -s SINGLE_FILE=0 \
            -s WASM=1 \
            -s NO_EXIT_RUNTIME=1 \
            -O2 \
        "
        SUFFIX ".js"
    )
endif()
