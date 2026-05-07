cmake_minimum_required(VERSION 3.20)
project(kontakt-bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(kontakt-bridge
  main.cpp
  vst3host.cpp
  wsserver.cpp
)

target_include_directories(kontakt-bridge PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

if(APPLE)
  target_link_libraries(kontakt-bridge
    "-framework AudioToolbox"
    "-framework CoreAudio"
    "-framework CoreFoundation"
    "-framework CoreMIDI"
  )
endif()

if(WIN32)
  target_link_libraries(kontakt-bridge ws2_32)
endif()
