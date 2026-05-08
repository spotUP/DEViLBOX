cmake_minimum_required(VERSION 3.20)
project(kontakt-bridge LANGUAGES CXX OBJCXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_OBJCXX_STANDARD 17)

add_executable(kontakt-bridge
  main.mm
  vst3host.cpp
  wsserver.cpp
  augui.mm
)

target_include_directories(kontakt-bridge PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

if(APPLE)
  find_library(SQLITE3_LIB sqlite3)
  target_link_libraries(kontakt-bridge
    "-framework AudioToolbox"
    "-framework CoreAudio"
    "-framework CoreFoundation"
    "-framework CoreMIDI"
    "-framework Cocoa"
    "-framework CoreAudioKit"
    ${SQLITE3_LIB}
  )
endif()

if(WIN32)
  target_link_libraries(kontakt-bridge ws2_32)
endif()
