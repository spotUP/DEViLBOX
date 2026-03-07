# UADE Core Library
#
# This builds UADE (Unix Amiga Delitracker Emulator) as a static library.
# Based on UADE by Heikki Orsila and Michael Doering - https://gitlab.com/mvtiaine/uade
#
# CPU emulation source files (cpudefs.c, cpuemu.c, cpustbl.c, cputbl.h) are
# pre-generated and committed in the generated/ directory. This avoids running
# build68k and gencpu at build time, which hangs on Windows.

cmake_minimum_required(VERSION 3.16)

set(UADE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/uade")
set(UADE_SRC "${UADE_ROOT}/src")
set(UADE_FRONTENDS "${UADE_SRC}/frontends")
set(UADE_COMMON "${UADE_FRONTENDS}/common")
set(UADE_INCLUDE "${UADE_FRONTENDS}/include")
set(UADE_COMPAT "${UADE_ROOT}/compat")
set(BENCODE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/bencode")

if(NOT EXISTS "${UADE_SRC}/uade.c")
    message(WARNING "UADE source not found at ${UADE_SRC}. UADE will not be built.")
    return()
endif()

# UADE is a Unix-oriented C codebase and does not compile with MSVC
# (GCC variadic macros, __attribute__((packed)), POSIX types, etc.)
if(MSVC)
    message(STATUS "UADE: Skipping build (not compatible with MSVC)")
    return()
endif()

# Pre-generated CPU emulation files
set(UADE_GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/generated")

# Common warning suppressions for UADE code
set(UADE_WARNING_FLAGS
    -Wno-unused-parameter
    -Wno-sign-compare
    -Wno-missing-field-initializers
    -Wno-implicit-fallthrough
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-format
    -Wno-pointer-sign
    -Wno-parentheses
    -Wno-uninitialized
    -Wno-strict-aliasing
    -Wno-macro-redefined
    -Wno-implicit-function-declaration
    -Wno-missing-prototypes
    -Wno-strict-prototypes
    -Wno-old-style-definition
    -Wno-deprecated-declarations
)

# GCC-specific warning flags (not supported by Apple Clang)
if(NOT APPLE)
    list(APPEND UADE_WARNING_FLAGS
        -Wno-unused-but-set-variable
        -Wno-misleading-indentation
        -Wno-cast-function-type
    )
endif()

# Platform-specific compile definitions for UADE
# These replace what autoconf would normally generate
set(UADE_COMPILE_DEFS
    HAVE_STRING_H=1
    HAVE_SYS_STAT_H=1
    HAVE_STRDUP=1
    SIZEOF_SHORT=2
    SIZEOF_INT=4
    SIZEOF_LONG_LONG=8
)

if(WIN32)
    list(APPEND UADE_COMPILE_DEFS
        SIZEOF_LONG=4
        SIZEOF___INT64=8
    )
else()
    list(APPEND UADE_COMPILE_DEFS
        HAVE_STRINGS_H=1
        HAVE_SYS_TYPES_H=1
        HAVE_UNISTD_H=1
        HAVE_FCNTL_H=1
        HAVE_DIRENT_H=1
        SIZEOF_LONG=8
    )
endif()

# =============================================================================
# Build bencode library (required for UADE)
# =============================================================================

add_library(bencode STATIC
    ${BENCODE_ROOT}/bencode.c
)
target_include_directories(bencode PUBLIC
    ${BENCODE_ROOT}/include
)
set_target_properties(bencode PROPERTIES POSITION_INDEPENDENT_CODE ON)

# =============================================================================
# Build libuade (frontend common modules)
# =============================================================================

set(LIBUADE_SOURCES
    ${UADE_COMMON}/unixatomic.c
    ${UADE_COMMON}/uadeipc.c
    ${UADE_COMMON}/amifilemagic.c
    ${UADE_COMMON}/eagleplayer.c
    ${UADE_COMMON}/unixwalkdir.c
    ${UADE_COMMON}/effects.c
    ${UADE_COMMON}/uadecontrol.c
    ${UADE_COMMON}/uadeconf.c
    ${UADE_COMMON}/uadestate.c
    ${UADE_COMMON}/uadeutils.c
    ${UADE_COMMON}/md5.c
    ${UADE_COMMON}/ossupport.c
    ${UADE_COMMON}/rmc.c
    ${UADE_COMMON}/songdb.c
    ${UADE_COMMON}/songinfo.c
    ${UADE_COMMON}/vparray.c
    ${UADE_COMMON}/support.c
    ${UADE_COMMON}/fifo.c
)

# strlcpy/strlcat are native on macOS/BSD, only use compat on Linux/Windows
if(NOT APPLE)
    list(APPEND LIBUADE_SOURCES ${UADE_COMPAT}/strlrep.c)
endif()

# Windows-specific compat files
if(WIN32)
    list(APPEND LIBUADE_SOURCES ${UADE_COMPAT}/mingw-socketpair.c)
endif()

add_library(libuade STATIC ${LIBUADE_SOURCES})
target_include_directories(libuade PUBLIC
    ${UADE_INCLUDE}
    ${UADE_COMMON}
    ${UADE_SRC}
    ${UADE_SRC}/include
    ${UADE_COMPAT}
    ${BENCODE_ROOT}/include
)
target_compile_definitions(libuade PRIVATE ${UADE_COMPILE_DEFS})
# Note: Not defining HAVE_STRLCPY so we use the compat implementation
if(NOT MSVC)
    target_compile_options(libuade PRIVATE ${UADE_WARNING_FLAGS})
endif()
set_target_properties(libuade PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries(libuade PRIVATE bencode)

# =============================================================================
# Build uadecore (68000 emulator + Amiga hardware)
# =============================================================================

# CPU emulation parts (compiled with different PART_N defines)
set(CPUEMU_PARTS 1 2 3 4 5 6 7 8)

foreach(PART ${CPUEMU_PARTS})
    add_library(cpuemu${PART} OBJECT ${UADE_GENERATED_DIR}/cpuemu.c)
    target_compile_definitions(cpuemu${PART} PRIVATE PART_${PART} ${UADE_COMPILE_DEFS})
    target_include_directories(cpuemu${PART} PRIVATE
        ${UADE_SRC}
        ${UADE_SRC}/include
        ${UADE_INCLUDE}
        ${UADE_GENERATED_DIR}
    )
    if(NOT MSVC)
        target_compile_options(cpuemu${PART} PRIVATE ${UADE_WARNING_FLAGS})
    endif()
endforeach()

set(UADECORE_SOURCES
    ${UADE_SRC}/newcpu.c
    ${UADE_SRC}/memory.c
    ${UADE_SRC}/custom.c
    ${UADE_SRC}/cia.c
    ${UADE_SRC}/audio.c
    ${UADE_SRC}/compiler.c
    ${UADE_SRC}/missing.c
    ${UADE_SRC}/sd-sound-generic.c
    ${UADE_SRC}/md-support.c
    ${UADE_SRC}/cfgfile.c
    ${UADE_SRC}/fpp.c
    ${UADE_SRC}/debug.c
    ${UADE_SRC}/readcpu.c
    ${UADE_SRC}/uade.c
    ${UADE_SRC}/uademain.c
    ${UADE_SRC}/sinctable.c
    ${UADE_SRC}/text_scope.c
    ${UADE_SRC}/state_detection.c
    ${UADE_SRC}/uade_logging.c
    ${UADE_SRC}/write_audio.c
    ${UADE_GENERATED_DIR}/cpudefs.c
    ${UADE_GENERATED_DIR}/cpustbl.c
)

add_library(uadecore STATIC
    ${UADECORE_SOURCES}
    $<TARGET_OBJECTS:cpuemu1>
    $<TARGET_OBJECTS:cpuemu2>
    $<TARGET_OBJECTS:cpuemu3>
    $<TARGET_OBJECTS:cpuemu4>
    $<TARGET_OBJECTS:cpuemu5>
    $<TARGET_OBJECTS:cpuemu6>
    $<TARGET_OBJECTS:cpuemu7>
    $<TARGET_OBJECTS:cpuemu8>
)

target_include_directories(uadecore PUBLIC
    ${UADE_SRC}
    ${UADE_SRC}/include
    ${UADE_INCLUDE}
    ${UADE_COMMON}
    ${UADE_COMPAT}
    ${UADE_GENERATED_DIR}
)
target_compile_definitions(uadecore PRIVATE
    DISABLE_ZAKALWE=1
    ${UADE_COMPILE_DEFS}
    # Replace exit() with pthread_exit() so uadecore doesn't kill the whole process
    exit=uade_thread_exit
)
if(NOT MSVC)
    target_compile_options(uadecore PRIVATE ${UADE_WARNING_FLAGS})
endif()
set_target_properties(uadecore PROPERTIES POSITION_INDEPENDENT_CODE ON)

# =============================================================================
# Create combined uade_full library for easier linking
# =============================================================================

add_library(uade_full INTERFACE)
target_link_libraries(uade_full INTERFACE
    libuade
    uadecore
    bencode
)

# Link pthread on Unix
if(UNIX)
    target_link_libraries(uade_full INTERFACE pthread m)
endif()

# Link winsock on Windows
if(WIN32)
    target_link_libraries(uade_full INTERFACE ws2_32)
endif()

# Export include directories
target_include_directories(uade_full INTERFACE
    ${UADE_INCLUDE}
    ${UADE_COMMON}
    ${UADE_SRC}
    ${UADE_SRC}/include
)

message(STATUS "UADE core library configured")
