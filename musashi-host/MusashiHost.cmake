# MusashiHost.cmake - the shared 68000 replayer host, for any engine CMake.
#
#   include(${CMAKE_SOURCE_DIR}/../musashi-host/MusashiHost.cmake)
#   musashi_host_add(<target> [EAGLE])
#
# Adds Musashi's 68020 core (third-party/musashi, MIT; opcode tables generated
# by its m68kmake for the host), the minimal Amiga (src/amiga_host.c), the
# shared software Paula (tools/asm68k-to-c/runtime/paula_soft.c - the only
# copy) and, with EAGLE, UADE's sound core runner (src/eagle_runner.c).
# Ledger: thoughts/shared/plans/2026-10-05-musashi-replayer-host.md

set(MUSASHI_HOST_DIR ${CMAKE_CURRENT_LIST_DIR})
set(MUSASHI_DIR ${MUSASHI_HOST_DIR}/../third-party/musashi)
set(PAULA_RUNTIME_DIR ${MUSASHI_HOST_DIR}/../tools/asm68k-to-c/runtime)

function(musashi_host_add target)
  cmake_parse_arguments(MH "EAGLE" "" "" ${ARGN})
  set(gen ${CMAKE_BINARY_DIR}/musashi-gen)
  file(MAKE_DIRECTORY ${gen})
  if(NOT EXISTS ${gen}/m68kops.c)
    find_program(HOST_CC NAMES cc gcc clang REQUIRED)
    execute_process(COMMAND ${HOST_CC} -O2 -o ${gen}/m68kmake ${MUSASHI_DIR}/m68kmake.c RESULT_VARIABLE rc)
    if(NOT rc EQUAL 0)
      message(FATAL_ERROR "building m68kmake failed")
    endif()
    execute_process(COMMAND ${gen}/m68kmake ${gen} ${MUSASHI_DIR}/m68k_in.c RESULT_VARIABLE rc OUTPUT_QUIET)
    if(NOT rc EQUAL 0)
      message(FATAL_ERROR "m68kmake failed")
    endif()
  endif()
  set(srcs
      ${MUSASHI_DIR}/m68kcpu.c
      ${gen}/m68kops.c
      ${MUSASHI_DIR}/softfloat/softfloat.c
      ${MUSASHI_HOST_DIR}/src/amiga_host.c
      ${PAULA_RUNTIME_DIR}/paula_soft.c)
  if(MH_EAGLE)
    list(APPEND srcs ${MUSASHI_HOST_DIR}/src/eagle_runner.c)
  endif()
  target_sources(${target} PRIVATE ${srcs})
  target_include_directories(${target} PRIVATE ${gen} ${MUSASHI_DIR} ${MUSASHI_HOST_DIR}/src ${PAULA_RUNTIME_DIR})
  # Musashi options (no PMMU, TRAP callback): src/m68kconf_host.h
  target_compile_definitions(${target} PRIVATE MUSASHI_CNF="m68kconf_host.h")
endfunction()
