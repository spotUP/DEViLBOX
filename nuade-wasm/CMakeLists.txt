cmake_minimum_required(VERSION 3.16)
project(nuade-wasm C)

# nuade (emoon/nuade, MIT): native C ports of the UADE eagleplayers behind one host API. The pristine upstream tree is
# third-party/nuade (pinned in UPSTREAM.md); everything of ours is this directory: the C shim the worklet calls
# (src/nuade_wasm.c) and this build.
# Ledger: thoughts/shared/plans/2026-10-13-nuade-engine.md
#
#   nuade-wasm/build.sh        (emcc on PATH)
set(CMAKE_C_STANDARD 11)

set(NUADE_PLAYERS "all" CACHE STRING "" FORCE)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../third-party/nuade nuade EXCLUDE_FROM_ALL)

set(NUADE_OUT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../public/nuade" CACHE PATH "Where Nuade.js and Nuade.wasm are written")
add_executable(Nuade src/nuade_wasm.c)
target_link_libraries(Nuade PRIVATE nuade)
set_target_properties(Nuade PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${NUADE_OUT_DIR}"
)
target_compile_options(Nuade PRIVATE -O2 -Wall)

set(EXPORTED_FUNCS "_malloc,_free,_nw_init,_nw_add_file,_nw_clear_files,_nw_open,_nw_close,_nw_last_error,_nw_start,_nw_render,_nw_last_flags,_nw_voice_count,_nw_subsong_count,_nw_default_subsong,_nw_position,_nw_seek,_nw_snapshot,_nw_vu,_nw_pans,_nw_set_repeat,_nw_set_mute_mask,_nw_set_separation,_nw_meta,_nw_instrument_count,_nw_instrument_name,_nw_instrument_index,_nw_player_id,_nw_player_name,_nw_player_count,_nw_player_id_at,_nw_probe,_nw_probe_with,_nw_caps,_nw_state_size,_nw_state_read,_nw_cell_write,_nw_instrument_write,_nw_next_open,_nw_next_start,_nw_next_advance,_nw_next_position,_nw_next_commit,_nw_next_close")

target_link_options(Nuade PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME=createNuade"
    "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPF32,HEAP32,UTF8ToString,stringToUTF8,lengthBytesUTF8]"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=131072"
    "SHELL:-s ENVIRONMENT=web,worker,node"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s SINGLE_FILE=0"
    -O2
    --no-entry
)
