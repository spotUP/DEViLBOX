cmake_minimum_required(VERSION 3.16)
project(V2Synth)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCES
    src/v2synth_wasm.cpp
    src/synth_core.cpp
    src/sounddef.cpp
)

# Emscripten-specific settings
if(EMSCRIPTEN)
    add_executable(V2Synth ${SOURCES})
    
    # Emscripten compile flags
    target_compile_options(V2Synth PRIVATE
        -O2
        -fno-exceptions
        -fno-rtti
        -DWASM_BUILD
        -Wno-deprecated-declarations
    )
    
    # Remove __stdcall for WASM
    target_compile_definitions(V2Synth PRIVATE
        __stdcall=
    )
    
    # Emscripten link flags
    set_target_properties(V2Synth PROPERTIES
        LINK_FLAGS "\
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createV2Synth' \
            -s EXPORTED_FUNCTIONS='[\
                \"_v2synth_get_size\",\
                \"_v2synth_init\",\
                \"_v2synth_shutdown\",\
                \"_v2synth_load_patch\",\
                \"_v2synth_set_globals\",\
                \"_v2synth_note_on\",\
                \"_v2synth_note_off\",\
                \"_v2synth_control_change\",\
                \"_v2synth_pitch_bend\",\
                \"_v2synth_program_change\",\
                \"_v2synth_render\",\
                \"_v2synth_get_channel_vu\",\
                \"_v2synth_get_master_vu\",\
                \"_v2synth_set_vu_mode\",\
                \"_v2synth_alloc\",\
                \"_v2synth_free\",\
                \"_malloc\",\
                \"_free\"\
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAPU8\",\"HEAPF32\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=16777216 \
            -s MAXIMUM_MEMORY=134217728 \
            -s ENVIRONMENT='web,worker' \
            -s SINGLE_FILE=0 \
            -s WASM=1 \
            -s NO_EXIT_RUNTIME=1 \
            -O2 \
        "
        SUFFIX ".js"
    )
endif()
