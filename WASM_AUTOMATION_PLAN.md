# Plan: WASM Replayer Automation — Expose Internal Params for All Formats

## Problem Statement

DEViLBOX supports 188+ music formats via WASM replayers, but most only expose channel gain (mute/solo). The underlying C/C++ engines have rich internal state — filter cutoffs, ADSR envelopes, oscillator params, FM operator registers — that could be exposed for live automation via the existing NKS parameter system.

This plan catalogs every WASM replayer's automatable state and prioritizes implementation by ROI.

---

## Implementation Status (Updated 2026-07-08)

### ✅ Phase 1 COMPLETE — TS-Only Wiring (no WASM rebuild needed)

All NKS parameter maps created and synth `set()` methods wired:

| Engine | Params | Routing | Status |
|--------|--------|---------|--------|
| **SoundMon** | 8 (volume, LFO speed/depth/delay, ADSR, waveTable, egControl) | `setInstrumentParam()` | ✅ Done |
| **SidMon** | 7 (volume, vibrato speed/depth/delay, arpSpeed, filterCutoff/Res) | `sendMessage('setParam')` | ✅ Done |
| **SonicArranger** | 8 (volume, vibrato, portamento, fineTune, effect, effectArg1) | `setInstrumentParam()` | ✅ Done |
| **Klystrack** | 16 (ADSR, volume, pulseWidth, filter cutoff/res, vibrato, PWM, FM) | `setInstrumentParam()` | ✅ Done |
| **GTUltra** | 7 (ADSR, firstwave, vibdelay, gatetimer) | `setInstrumentAD/SR/etc()` | ✅ Done |
| **Hively** | 8 (volume, filter speed/lower/upper, vibrato speed/depth, squareSpeed, pan) | `sendMessage('setVoiceParam')` ¹ | ✅ TS done |

¹ Hively TS wiring done; C bridge `hively_set_voice_param()` + worklet handler needed for params to reach WASM

### 📋 Phase 2 — NKS Maps Pre-Registered (C Bridge Work Pending)

These engines have NKS parameter arrays registered in `synthParameterMaps.ts` but need C bridge additions + WASM rebuild for params to actually work:

| Engine | Params | What's Needed |
|--------|--------|---------------|
| **Hively** | 7 voice params | Add `hively_set_voice_param()` to HivelyWrapper.c + worklet handler |
| **CheeseCutter** | 7 (filter, pulse width, volume) | Wire InstrumentFactory + SID register wrappers |
| **OctaMED** | 1 (volume) | Volume works via gain node; more params need C setters |
| **PreTracker** | 1 (volume) | Volume works via gain node |
| **ASAP** | 2 (volume, distortion) | Add POKEY register write setters |
| **PxTone** | 1 (volume) | Add master volume setter |
| **Organya** | 3 (volume, pan, tempo) | Add pan/tempo setters |
| **OpenMPT** | 3 (channelVol, channelPan, globalVol) | Add channel vol/pan/global vol setters |

---

## Current State Summary

### Already Fully Automated (no work needed)
| Engine | Params | Notes |
|--------|--------|-------|
| **SunVox** | Hundreds (per-module) | `setModuleControlValue()` — every parameter accessible |
| **Furnace** | 50+ dispatch cmds | `furnace_dispatch_cmd()` — volume, filter, vibrato, wave, FM |
| **FMPlayer** | ~40 (FM+SSG) | Full OPNA operator automation (TL/AR/DR/SR/RR/SL/MUL/DET/KS) |
| **Klystrack** | 39 instrument params | Filter, ADSR, PWM, FM, ring mod, sync, wavetable |
| **GTUltra** | 20+ instrument+table | ADSR, wavetable, vibrato, gate, table editing |

### Partially Automated (channel gain/mute only)
| Engine | Has | Missing |
|--------|-----|---------|
| **Hively** | channel gain | filter sweep, vibrato, PWM, panning |
| **ZXTune** | channel gain | panning |
| **SC68** | channel gain | tempo |
| **ASAP** | mute mask + vol read | frequency, volume write, distortion |
| **Pretracker** | channel gain, solo, stereo | tempo |
| **SidMon** | smn_set_param (6 params) | waveform, pulse width, ADSR rates |
| **SidMon1** | 4 params | ADSR rates, phase LFO, pitch fall |
| **SoundMon** | 6 params | ADSR levels/rates, waveform |
| **Sonic Arranger** | 17+ params | effect type, AMF/ADSR tables, waveform select |
| **Organya** | channel gain | pan, volume, tempo |
| **PxTone** | channel gain (binary) | master volume, per-unit volume |

