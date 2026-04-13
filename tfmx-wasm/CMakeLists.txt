cmake_minimum_required(VERSION 3.15)
project(tfmx_synth CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Use our LOCAL copy of libtfmxaudiodecoder, not the third-party submodule.
# We forked the library into tfmx-wasm/lib/libtfmxaudiodecoder/src so we can
# add new public APIs (e.g. preview-macro) without modifying third-party
# code, which CLAUDE.md forbids.
set(TFMXLIB_ROOT "${CMAKE_SOURCE_DIR}/lib/libtfmxaudiodecoder/src")

set(TFMXLIB_SOURCES
  "${TFMXLIB_ROOT}/tfmxaudiodecoder.cpp"
  "${TFMXLIB_ROOT}/CRCLight.cpp"
  "${TFMXLIB_ROOT}/Decoder.cpp"
  "${TFMXLIB_ROOT}/DecoderProxy.cpp"
  "${TFMXLIB_ROOT}/Filter.cpp"
  "${TFMXLIB_ROOT}/LamePaulaMixer.cpp"
  "${TFMXLIB_ROOT}/LamePaulaVoice.cpp"
  "${TFMXLIB_ROOT}/PaulaVoice.cpp"
  "${TFMXLIB_ROOT}/Dump.cpp"
  "${TFMXLIB_ROOT}/Chris/ByChecksum.cpp"
  "${TFMXLIB_ROOT}/Chris/Macro.cpp"
  "${TFMXLIB_ROOT}/Chris/MergedFiles.cpp"
  "${TFMXLIB_ROOT}/Chris/Modulation.cpp"
  "${TFMXLIB_ROOT}/Chris/Pattern.cpp"
  "${TFMXLIB_ROOT}/Chris/SamplesFile.cpp"
  "${TFMXLIB_ROOT}/Chris/Sequencer.cpp"
  "${TFMXLIB_ROOT}/Chris/Songs.cpp"
  "${TFMXLIB_ROOT}/Chris/TFMXDecoder.cpp"
  "${TFMXLIB_ROOT}/Jochen/HippelDecoder.cpp"
  "${TFMXLIB_ROOT}/Jochen/Analyze.cpp"
  "${TFMXLIB_ROOT}/Jochen/COSO.cpp"
  "${TFMXLIB_ROOT}/Jochen/Envelope.cpp"
  "${TFMXLIB_ROOT}/Jochen/FC.cpp"
  "${TFMXLIB_ROOT}/Jochen/Instrument.cpp"
  "${TFMXLIB_ROOT}/Jochen/MCMD.cpp"
  "${TFMXLIB_ROOT}/Jochen/ModPack.cpp"
  "${TFMXLIB_ROOT}/Jochen/Portamento.cpp"
  "${TFMXLIB_ROOT}/Jochen/Probe.cpp"
  "${TFMXLIB_ROOT}/Jochen/SMOD.cpp"
  "${TFMXLIB_ROOT}/Jochen/TFMX.cpp"
  "${TFMXLIB_ROOT}/Jochen/TFMX7V.cpp"
  "${TFMXLIB_ROOT}/Jochen/TraitsByChecksum.cpp"
  "${TFMXLIB_ROOT}/Jochen/Vibrato.cpp"
)

add_executable(TFMX
  src/tfmx_synth.cpp
  ${TFMXLIB_SOURCES}
)

target_include_directories(TFMX PRIVATE
  # Our minimal Config.h (replaces autoconf-generated one)
  include
  # libtfmxaudiodecoder headers
  "${TFMXLIB_ROOT}"
  "${TFMXLIB_ROOT}/Chris"
  "${TFMXLIB_ROOT}/Jochen"
)

target_compile_options(TFMX PRIVATE
  -O2
  -ffast-math
  # Suppress unused-variable warnings from library sources
  -Wno-unused-variable
  -Wno-unused-but-set-variable
)

set_target_properties(TFMX PROPERTIES
  OUTPUT_NAME "TFMX"
  SUFFIX ".js"
)

target_link_options(TFMX PRIVATE
  -sWASM=1
  -sEXPORTED_FUNCTIONS=['_tfmx_init','_tfmx_dispose','_tfmx_create_player','_tfmx_destroy_player','_tfmx_load_instrument','_tfmx_note_on','_tfmx_note_off','_tfmx_render','_tfmx_set_param','_tfmx_get_param','_tfmx_set_instrument_param','_tfmx_load_module','_tfmx_module_render','_tfmx_module_stop','_tfmx_module_songs','_tfmx_module_duration','_tfmx_module_voice_volume','_tfmx_module_voices','_tfmx_module_mute_voice','_tfmx_module_song_end','_tfmx_module_preview_macro','_tfmx_get_samples_rendered','_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','HEAPF32','HEAPU8','stringToUTF8']
  -sMODULARIZE=1
  -sEXPORT_NAME='createTFMX'
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=16777216
  -sSINGLE_FILE=0
  -sFORCE_FILESYSTEM=1
  -sENVIRONMENT=web,worker
  -sASSERTIONS=0
)

# Copy output to public/tfmx/
add_custom_command(TARGET TFMX POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/../public/tfmx
  COMMAND ${CMAKE_COMMAND} -E copy TFMX.js   ${CMAKE_SOURCE_DIR}/../public/tfmx/TFMX.js
  COMMAND ${CMAKE_COMMAND} -E copy TFMX.wasm ${CMAKE_SOURCE_DIR}/../public/tfmx/TFMX.wasm
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
