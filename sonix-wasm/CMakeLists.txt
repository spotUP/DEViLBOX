cmake_minimum_required(VERSION 3.13)
project(Sonix C)

set(CMAKE_C_STANDARD 11)

add_executable(Sonix src/sonix_harness.c)
target_include_directories(Sonix PRIVATE src)

# Emscripten settings
if(EMSCRIPTEN)
  set_target_properties(Sonix PROPERTIES
    OUTPUT_NAME "Sonix"
    SUFFIX ".js"
  )
  target_link_options(Sonix PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSonix'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_sonix_init','_sonix_start','_sonix_stop','_sonix_render','_sonix_set_sample_rate','_sonix_set_solo_channel','_sonix_set_stereo_mix','_sonix_get_format','_sonix_get_num_channels','_sonix_get_num_instruments','_sonix_get_num_samples','_sonix_get_format_name','_sonix_get_error','_sonix_get_instrument_name','_sonix_is_finished','_sonix_memfs_add','_sonix_memfs_clear','_sonix_load_instruments','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32','UTF8ToString']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