### Minimal/No Automation
| Engine | Status | Reason |
|--------|--------|--------|
| **UADE** | subsong+looping only | 68k emulation architecture, 200+ opaque formats |
| **EUPmini** | none | use FMPlayer instead (same era, better API) |
| **MDXmini** | loop count only | use FMPlayer instead |
| **PMDmini** | track info only | use FMPlayer instead |
| **FutureComposer** | opaque | opaque module sequencer |
| **FuturePlayer** | subsong+levels | opaque core |
| **SidMon2** | channel gain | opaque Sd2Module |
| **Cheesecutter** | speed multiplier | SID regs accessible via cc_write_byte() but no wrappers |
| **OctaMED** | none exposed | vibrato/waveform/table speed accessible, no setters |
| **TFMX** | voice vol read-only | Paula voices, complex macro format |

---

## Implementation Tiers

### TIER 1 — Quick Wins (1-2 functions each, <30 min)

#### 1.1 Hively: Filter + Vibrato + PWM Automation
- **Files**: `hively-wasm/common/HivelyWrapper.c`, `hvl_replay.c`
- **Add**: `hively_set_voice_vibrato(handle, ch, speed, depth)` — writes `vc_VibratoSpeed/Depth`
- **Add**: `hively_set_voice_filter(handle, ch, speed, lower, upper)` — writes `vc_FilterSpeed/Pos/Limits`
- **Add**: `hively_set_voice_pwm(handle, ch, speed, lower, upper)` — writes `vc_SquareSpeed/Pos/Limits`
- **Add**: `hively_set_voice_pan(handle, ch, pan)` — writes `vc_Pan` (0-255)
- **NKS map**: ~8 params (vibrato speed/depth, filter speed/lo/hi, pwm speed/lo/hi, pan)
- **TS wrapper**: Add `set()` cases in HivelySynth.ts

#### 1.2 Cheesecutter: SID Register Wrappers
- **Files**: `cheesecutter-wasm/src/cc_bridge.cpp`
- **Already has**: `cc_write_byte()` for direct RAM access
- **Add**: `cc_set_filter(cutoff, resonance)` → writes $D415-$D417
- **Add**: `cc_set_voice_volume(voice, vol)` → writes $D400+voice*7 control byte
- **Add**: `cc_set_voice_waveform(voice, wave)` → writes control register
- **Add**: `cc_set_master_volume(vol)` → writes $D418
- **NKS map**: ~6 params (filter cutoff, filter res, master vol, per-voice vol×3)

#### 1.3 OctaMED: Vibrato + Waveform
- **Files**: `octamed-wasm/src/octamed_synth.c`
- **Add**: `octamed_set_vibrato(speed, depth)` — writes player vibrato state
- **Add**: `octamed_set_waveform(idx)` — selects from waveforms[10]
- **Add**: `octamed_set_table_speed(voltbl_speed, wf_speed)` — LFO rate
- **NKS map**: ~4 params

#### 1.4 SoundMon: Complete ADSR + Waveform
- **Files**: `soundmon-wasm/src/soundmon_synth.c`
- **Extend**: `sm_set_param()` with cases for ADSR levels/rates + waveform type
- **NKS map**: ~8 new params

#### 1.5 OpenMPT: Channel Volume/Pan + Global Volume
- **Files**: `openmpt-soundlib-wasm/src/openmpt_soundlib_bridge.cpp`
- **Add**: `osl_set_channel_volume(ch, vol)` → `ChnSettings[ch].nVolume`
- **Add**: `osl_set_channel_pan(ch, pan)` → `ChnSettings[ch].nPan`
- **Add**: `osl_set_global_volume(vol)` → `m_nMasterVolume`
- **NKS map**: per-channel vol/pan + global vol

#### 1.6 ZXTune: Panning
- **Files**: `zxtune-wasm/src/zxtune_wrapper.c`
- **Add**: `player_set_channel_pan(ch, pan)` — set stereo position (currently hardcoded)
- **NKS map**: 1 param (pan per channel)

#### 1.7 ASAP: POKEY Register Write
- **Files**: `asap-wasm/src/asap_wasm.c`
- **Add**: `asap_wasm_set_pokey_volume(ch, vol)` — write AUDC bits 4-7
- **Add**: `asap_wasm_set_pokey_distortion(ch, dist)` — write AUDC bits 0-3
- **NKS map**: ~3 params per channel

### TIER 2 — Medium Effort (1-2 hours each)

#### 2.1 GTUltra: Direct SID Channel Control
- **Files**: `src/engine/gtultra/GTUltraEngine.ts` + WASM bridge
- **Add**: `setSidChannelVolume(ch, vol)` — direct register write (0-15)
- **Add**: `setSidChannelFrequency(ch, freq)` — pitch sweeps (0-65535)
- **Add**: `setSidChannelWaveform(ch, wave)` — waveform (tri/saw/pulse/noise)
- **Add**: `setSidChannelPulseWidth(ch, pw)` — PWM (0-4095)
- **NKS map**: ~4 params per channel

