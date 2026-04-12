cmake_minimum_required(VERSION 3.13)
project(mdxmini-wasm C)

set(CMAKE_C_STANDARD 11)

# Source files
set(SOURCES
    src/mdxmini.c
    src/mdxfile.c
    src/mdxmml_ym2151.c
    src/mdx2151.c
    src/pcm8.c
    src/pdxfile.c
    src/ym2151.c
    src/nlg.c
    src/mdxmini_wasm.c
)

add_executable(Mdxmini ${SOURCES})

target_include_directories(Mdxmini PRIVATE src)

# Emscripten settings
set_target_properties(Mdxmini PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mdxmini"
)

target_compile_options(Mdxmini PRIVATE
    -O2
    -DUSE_MAME_TIMER=0
)

set(EXPORTED_FUNCS "_malloc,_free,_mdxmini_wasm_init,_mdxmini_wasm_load,_mdxmini_wasm_load_pdx,_mdxmini_wasm_render,_mdxmini_wasm_get_length,_mdxmini_wasm_get_tracks,_mdxmini_wasm_get_title,_mdxmini_wasm_stop,_mdxmini_wasm_set_max_loop")

target_link_options(Mdxmini PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createMdxmini"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[cwrap,ccall]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -O2
    --no-entry
)
