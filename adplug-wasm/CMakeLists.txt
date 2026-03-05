cmake_minimum_required(VERSION 3.10)
project(adplug-wasm CXX)

set(CMAKE_CXX_STANDARD 14)

# AdPlug source directory (clone adplug here)
set(ADPLUG_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/adplug/src)

file(GLOB ADPLUG_SOURCES
  ${ADPLUG_SRC_DIR}/*.cpp
  ${ADPLUG_SRC_DIR}/*.h
)

# libbinio dependency (AdPlug requires it)
set(BINIO_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/libbinio/src)
file(GLOB BINIO_SOURCES
  ${BINIO_SRC_DIR}/*.cpp
  ${BINIO_SRC_DIR}/*.h
)

set(BRIDGE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/src/adplug_bridge.cpp)

add_executable(AdPlug ${ADPLUG_SOURCES} ${BINIO_SOURCES} ${BRIDGE_SRC})

target_include_directories(AdPlug PRIVATE
  ${ADPLUG_SRC_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/src/adplug
  ${BINIO_SRC_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/src/libbinio
)

set_target_properties(AdPlug PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../public/adplug
)

target_link_options(AdPlug PRIVATE
  -s MODULARIZE=1
  -s EXPORT_NAME='createAdPlug'
  -s EXPORTED_FUNCTIONS='[
    "_adplug_bridge_open",
    "_adplug_bridge_close",
    "_adplug_bridge_update",
    "_adplug_bridge_render",
    "_adplug_bridge_get_title",
    "_adplug_bridge_get_author",
    "_adplug_bridge_get_desc",
    "_adplug_bridge_get_length",
    "_adplug_bridge_get_channels",
    "_adplug_bridge_get_format",
    "_adplug_bridge_tell",
    "_adplug_bridge_track_ended",
    "_adplug_bridge_get_opl_regs",
    "_malloc",
    "_free"
  ]'
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","UTF8ToString","HEAPU8","HEAP16","HEAPF32"]'
  -s ALLOW_MEMORY_GROWTH=1
  -s INITIAL_MEMORY=4194304
  -s ENVIRONMENT='web,worker'
  -s NO_EXIT_RUNTIME=1
  -s FILESYSTEM=0
  -O2
)
