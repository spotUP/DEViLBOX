cmake_minimum_required(VERSION 3.20)
project(FurnaceDispatch VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Must build with Emscripten: emcmake cmake ..")
endif()

# Furnace source tree location
set(FURNACE_ROOT "${CMAKE_SOURCE_DIR}/../Reference Code/furnace-master")
set(FURNACE_SRC "${FURNACE_ROOT}/src")
set(FURNACE_ENGINE "${FURNACE_SRC}/engine")
set(FURNACE_PLATFORM "${FURNACE_ENGINE}/platform")
set(FURNACE_SOUND "${FURNACE_PLATFORM}/sound")
set(FURNACE_EXTERN "${FURNACE_ROOT}/extern")
set(VGSOUND_EMU "${FURNACE_EXTERN}/vgsound_emu-modified/vgsound_emu/src")

# ============================================================
# Build ALL platforms (1:1 with Furnace)
# ============================================================
option(BUILD_ALL_PLATFORMS "Build all Furnace platforms" ON)

# ============================================================
# Common source files
# ============================================================
set(COMMON_SOURCES
  # Our WASM wrapper and engine stub
  common/FurnaceDispatchWrapper.cpp
  common/DivEngineStub.cpp
  common/InstrumentStub.cpp

  # Furnace engine core
  ${FURNACE_ENGINE}/macroInt.cpp
  ${FURNACE_ENGINE}/waveSynth.cpp
  ${FURNACE_ENGINE}/filter.cpp

  # DivDispatch base class
  ${FURNACE_PLATFORM}/abstract.cpp

  # blip_buf resampling
  ${FURNACE_EXTERN}/blip_buf/blip_buf.c
)

# ============================================================
# ALL Platform Dispatches (1:1 with Furnace CMakeLists.txt)
# ============================================================
set(PLATFORM_SOURCES
  # === Console Platforms ===
  ${FURNACE_PLATFORM}/gb.cpp
  ${FURNACE_PLATFORM}/nes.cpp
  ${FURNACE_PLATFORM}/pce.cpp
  ${FURNACE_PLATFORM}/sms.cpp
  ${FURNACE_PLATFORM}/snes.cpp
  ${FURNACE_PLATFORM}/swan.cpp
  ${FURNACE_PLATFORM}/lynx.cpp
  ${FURNACE_PLATFORM}/vb.cpp
  ${FURNACE_PLATFORM}/nds.cpp
  ${FURNACE_PLATFORM}/gbadma.cpp
  ${FURNACE_PLATFORM}/gbaminmod.cpp
  ${FURNACE_PLATFORM}/pokemini.cpp
  ${FURNACE_PLATFORM}/supervision.cpp

  # === NES Expansion ===
  ${FURNACE_PLATFORM}/fds.cpp
  ${FURNACE_PLATFORM}/mmc5.cpp
  ${FURNACE_PLATFORM}/n163.cpp
  ${FURNACE_PLATFORM}/vrc6.cpp

  # === Commodore ===
  ${FURNACE_PLATFORM}/c64.cpp
  ${FURNACE_PLATFORM}/pet.cpp
  ${FURNACE_PLATFORM}/vic20.cpp
  ${FURNACE_PLATFORM}/ted.cpp

  # === Atari ===
  ${FURNACE_PLATFORM}/tia.cpp
  ${FURNACE_PLATFORM}/pokey.cpp

  # === PSG Chips ===
  ${FURNACE_PLATFORM}/ay.cpp
  ${FURNACE_PLATFORM}/ay8930.cpp
  ${FURNACE_PLATFORM}/saa.cpp
  ${FURNACE_PLATFORM}/t6w28.cpp

  # === FM Chips (Yamaha) ===
  ${FURNACE_PLATFORM}/genesis.cpp
  ${FURNACE_PLATFORM}/genesisext.cpp
  ${FURNACE_PLATFORM}/arcade.cpp
  ${FURNACE_PLATFORM}/tx81z.cpp
  ${FURNACE_PLATFORM}/ym2203.cpp
  ${FURNACE_PLATFORM}/ym2203ext.cpp
  ${FURNACE_PLATFORM}/ym2608.cpp
  ${FURNACE_PLATFORM}/ym2608ext.cpp
  ${FURNACE_PLATFORM}/ym2610.cpp
  ${FURNACE_PLATFORM}/ym2610ext.cpp
  ${FURNACE_PLATFORM}/ym2610b.cpp
  ${FURNACE_PLATFORM}/ym2610bext.cpp
  ${FURNACE_PLATFORM}/opl.cpp
  ${FURNACE_PLATFORM}/opll.cpp
  ${FURNACE_PLATFORM}/esfm.cpp
  # Interface files for FM
  ${FURNACE_PLATFORM}/oplAInterface.cpp
  ${FURNACE_PLATFORM}/ym2608Interface.cpp
  ${FURNACE_PLATFORM}/ym2610Interface.cpp

  # === Sample-based Chips ===
  ${FURNACE_PLATFORM}/amiga.cpp
  ${FURNACE_PLATFORM}/segapcm.cpp
  ${FURNACE_PLATFORM}/multipcm.cpp
  ${FURNACE_PLATFORM}/qsound.cpp
  ${FURNACE_PLATFORM}/rf5c68.cpp
  ${FURNACE_PLATFORM}/pcmdac.cpp
  ${FURNACE_PLATFORM}/es5506.cpp
  ${FURNACE_PLATFORM}/k007232.cpp
  ${FURNACE_PLATFORM}/k053260.cpp
  ${FURNACE_PLATFORM}/ga20.cpp
  ${FURNACE_PLATFORM}/c140.cpp
  ${FURNACE_PLATFORM}/ymz280b.cpp
  ${FURNACE_PLATFORM}/msm6258.cpp
  ${FURNACE_PLATFORM}/msm6295.cpp

  # === Wavetable Chips ===
  ${FURNACE_PLATFORM}/scc.cpp
  ${FURNACE_PLATFORM}/namcowsg.cpp
  ${FURNACE_PLATFORM}/bubsyswsg.cpp
  ${FURNACE_PLATFORM}/x1_010.cpp
  ${FURNACE_PLATFORM}/vera.cpp
  ${FURNACE_PLATFORM}/su.cpp

  # === Other Chips ===
  ${FURNACE_PLATFORM}/pcspkr.cpp
  ${FURNACE_PLATFORM}/pong.cpp
  ${FURNACE_PLATFORM}/pv1000.cpp
  ${FURNACE_PLATFORM}/scvtone.cpp
  ${FURNACE_PLATFORM}/msm5232.cpp
  ${FURNACE_PLATFORM}/sm8521.cpp
  ${FURNACE_PLATFORM}/dave.cpp
  ${FURNACE_PLATFORM}/bifurcator.cpp
  ${FURNACE_PLATFORM}/powernoise.cpp
  ${FURNACE_PLATFORM}/zxbeeper.cpp
  ${FURNACE_PLATFORM}/zxbeeperquadtone.cpp
  ${FURNACE_PLATFORM}/sid2.cpp
  ${FURNACE_PLATFORM}/sid3.cpp

  # === Dummy ===
  ${FURNACE_PLATFORM}/dummy.cpp
)

# ============================================================
# Sound Cores (1:1 with Furnace CMakeLists.txt)
# ============================================================
set(SOUND_CORE_SOURCES
  # === PSG ===
  ${FURNACE_SOUND}/sn76496.cpp
  ${FURNACE_SOUND}/ay8910.cpp
  ${FURNACE_SOUND}/saa1099.cpp

  # === Game Boy ===
  ${FURNACE_SOUND}/gb/apu.c
  ${FURNACE_SOUND}/gb/timing.c

  # === NES (puNES core) ===
  ${FURNACE_SOUND}/nes/apu.cpp
  ${FURNACE_SOUND}/nes/fds.cpp
  ${FURNACE_SOUND}/nes/mmc5.cpp

  # === NES (NSFPlay core) ===
  ${FURNACE_SOUND}/nes_nsfplay/5e01_apu.cpp
  ${FURNACE_SOUND}/nes_nsfplay/5e01_dmc.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_apu.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_dmc.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_fds.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_mmc5.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_n106.cpp
  ${FURNACE_SOUND}/nes_nsfplay/nes_vrc6.cpp

  # === PCE ===
  ${FURNACE_SOUND}/pce_psg.cpp

  # === ymfm (FM synthesis) ===
  ${FURNACE_SOUND}/ymfm/ymfm_adpcm.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_opl.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_opm.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_opn.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_opz.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_pcm.cpp
  ${FURNACE_SOUND}/ymfm/ymfm_ssg.cpp

  # === SID (reSID) ===
  ${FURNACE_SOUND}/c64/sid.cc
  ${FURNACE_SOUND}/c64/voice.cc
  ${FURNACE_SOUND}/c64/wave.cc
  ${FURNACE_SOUND}/c64/envelope.cc
  ${FURNACE_SOUND}/c64/filter.cc
  ${FURNACE_SOUND}/c64/extfilt.cc
  ${FURNACE_SOUND}/c64/pot.cc
  ${FURNACE_SOUND}/c64/version.cc
  ${FURNACE_SOUND}/c64/wave6581_PS_.cc
  ${FURNACE_SOUND}/c64/wave6581_PST.cc
  ${FURNACE_SOUND}/c64/wave6581_P_T.cc
  ${FURNACE_SOUND}/c64/wave6581__ST.cc
  ${FURNACE_SOUND}/c64/wave8580_PS_.cc
  ${FURNACE_SOUND}/c64/wave8580_PST.cc
  ${FURNACE_SOUND}/c64/wave8580_P_T.cc
  ${FURNACE_SOUND}/c64/wave8580__ST.cc

  # === SID (reSIDfp) ===
  ${FURNACE_SOUND}/c64_fp/array.cpp
  ${FURNACE_SOUND}/c64_fp/Dac.cpp
  ${FURNACE_SOUND}/c64_fp/EnvelopeGenerator.cpp
  ${FURNACE_SOUND}/c64_fp/ExternalFilter.cpp
  ${FURNACE_SOUND}/c64_fp/Filter.cpp
  ${FURNACE_SOUND}/c64_fp/Filter6581.cpp
  ${FURNACE_SOUND}/c64_fp/Filter8580.cpp
  ${FURNACE_SOUND}/c64_fp/FilterModelConfig.cpp
  ${FURNACE_SOUND}/c64_fp/FilterModelConfig6581.cpp
  ${FURNACE_SOUND}/c64_fp/FilterModelConfig8580.cpp
  ${FURNACE_SOUND}/c64_fp/Integrator6581.cpp
  ${FURNACE_SOUND}/c64_fp/Integrator8580.cpp
  ${FURNACE_SOUND}/c64_fp/OpAmp.cpp
  ${FURNACE_SOUND}/c64_fp/SID.cpp
  ${FURNACE_SOUND}/c64_fp/Spline.cpp
  ${FURNACE_SOUND}/c64_fp/WaveformCalculator.cpp
  ${FURNACE_SOUND}/c64_fp/WaveformGenerator.cpp
  ${FURNACE_SOUND}/c64_fp/resample/SincResampler.cpp

  # === SID (dSID) ===
  ${FURNACE_SOUND}/c64_d/dsid.c

  # === SID2 ===
  ${FURNACE_SOUND}/sid2/envelope.cc
  ${FURNACE_SOUND}/sid2/filter.cc
  ${FURNACE_SOUND}/sid2/sid.cc
  ${FURNACE_SOUND}/sid2/version.cc
  ${FURNACE_SOUND}/sid2/voice.cc
  ${FURNACE_SOUND}/sid2/wave8580_PS_.cc
  ${FURNACE_SOUND}/sid2/wave8580_PST.cc
  ${FURNACE_SOUND}/sid2/wave8580_P_T.cc
  ${FURNACE_SOUND}/sid2/wave8580__ST.cc
  ${FURNACE_SOUND}/sid2/wave.cc

  # === SID3 ===
  ${FURNACE_SOUND}/sid3.c

  # === TIA (Atari 2600) ===
  ${FURNACE_SOUND}/tia/Audio.cpp
  ${FURNACE_SOUND}/tia/AudioChannel.cpp

  # === POKEY (Atari 8-bit) ===
  ${FURNACE_SOUND}/pokey/mzpokeysnd.c
  ${FURNACE_SOUND}/pokey/AltASAP.cpp

  # === Namco ===
  ${FURNACE_SOUND}/namco.cpp
  ${FURNACE_SOUND}/segapcm.cpp

  # === SNES ===
  ${FURNACE_SOUND}/snes/SPC_DSP.cpp

  # === Lynx ===
  ${FURNACE_SOUND}/lynx/Mikey.cpp

  # === Swan ===
  ${FURNACE_SOUND}/swan.c
  ${FURNACE_SOUND}/swan_mdfn.cpp

  # === VB (Virtual Boy) ===
  ${FURNACE_SOUND}/vsu.cpp

  # === VERA (Commander X16) ===
  ${FURNACE_SOUND}/vera_psg.c
  ${FURNACE_SOUND}/vera_pcm.c

  # === YMF278B ===
  ${FURNACE_SOUND}/ymf278b/ymf278.cpp

  # === Atomic SSG ===
  ${FURNACE_SOUND}/atomicssg/ssg.c

  # === T6W28 ===
  ${FURNACE_SOUND}/t6w28/T6W28_Apu.cpp

  # === Other sound cores ===
  ${FURNACE_SOUND}/qsound.c
  ${FURNACE_SOUND}/c140_c219.c
  ${FURNACE_SOUND}/oki/okim6258.cpp
  ${FURNACE_SOUND}/oki/msm5232.cpp
  ${FURNACE_SOUND}/ga20/iremga20.cpp
  ${FURNACE_SOUND}/nds.cpp
  ${FURNACE_SOUND}/su.cpp
  ${FURNACE_SOUND}/dave/dave.cpp
  ${FURNACE_SOUND}/d65modified.c
  ${FURNACE_SOUND}/rf5c68.cpp
  ${FURNACE_SOUND}/sm8521.c
  ${FURNACE_SOUND}/supervision.c
  ${FURNACE_SOUND}/upd1771.cpp
  ${FURNACE_SOUND}/ted-sound.c
  ${FURNACE_SOUND}/vic20sound.c
  ${FURNACE_SOUND}/ymz280b.cpp
)

# ============================================================
# vgsound_emu (for N163, SCC, ES5506, K007232, K053260, etc.)
# ============================================================
set(VGSOUND_SOURCES
  ${VGSOUND_EMU}/core/vox/vox.cpp
  ${VGSOUND_EMU}/es550x/es550x.cpp
  ${VGSOUND_EMU}/es550x/es550x_alu.cpp
  ${VGSOUND_EMU}/es550x/es550x_filter.cpp
  ${VGSOUND_EMU}/es550x/es5504.cpp
  ${VGSOUND_EMU}/es550x/es5505.cpp
  ${VGSOUND_EMU}/es550x/es5506.cpp
  ${VGSOUND_EMU}/k005289/k005289.cpp
  ${VGSOUND_EMU}/k007232/k007232.cpp
  ${VGSOUND_EMU}/k053260/k053260.cpp
  ${VGSOUND_EMU}/msm6295/msm6295.cpp
  ${VGSOUND_EMU}/n163/n163.cpp
  ${VGSOUND_EMU}/scc/scc.cpp
  ${VGSOUND_EMU}/vrcvi/vrcvi.cpp
  ${VGSOUND_EMU}/x1_010/x1_010.cpp
)

# ============================================================
# External libraries
# ============================================================
set(EXTERN_SOURCES
  # Nuked cores
  ${FURNACE_EXTERN}/Nuked-PSG/ympsg.c
  ${FURNACE_EXTERN}/Nuked-OPLL/opll.c

  # opn/opl/opm (note: not Nuked-* directories)
  ${FURNACE_EXTERN}/opn/ym3438.c
  ${FURNACE_EXTERN}/opl/opl3.c
  ${FURNACE_EXTERN}/opm/opm.c

  # ESFM
  ${FURNACE_EXTERN}/ESFMu/esfm.c
  ${FURNACE_EXTERN}/ESFMu/esfm_registers.c

  # emu2413 (for OPLL)
  ${FURNACE_EXTERN}/emu2413/emu2413.c

  # SAA1099
  ${FURNACE_EXTERN}/SAASound/src/SAAAmp.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAADevice.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAAEnv.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAAFreq.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAAImpl.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAANoise.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAASndC.cpp
  ${FURNACE_EXTERN}/SAASound/src/SAASound.cpp

  # Power Noise
  ${FURNACE_EXTERN}/pwrnoise/pwrnoise.c

  # ADPCM codecs
  ${FURNACE_EXTERN}/adpcm/bs_codec.c
  ${FURNACE_EXTERN}/adpcm/oki_codec.c
  ${FURNACE_EXTERN}/adpcm/yma_codec.c
  ${FURNACE_EXTERN}/adpcm/ymb_codec.c
  ${FURNACE_EXTERN}/adpcm/ymz_codec.c

  # YM2608-LLE (OPNA cycle-accurate emulation)
  # Each of these files defines a chip type macro then includes fmopna_impl.c
  ${FURNACE_EXTERN}/YM2608-LLE/fmopna_2608.c
  ${FURNACE_EXTERN}/YM2608-LLE/fmopna_2610.c
  ${FURNACE_EXTERN}/YM2608-LLE/fmopna_2612.c
  # NOTE: fmopna_impl.c is included by the above, NOT compiled directly

  # YMF276-LLE (OPN2 cycle-accurate emulation)
  ${FURNACE_EXTERN}/YMF276-LLE/fmopn2.c

  # YMF262-LLE (OPL3 cycle-accurate emulation)
  ${FURNACE_EXTERN}/YMF262-LLE/fmopl3.c

  # YM3812-LLE (OPL2 cycle-accurate emulation)
  ${FURNACE_EXTERN}/YM3812-LLE/fmopl2.c
)

# Define all platforms are enabled
add_compile_definitions(
  FURNACE_BUILD_GB
  FURNACE_BUILD_NES
  FURNACE_BUILD_SMS
  FURNACE_BUILD_AY
  FURNACE_BUILD_GENESIS
  FURNACE_BUILD_ARCADE
  FURNACE_BUILD_PCE
  FURNACE_BUILD_C64
  FURNACE_BUILD_SNES
  FURNACE_BUILD_ALL
)

message(STATUS "Building: ALL Furnace platforms (1:1 with Furnace)")

# ============================================================
# Include paths
# ============================================================
include_directories(
  # Furnace engine
  ${FURNACE_ENGINE}
  ${FURNACE_PLATFORM}
  ${FURNACE_SOUND}
  ${FURNACE_SOUND}/gb
  ${FURNACE_SOUND}/nes
  ${FURNACE_SOUND}/nes_nsfplay
  ${FURNACE_SOUND}/ymfm
  ${FURNACE_SOUND}/c64
  ${FURNACE_SOUND}/c64_fp
  ${FURNACE_SOUND}/c64_d
  ${FURNACE_SOUND}/sid2
  ${FURNACE_SOUND}/snes
  ${FURNACE_SOUND}/lynx
  ${FURNACE_SOUND}/oki
  ${FURNACE_SOUND}/ga20
  ${FURNACE_SOUND}/dave
  ${FURNACE_SOUND}/tia
  ${FURNACE_SOUND}/pokey
  ${FURNACE_SOUND}/t6w28
  ${FURNACE_SOUND}/ymf278b
  ${FURNACE_SOUND}/atomicssg
  ${FURNACE_SRC}

  # External libraries
  ${FURNACE_EXTERN}/blip_buf
  ${FURNACE_EXTERN}/Nuked-PSG
  ${FURNACE_EXTERN}/Nuked-OPLL
  ${FURNACE_EXTERN}/opn
  ${FURNACE_EXTERN}/opl
  ${FURNACE_EXTERN}/opm
  ${FURNACE_EXTERN}/ESFMu
  ${FURNACE_EXTERN}/emu2413
  ${FURNACE_EXTERN}/SAASound/src
  ${FURNACE_EXTERN}/pwrnoise
  ${FURNACE_EXTERN}/adpcm
  ${FURNACE_EXTERN}/YM2608-LLE
  ${FURNACE_EXTERN}/YMF276-LLE
  ${FURNACE_EXTERN}/YMF262-LLE
  ${FURNACE_EXTERN}/YM3812-LLE
  ${FURNACE_EXTERN}/vgsound_emu-modified/vgsound_emu/src
  # For includes like "vgsound_emu/src/n163/n163.hpp"
  ${FURNACE_EXTERN}/vgsound_emu-modified

  # Our common headers
  ${CMAKE_SOURCE_DIR}/common
)

# ============================================================
# Build WASM executable
# ============================================================
add_executable(FurnaceDispatch
  ${COMMON_SOURCES}
  ${PLATFORM_SOURCES}
  ${SOUND_CORE_SOURCES}
  ${VGSOUND_SOURCES}
  ${EXTERN_SOURCES}
)

# Force-include our preemptive header
target_compile_options(FurnaceDispatch PRIVATE
  -include "${CMAKE_SOURCE_DIR}/common/furnace_preempt.h"
)

# Suppress warnings from Furnace source
target_compile_options(FurnaceDispatch PRIVATE
  -Wno-unused-variable
  -Wno-unused-but-set-variable
  -Wno-sign-compare
  -Wno-missing-field-initializers
  -Wno-deprecated-declarations
  -Wno-unused-parameter
  -Wno-unused-function
)

# Output configuration
set_target_properties(FurnaceDispatch PROPERTIES
  OUTPUT_NAME "FurnaceDispatch"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/furnace-dispatch"
)

# Emscripten link flags
target_link_options(FurnaceDispatch PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createFurnaceDispatch'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_furnace_init','_furnace_dispatch_create','_furnace_dispatch_destroy','_furnace_dispatch_reset','_furnace_dispatch_cmd','_furnace_dispatch_tick','_furnace_dispatch_render','_furnace_dispatch_get_num_channels','_furnace_dispatch_get_osc_needle','_furnace_dispatch_get_osc_data','_furnace_dispatch_mute','_furnace_dispatch_set_compat_flag','_furnace_dispatch_set_tick_rate','_furnace_dispatch_set_tuning','_furnace_dispatch_set_gb_instrument','_furnace_dispatch_set_wavetable','_furnace_dispatch_force_ins','_furnace_dispatch_poke']"
  "SHELL:-s INITIAL_MEMORY=33554432"
  "SHELL:-s STACK_SIZE=2097152"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  -O2
)
