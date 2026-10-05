cmake_minimum_required(VERSION 3.13)
project(gme-wasm C CXX)

# game-music-emu (libgme, Shay Green et al., LGPL-2.1+) compiled to wasm for
# the game-music formats DEViLBOX has no other emulator for: NSF/NSFE, GBS,
# HES, KSS, SPC, VGM/VGZ and GYM. The library is used in place from
# third-party/game-music-emu; src/gen_types.h picks the emulator types and
# src/gme_wasm.cpp is the bridge. YM2612 is Nuked OPN2 (LGPL-2.1+); the
# MAME core (GPL) is not vendored. VGZ is inflated by zlib (emscripten port).
set(CMAKE_CXX_STANDARD 11)
set(G ${CMAKE_SOURCE_DIR}/../third-party/game-music-emu/gme)

set(SOURCES
    ${G}/Blip_Buffer.cpp
    ${G}/Classic_Emu.cpp
    ${G}/Data_Reader.cpp
    ${G}/Dual_Resampler.cpp
    ${G}/Effects_Buffer.cpp
    ${G}/Fir_Resampler.cpp
    ${G}/gme.cpp
    ${G}/Gme_File.cpp
    ${G}/M3u_Playlist.cpp
    ${G}/Multi_Buffer.cpp
    ${G}/Music_Emu.cpp
    # GBS
    ${G}/Gb_Apu.cpp ${G}/Gb_Cpu.cpp ${G}/Gb_Oscs.cpp ${G}/Gbs_Emu.cpp
    # GYM / VGM
    ${G}/Gym_Emu.cpp ${G}/Vgm_Emu.cpp ${G}/Vgm_Emu_Impl.cpp ${G}/Ym2413_Emu.cpp
    ${G}/Ym2612_Nuked.cpp ${G}/Sms_Apu.cpp
    # HES
    ${G}/Hes_Apu.cpp ${G}/Hes_Apu_Adpcm.cpp ${G}/Hes_Cpu.cpp ${G}/Hes_Emu.cpp
    # KSS (Z80 + AY + SCC)
    ${G}/Kss_Cpu.cpp ${G}/Kss_Emu.cpp ${G}/Kss_Scc_Apu.cpp ${G}/Ay_Apu.cpp
    # NSF / NSFE
    ${G}/Nes_Apu.cpp ${G}/Nes_Cpu.cpp ${G}/Nes_Fds_Apu.cpp ${G}/Nes_Fme7_Apu.cpp
    ${G}/Nes_Namco_Apu.cpp ${G}/Nes_Oscs.cpp ${G}/Nes_Vrc6_Apu.cpp ${G}/Nes_Vrc7_Apu.cpp
    ${G}/Nsf_Emu.cpp ${G}/Nsfe_Emu.cpp
    ${G}/ext/emu2413.c
    # SPC
    ${G}/Snes_Spc.cpp ${G}/Spc_Cpu.cpp ${G}/Spc_Dsp.cpp ${G}/Spc_Emu.cpp ${G}/Spc_Filter.cpp
    src/gme_wasm.cpp
)

add_executable(Gme ${SOURCES})

target_include_directories(Gme PRIVATE src ${G})
target_compile_definitions(Gme PRIVATE GEN_TYPES_H VGM_YM2612_NUKED HAVE_ZLIB_H BLARGG_LITTLE_ENDIAN=1 NDEBUG)
target_compile_options(Gme PRIVATE -O2 -Wno-deprecated-declarations "SHELL:-s USE_ZLIB=1")

set_target_properties(Gme PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/gme"
)

set(EXPORTED_FUNCS "_malloc,_free,_gme_wasm_load,_gme_wasm_render,_gme_wasm_render_channels,_gme_wasm_set_mute_mask,_gme_wasm_free,_gme_wasm_track_count,_gme_wasm_voice_count,_gme_wasm_voice_name,_gme_wasm_scope_count,_gme_wasm_info,_gme_wasm_loaded_track,_gme_wasm_start_track")

target_link_options(Gme PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createGme"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[cwrap,ccall,UTF8ToString,HEAPU8,HEAPF32]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=262144"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s USE_ZLIB=1"
    -O2
    --no-entry
)
