cmake_minimum_required(VERSION 3.13)
project(FT2SampEd C)

set(CMAKE_C_STANDARD 11)

# ── Source files ────────────────────────────────────────────────────────
# Real FT2 clone source (copied from reference) + WASM stubs + bridge

set(SOURCES
    # WASM bridge (main entry point)
    src/ft2_wasm_bridge.c

    # Real FT2 clone source files (from reference)
    src/ft2_sample_ed.c
    src/ft2_sample_ed_features.c
    src/ft2_gui.c
    src/ft2_palette.c
    src/ft2_bmp.c
    src/ft2_mouse.c
    src/ft2_pushbuttons.c
    src/ft2_radiobuttons.c
    src/ft2_checkboxes.c
    src/ft2_scrollbars.c
    src/ft2_textboxes.c
    src/ft2_tables.c
    src/ft2_unicode.c
    src/ft2_random.c
    src/ft2_structs.c
    src/ft2_smpfx.c

    # Graphics data (binary bitmaps — MUST be from reference, never agent-generated)
    src/gfxdata/ft2_bmp_fonts.c
    src/gfxdata/ft2_bmp_gui.c
    src/gfxdata/ft2_bmp_looppins.c
    src/gfxdata/ft2_bmp_mouse.c
    src/gfxdata/ft2_bmp_instr.c
    src/gfxdata/ft2_bmp_logo.c
    src/gfxdata/ft2_bmp_midi.c
    src/gfxdata/ft2_bmp_nibbles.c
    src/gfxdata/ft2_bmp_scopes.c

    # WASM stubs (replacing SDL2/audio/file I/O subsystems)
    src/ft2_video.c
    src/ft2_audio.c
    src/ft2_config.c
    src/ft2_keyboard.c
    src/ft2_events.c
    src/ft2_hpc.c
    src/ft2_replayer.c
    src/ft2_inst_ed.c
    src/ft2_pattern_ed.c
    src/ft2_diskop.c
    src/ft2_sample_loader.c
    src/ft2_sample_saver.c
    src/ft2_module_loader.c
    src/ft2_sysreqs.c
    src/ft2_about.c
    src/ft2_nibbles.c
    src/ft2_help.c
    src/ft2_wav_renderer.c
    src/ft2_trim.c
    src/ft2_edit.c
    src/ft2_sampling.c
    src/ft2_audioselector.c
    src/scopes/ft2_scopes.c
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/ft2")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FT2SampEd ${SOURCES})

# Include paths: src/ for headers, src/ subdirs for scopes/, mixer/, gfxdata/, SDL2/
target_include_directories(FT2SampEd PRIVATE src)

set_target_properties(FT2SampEd PROPERTIES
    OUTPUT_NAME "FT2SampEd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(FT2SampEd PRIVATE
    -O2
    -Wno-unused-function
    -Wno-unused-variable
    -DNDEBUG
)

target_link_options(FT2SampEd PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFT2SampEd'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s EXPORTED_FUNCTIONS=['_ft2_sampled_init','_ft2_sampled_start','_ft2_sampled_shutdown','_ft2_sampled_tick','_ft2_sampled_load_pcm','_ft2_sampled_set_param','_ft2_sampled_get_param','_ft2_sampled_set_loop','_ft2_sampled_set_vol_env_point','_ft2_sampled_set_pan_env_point','_ft2_sampled_load_config','_ft2_sampled_dump_config','_ft2_sampled_get_fb','_ft2_sampled_on_mouse_down','_ft2_sampled_on_mouse_up','_ft2_sampled_on_mouse_move','_ft2_sampled_on_wheel','_ft2_sampled_on_key_down','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','HEAPU8','HEAP8','HEAP16']"
)
