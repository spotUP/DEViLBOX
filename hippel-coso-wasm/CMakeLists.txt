cmake_minimum_required(VERSION 3.15)
project(HippelCoSo CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# The CoSo keyboard voice runs libtfmxaudiodecoder's HippelDecoder (the replayer)
# on a minimal COSO module assembled around the instrument. Same local fork of
# the library, same Config.h, as the TFMX synth.
set(TFMXDIR "${CMAKE_SOURCE_DIR}/../tfmx-wasm")
set(TFMXLIB_ROOT "${TFMXDIR}/lib/libtfmxaudiodecoder/src")

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

# Output name
set(OUTPUT_NAME "HippelCoSo")

# Output to public/hippel-coso/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/hippel-coso")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} src/hippel_coso_synth.cpp ${TFMXLIB_SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE
  "${TFMXDIR}/include"
  "${TFMXLIB_ROOT}"
  "${TFMXLIB_ROOT}/Chris"
  "${TFMXLIB_ROOT}/Jochen"
)

target_compile_options(${OUTPUT_NAME} PRIVATE -O2 -ffast-math -Wno-unused-variable -Wno-unused-but-set-variable)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_hc_init"
        "_hc_dispose"
        "_hc_create_player"
        "_hc_destroy_player"
        "_hc_load_instrument"
        "_hc_note_on"
        "_hc_note_off"
        "_hc_render"
        "_hc_set_param"
        "_hc_get_param"
    )

    # Join exported functions into a comma-separated list
    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createHippelCoSo'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake cmake ..)")
endif()