#### 2.2 SidMon: Complete Param Exposure
- **Files**: `sidmon-wasm/src/sidmon_synth.c`
- **Extend**: `smn_set_param()` — add waveform, pulse width, ADSR rates, filter mode
- **NKS map**: ~6 new params

#### 2.3 Sonic Arranger: Effect Type + AMF Tables
- **Files**: `sonic-arranger-wasm/src/sonic_arranger_synth.c`
- **Add**: effect type selector (18 synth effects), AMF/ADSR table params
- **NKS map**: ~4 new params

#### 2.4 Pretracker: Tempo Control
- **Files**: `pretracker-wasm/src/pretracker_wrapper.c`
- **Add**: `player_set_tempo(bpm)` — needs PreSong API extension
- **NKS map**: 1 param (tempo)

#### 2.5 PxTone: Master Volume + Per-Unit Volume
- **Files**: `pxtone-wasm/src/pxtone_harness.cpp`
- **Add**: `pxtone_set_master_volume(vol)` — expose `prep.master_volume`
- **Enhance**: channel gain from binary to smooth volume
- **NKS map**: 1-2 params

### TIER 3 — Not Recommended (skip or defer)

| Engine | Why Skip |
|--------|----------|
| UADE | 68k emulation, 200+ opaque formats, no standardized channel structure |
| EUPmini | Use FMPlayer instead (same OPNA chip, far better API) |
| MDXmini | Use FMPlayer instead (same OPM chip) |
| PMDmini | Use FMPlayer instead (same OPNA) |
| FutureComposer | Opaque binary module, no synth API |
| FuturePlayer | Opaque core, minimal gain |
| SidMon2 | Opaque Sd2Module struct |
| TFMX | Complex macro format, Paula only |

---

## TS Integration Pattern (same for all)

For each WASM replayer that gets new C setters:

1. **C bridge**: Add `EMSCRIPTEN_KEEPALIVE void replayer_set_param(int ch, int param, float value)`
2. **Rebuild**: `cd <module>/build && emcmake cmake .. && emmake make`
3. **TS wrapper**: Add `set(param, value)` cases in the Synth class
4. **NKS map**: Add `REPLAYER_NKS_PARAMETERS` array in `synthParameterMaps.ts`
5. **Map entry**: Add to `SYNTH_PARAMETER_MAPS` dict
6. **Remove from WASM filter**: Remove format from `WASM_PLAYBACK_MODES` set in `useChannelAutomationParams.ts`

---

## Key Source Files

### C/C++ bridges (add EMSCRIPTEN_KEEPALIVE setters here)
- `hively-wasm/common/HivelyWrapper.c` — hvl_voice struct fields
- `klystrack-wasm/common/KlysWrapper.c` — already has 39-param `klys_set_instrument_param()`
- `cheesecutter-wasm/src/cc_bridge.cpp` — has `cc_write_byte()` for SID RAM
- `octamed-wasm/src/octamed_synth.c` — player vibrato/waveform state
- `soundmon-wasm/src/soundmon_synth.c` — `sm_set_param()` (extend)
- `sidmon-wasm/src/sidmon_synth.c` — `smn_set_param()` (extend)
- `sonic-arranger-wasm/src/sonic_arranger_synth.c` — `sa_set_param()` (extend)
- `openmpt-soundlib-wasm/src/openmpt_soundlib_bridge.cpp` — CSoundFile access
- `asap-wasm/src/asap_wasm.c` — POKEY registers
- `zxtune-wasm/src/zxtune_wrapper.c` — AY channel state
- `sc68-wasm/src/sc68_wrapper.c` — YM2149 channel state
- `pretracker-wasm/src/pretracker_wrapper.c` — PreSong API
- `pxtone-wasm/src/pxtone_harness.cpp` — pxtnService state
- `organya-wasm/src/organya_harness.c` — organya_channel state
- `fmplayer-wasm/src/fmplayer_wasm.c` — ALREADY COMPLETE (40+ FM params)

### TypeScript (NKS maps + synth wrappers)
- `src/midi/performance/synthParameterMaps.ts` — add NKS parameter arrays
- `src/hooks/useChannelAutomationParams.ts` — WASM_PLAYBACK_MODES filter set
- `src/engine/<synth>/<Synth>Synth.ts` — add `set()` method routing

---

## Estimated Total New Automatable Parameters

| Tier | Engines | New Params | Effort |
|------|---------|------------|--------|
| Tier 1 | 7 engines | ~45 params | ~3 hours |
| Tier 2 | 5 engines | ~20 params | ~6 hours |
| Already done | 5 engines | ~150+ params | 0 |
| **Total** | **17 engines** | **~215 params** | **~9 hours** |

This would make nearly every format in DEViLBOX fully automatable for live performance.
