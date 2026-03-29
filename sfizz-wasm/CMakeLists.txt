cmake_minimum_required(VERSION 3.13)
project(SfizzWASM)
set(CMAKE_CXX_STANDARD 17)

set(SFIZZ_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../third-party/sfizz")
set(SFIZZ_BUILD "${SFIZZ_ROOT}/build-wasm")
set(SFIZZ_LIB_DIR "${SFIZZ_BUILD}/library/lib")

add_executable(SfizzWASM common/sfizz_bridge.cpp)

target_include_directories(SfizzWASM PRIVATE
    "${SFIZZ_ROOT}/src"
)

target_compile_options(SfizzWASM PRIVATE
    -O2
    -Wno-missing-template-arg-list-after-template-kw
    -Wno-deprecated-builtins
)

# Link all sfizz static libraries
# Order matters: high-level first, deps after
target_link_libraries(SfizzWASM
    "${SFIZZ_LIB_DIR}/libsfizz.a"
    "${SFIZZ_LIB_DIR}/libsfizz_internal.a"
    "${SFIZZ_LIB_DIR}/libsfizz_parser.a"
    "${SFIZZ_LIB_DIR}/libsfizz_messaging.a"
    "${SFIZZ_LIB_DIR}/libsfizz_pugixml.a"
    "${SFIZZ_LIB_DIR}/libsfizz_kissfft.a"
    "${SFIZZ_LIB_DIR}/libsfizz_cpuid.a"
    "${SFIZZ_LIB_DIR}/libsfizz_cephes.a"
    "${SFIZZ_LIB_DIR}/libsfizz_spin_mutex.a"
    "${SFIZZ_LIB_DIR}/libsfizz_spline.a"
    "${SFIZZ_LIB_DIR}/libsfizz_tunings.a"
    "${SFIZZ_LIB_DIR}/libsfizz_filesystem_impl.a"
    "${SFIZZ_LIB_DIR}/libst_audiofile.a"
    "${SFIZZ_LIB_DIR}/libst_audiofile_formats.a"
    "${SFIZZ_LIB_DIR}/libaiff.a"
    "${SFIZZ_LIB_DIR}/libwavpack.a"
    # Abseil libraries
    "${SFIZZ_LIB_DIR}/libabsl_strings.a"
    "${SFIZZ_LIB_DIR}/libabsl_strings_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_string_view.a"
    "${SFIZZ_LIB_DIR}/libabsl_str_format_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_hash.a"
    "${SFIZZ_LIB_DIR}/libabsl_city.a"
    "${SFIZZ_LIB_DIR}/libabsl_low_level_hash.a"
    "${SFIZZ_LIB_DIR}/libabsl_raw_hash_set.a"
    "${SFIZZ_LIB_DIR}/libabsl_hashtablez_sampler.a"
    "${SFIZZ_LIB_DIR}/libabsl_exponential_biased.a"
    "${SFIZZ_LIB_DIR}/libabsl_int128.a"
    "${SFIZZ_LIB_DIR}/libabsl_synchronization.a"
    "${SFIZZ_LIB_DIR}/libabsl_graphcycles_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_kernel_timeout_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_time.a"
    "${SFIZZ_LIB_DIR}/libabsl_time_zone.a"
    "${SFIZZ_LIB_DIR}/libabsl_civil_time.a"
    "${SFIZZ_LIB_DIR}/libabsl_base.a"
    "${SFIZZ_LIB_DIR}/libabsl_spinlock_wait.a"
    "${SFIZZ_LIB_DIR}/libabsl_malloc_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_raw_logging_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_log_severity.a"
    "${SFIZZ_LIB_DIR}/libabsl_throw_delegate.a"
    "${SFIZZ_LIB_DIR}/libabsl_bad_optional_access.a"
    "${SFIZZ_LIB_DIR}/libabsl_bad_variant_access.a"
    "${SFIZZ_LIB_DIR}/libabsl_stacktrace.a"
    "${SFIZZ_LIB_DIR}/libabsl_symbolize.a"
    "${SFIZZ_LIB_DIR}/libabsl_debugging_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_demangle_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_cord.a"
    "${SFIZZ_LIB_DIR}/libabsl_cord_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_cordz_info.a"
    "${SFIZZ_LIB_DIR}/libabsl_cordz_handle.a"
    "${SFIZZ_LIB_DIR}/libabsl_cordz_functions.a"
    "${SFIZZ_LIB_DIR}/libabsl_crc32c.a"
    "${SFIZZ_LIB_DIR}/libabsl_crc_internal.a"
    "${SFIZZ_LIB_DIR}/libabsl_crc_cpu_detect.a"
    "${SFIZZ_LIB_DIR}/libabsl_crc_cord_state.a"
)

set_target_properties(SfizzWASM PROPERTIES OUTPUT_NAME "Sfizz" SUFFIX ".js")

target_link_options(SfizzWASM PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSfizz'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_sfizz_bridge_create','_sfizz_bridge_destroy','_sfizz_bridge_load_file','_sfizz_bridge_load_string','_sfizz_bridge_note_on','_sfizz_bridge_note_off','_sfizz_bridge_send_cc','_sfizz_bridge_pitch_wheel','_sfizz_bridge_aftertouch','_sfizz_bridge_poly_aftertouch','_sfizz_bridge_program_change','_sfizz_bridge_render','_sfizz_bridge_set_volume','_sfizz_bridge_get_volume','_sfizz_bridge_set_num_voices','_sfizz_bridge_get_num_voices','_sfizz_bridge_set_oversampling','_sfizz_bridge_get_oversampling','_sfizz_bridge_set_preload_size','_sfizz_bridge_get_preload_size','_sfizz_bridge_set_sample_quality','_sfizz_bridge_set_oscillator_quality','_sfizz_bridge_set_sustain_cancels_release','_sfizz_bridge_set_sample_rate','_sfizz_bridge_set_samples_per_block','_sfizz_bridge_set_scala_root_key','_sfizz_bridge_set_tuning_frequency','_sfizz_bridge_load_scala_string','_sfizz_bridge_set_tempo','_sfizz_bridge_set_time_signature','_sfizz_bridge_set_time_position','_sfizz_bridge_set_playback_state','_sfizz_bridge_get_num_regions','_sfizz_bridge_get_num_groups','_sfizz_bridge_get_num_active_voices','_sfizz_bridge_get_num_preloaded_samples','_sfizz_bridge_all_sound_off','_sfizz_bridge_enable_freewheeling','_sfizz_bridge_disable_freewheeling','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','FS','wasmMemory']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s MAXIMUM_MEMORY=268435456"
    "SHELL:-s FILESYSTEM=1"
    "SHELL:-s FORCE_FILESYSTEM=1"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s SINGLE_FILE=0"
    "SHELL:-s NO_EXIT_RUNTIME=1"
)
