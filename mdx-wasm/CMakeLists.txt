cmake_minimum_required(VERSION 3.10)
project(mdx-wasm C)

set(CMAKE_C_STANDARD 11)

# mdxmini source directory (clone mdxmini here)
set(MDX_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/mdxmini/src)

file(GLOB MDX_SOURCES
  ${MDX_SRC_DIR}/*.c
  ${MDX_SRC_DIR}/*.h
)

set(BRIDGE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/src/mdx_bridge.c)

add_executable(MDX ${MDX_SOURCES} ${BRIDGE_SRC})

target_include_directories(MDX PRIVATE
  ${MDX_SRC_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/src/mdxmini
)

set_target_properties(MDX PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../public/mdx
)

target_link_options(MDX PRIVATE
  -s MODULARIZE=1
  -s EXPORT_NAME='createMDX'
  -s EXPORTED_FUNCTIONS='[
    "_mdx_bridge_open",
    "_mdx_bridge_close",
    "_mdx_bridge_calc",
    "_mdx_bridge_get_title",
    "_mdx_bridge_get_length",
    "_mdx_bridge_get_pos",
    "_mdx_bridge_set_pos",
    "_mdx_bridge_track_ended",
    "_malloc",
    "_free"
  ]'
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","UTF8ToString","HEAPU8","HEAP16"]'
  -s ALLOW_MEMORY_GROWTH=1
  -s INITIAL_MEMORY=4194304
  -s ENVIRONMENT='web,worker'
  -s NO_EXIT_RUNTIME=1
  -s FILESYSTEM=0
  -O2
)
