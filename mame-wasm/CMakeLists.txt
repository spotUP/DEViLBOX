# MAME Sound Chip WASM Build Configuration for DEViLBOX
# Compiles MAME sound chip emulators to WebAssembly
# Only chips NOT already covered by Furnace are included here
cmake_minimum_required(VERSION 3.20)
project(DEViLBOX_MAME_WASM VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# Emscripten-specific settings
if(EMSCRIPTEN)
    message(STATUS "Building MAME sound chips for WebAssembly with Emscripten")
else()
    message(FATAL_ERROR "This project must be built with Emscripten. Use: emcmake cmake ..")
endif()

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../public/mame)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../public/mame)

# Common include paths
include_directories(
    ${CMAKE_SOURCE_DIR}/common
    ${CMAKE_SOURCE_DIR}/mame-compat
)

# ============================================================================
# SCSP (Sega Saturn YMF292-F) - 32-voice sampler with FM
# ============================================================================
add_subdirectory(scsp)

# ============================================================================
# AICA (Sega Dreamcast) - 64-voice sampler with ADPCM
# ============================================================================
add_subdirectory(aica)

# ============================================================================
# CEM3394 (Curtis Electromusic) - Analog synth voice
# ============================================================================
add_subdirectory(cem3394)

# ============================================================================
# YMF271 (Yamaha OPX) - 4-operator FM synthesizer
# ============================================================================
add_subdirectory(ymf271)

# ============================================================================
# K054539 (Konami) - 8-channel PCM/ADPCM
# ============================================================================
add_subdirectory(k054539)

# ============================================================================
# C352 (Namco) - 32-voice PCM
# ============================================================================
add_subdirectory(c352)

# ============================================================================
# RF5C400 (Ricoh) - 32-voice PCM with envelopes
# ============================================================================
add_subdirectory(rf5c400)

# ============================================================================
# ICS2115 (ICS WaveFront) - 32-voice wavetable synthesizer
# ============================================================================
add_subdirectory(ics2115)

# ============================================================================
# SN76477 (TI) - Complex Sound Generator (Space Invaders chip)
# ============================================================================
add_subdirectory(sn76477)

# ============================================================================
# ES5503 (Ensoniq DOC) - 32-voice wavetable synthesizer
# ============================================================================
add_subdirectory(es5503)

# ============================================================================
# YMOPQ (Yamaha YM3806) - 4-operator FM synthesizer (8 channels)
# ============================================================================
add_subdirectory(ymopq)

# ============================================================================
# MSM5232 (OKI) - 8-channel tone generator with organ stops
# ============================================================================
add_subdirectory(msm5232)

# ============================================================================
# Astrocade (Bally) - 3-voice tone + vibrato + noise
# ============================================================================
add_subdirectory(astrocade)

# ============================================================================
# SNKWave (SNK) - Programmable wavetable generator
# ============================================================================
add_subdirectory(snkwave)

# ============================================================================
# SP0250 (GI) - Digital LPC Sound Synthesizer
# ============================================================================
add_subdirectory(sp0250)

# ============================================================================
# Votrax SC-01 - Formant Speech Synthesizer (64 phonemes)
# ============================================================================
add_subdirectory(votrax)

# ============================================================================
# TMS36XX (TI) - Tone Matrix Synthesizer (organ stops)
# ============================================================================
add_subdirectory(tms36xx)

# ============================================================================
# MEA8000 (Philips) - 4-Formant Speech Synthesizer
# ============================================================================
add_subdirectory(mea8000)

# ============================================================================
# TMS5220 (TI) - LPC Speech Synthesizer (Speak & Spell)
# ============================================================================
add_subdirectory(tms5220)

# ============================================================================
# uPD933 (NEC/Casio) - Phase Distortion Synthesis (CZ-series)
# ============================================================================
add_subdirectory(upd933)

# ============================================================================
# TIA (Atari) - Television Interface Adaptor Sound (Atari 2600)
# ============================================================================
add_subdirectory(tia)

# ============================================================================
# uPD931 (NEC/Casio) - Dual Waveform Keyboard Synthesizer
# ============================================================================
add_subdirectory(upd931)

# ============================================================================
# ASC (Apple Sound Chip) - 4-voice wavetable synthesizer
# ============================================================================
add_subdirectory(asc)

# ============================================================================
# VASynth (Virtual Analog) - Subtractive synthesizer (RC env + TPT LPF + VCA)
# ============================================================================
add_subdirectory(vasynth)

# ============================================================================
# TR-707 (Roland) - 10-voice PCM drum machine with analog signal conditioning
# ============================================================================
add_subdirectory(tr707)

# ============================================================================
# Roland SA - Silicon-accurate 16-voice sample player (gate array emulation)
# ============================================================================
add_subdirectory(roland_sa)

# ============================================================================
# Combined build target
# ============================================================================
add_custom_target(all_mame_chips
    DEPENDS SCSP_WASM AICA_WASM CEM3394_WASM YMF271_WASM K054539_WASM C352_WASM RF5C400_WASM ICS2115_WASM SN76477_WASM ES5503_WASM YMOPQ_WASM MSM5232_WASM ASTROCADE_WASM SNKWAVE_WASM SP0250_WASM VOTRAX_WASM TMS36XX_WASM MEA8000_WASM TMS5220_WASM UPD933_WASM TIA_WASM UPD931_WASM ASC_WASM VASYNTH_WASM TR707_WASM RolandSA_WASM
    COMMENT "Building all MAME sound chip emulators"
)
