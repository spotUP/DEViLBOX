cmake_minimum_required(VERSION 3.10)
project(pmd-wasm C)

set(CMAKE_C_STANDARD 11)

# pmdmini source directory (clone pmdmini here)
set(PMD_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/pmdmini/src)

file(GLOB PMD_SOURCES
  ${PMD_SRC_DIR}/*.c
  ${PMD_SRC_DIR}/*.h
)

set(BRIDGE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/src/pmd_bridge.c)

add_executable(PMD ${PMD_SOURCES} ${BRIDGE_SRC})

target_include_directories(PMD PRIVATE
  ${PMD_SRC_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/src/pmdmini
)

set_target_properties(PMD PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../public/pmd
)

target_link_options(PMD PRIVATE
  -s MODULARIZE=1
  -s EXPORT_NAME='createPMD'
  -s EXPORTED_FUNCTIONS='[
    "_pmd_bridge_open",
    "_pmd_bridge_close",
    "_pmd_bridge_calc",
    "_pmd_bridge_get_title",
    "_pmd_bridge_get_length",
    "_pmd_bridge_tell",
    "_pmd_bridge_track_ended",
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
