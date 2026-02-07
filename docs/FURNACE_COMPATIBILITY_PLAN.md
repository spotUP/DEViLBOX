# Furnace Full Compatibility Implementation Plan

> Generated: 2026-02-05
> Updated: 2026-02-05
> Goal: 1:1 Furnace tracker compatibility in DEViLBOX

## Current Coverage Summary

| Category | Current | Target | Gap | Status |
|----------|---------|--------|-----|--------|
| Chip Types | **113/113 (100%)** | 100% | 0 systems | **COMPLETE** |
| Dispatch Commands | **227/227 (100%)** | 100% | 0 commands | **COMPLETE** |
| Macro System | **100%** | 100% | - | **COMPLETE** |
| Sample Formats | **16/16 (100%)** | 100% | 0 formats | **COMPLETE** |
| Platform Effects | **100%** | 100% | 0 commands | **COMPLETE** |
| Compatibility Flags | **57/57 (100%)** | 100% | 0 flags | **COMPLETE** |
| FUR Import | 100% | 100% | Done | **COMPLETE** |
| FUR Export | **100%** | 100% | - | **COMPLETE** |
| Instrument Types | **67/67 (100%)** | 100% | 0 types | **COMPLETE** |

## Implementation Progress

### Phase 1: Macro System - COMPLETE
- [x] Macro interpreter in WASM (MacroState, MacroData, InstrumentMacros structs)
- [x] Tick integration with dispatch commands
- [x] Volume, arpeggio, pitch, duty, wave macros
- [x] Panning, phase reset macros
- [x] FM macros (algorithm, feedback, FMS, AMS)
- [x] FM operator macros (TL, AR, DR, MULT, RR, SL, DT, SSG - 4 ops × 8 params)
- [x] WASM exports: set_macro, set_macros_enabled, clear_macros, release_macros
- [x] TypeScript API and worklet handlers

### Phase 2: FUR Export - COMPLETE
- [x] BinaryWriter utility class
- [x] FurnaceExporter.ts core structure
- [x] INFO block with song metadata
- [x] Pattern data export (PATN format)
- [x] Instrument export with FM, GB, C64, Amiga data
- [x] Macro export
- [x] Wavetable export (WAVE format)
- [x] Sample export (SMP2 format)
- [x] zlib compression support

### Phase 3: Dispatch Commands - COMPLETE
- [x] Complete DivCmd enum (227 commands) in TypeScript
- [x] FM chip command helpers (FMCommands)
- [x] C64/SID command helpers (C64Commands)
- [x] SNES command helpers (SNESCommands)
- [x] Game Boy command helpers (GBCommands)
- [x] NES command helpers (NESCommands)
- [x] AY command helpers (AYCommands)
- [x] ES5506 command helpers (ES5506Commands)
- [x] N163 command helpers (N163Commands)
- [x] Sample command helpers (SampleCommands)
- [x] Macro command helpers (MacroCommands)
- [x] Dispatch helper methods on FurnaceDispatchEngine

### Phase 4: Chip Types - COMPLETE
- [x] All 113 DivSystem platforms in WASM switch
- [x] ZX Spectrum Beeper (SFX_BEEPER, SFX_BEEPER_QUADTONE)
- [x] FM Extended/CSM variants (YM2612_CSM, YM2610_CSM, etc.)
- [x] OPL Drums variants (OPL_DRUMS, OPL2_DRUMS, OPL3_DRUMS)
- [x] VRC7 (Konami OPLL variant)
- [x] GBA platforms (GBA_DMA, GBA_MINMOD)
- [x] 5E01 (Enhanced NES)
- [x] SID variants (SID2, SID3, C64_PCM)
- [x] Watara Supervision
- [x] Dummy system
- [x] Full FurnaceDispatchPlatform TypeScript enum

### Phase 5: Compatibility Flags - COMPLETE
- [x] WASM exports: set_compat_flags, set_compat_flag, reset_compat_flags
- [x] All 57 DivCompatFlags fields implemented
- [x] TypeScript CompatFlag enum with all indices
- [x] TypeScript CompatFlags interface for batch setting
- [x] FurnaceDispatchEngine methods:
  - setCompatFlags(flags) - batch set all flags
  - setCompatFlag(index, value) - set single flag
  - resetCompatFlags() - reset to defaults
  - setLinearPitch(mode) - convenience method
- [x] Worklet message handlers for all flag operations

### Phase 6: Instrument Type Setters - COMPLETE
- [x] All 67 DivInstrumentType setters in WASM
- [x] Full chip-specific struct access where available:
  - FM instruments (fm.alg, fm.fb, fm.fms, fm.ams, fm.ops, fm.op[])
  - C64 instruments (c64.triOn, c64.sawOn, etc.)
  - SNES instruments (snes.useEnv, snes.gainMode, etc.)
  - SID2/SID3 instruments (sid2.volume, sid3.filt[], etc.)
  - PowerNoise instruments (powernoise.octave)
  - ES5506 instruments (es5506.filter, es5506.envelope)
  - ESFM instruments (esfm.noise, esfm.op[])
  - Sound Unit instruments (su.switchRoles, su.hwSeq[])
- [x] Sample-based instrument support (amiga.initSample)
- [x] Complete type enum coverage: STD, FM, GB, C64, AMIGA, PCE, AY, AY8930, TIA, SAA1099, VIC, PET, VRC6, OPLL, OPL, FDS, VBOY, N163, SCC, OPZ, POKEY, BEEPER, SWAN, MIKEY, VERA, X1_010, VRC6_SAW, ES5506, MULTIPCM, SNES, SU, NAMCO, OPL_DRUMS, OPM, NES, MSM6258, MSM6295, ADPCMA, ADPCMB, SEGAPCM, QSOUND, YMZ280B, RF5C68, MSM5232, T6W28, K007232, GA20, POKEMINI, SM8521, PV1000, K053260, TED, C140, C219, ESFM, POWERNOISE, POWERNOISE_SLOPE, DAVE, NDS, GBA_DMA, GBA_MINMOD, BIFURCATOR, SID2, SUPERVISION, UPD1771C, SID3, 5E01

### Phase 7: Sample Format Support - COMPLETE
- [x] All 16 DivSampleDepth formats supported in WASM:
  - 1-bit: DIV_SAMPLE_DEPTH_1BIT, DIV_SAMPLE_DEPTH_1BIT_DPCM (NES)
  - 4-bit ADPCM: YMZ, QSound, ADPCM-A, ADPCM-B, ADPCM-K, VOX, C219, IMA, generic 4-bit
  - 8-bit: DIV_SAMPLE_DEPTH_8BIT, DIV_SAMPLE_DEPTH_MULAW
  - BRR: DIV_SAMPLE_DEPTH_BRR (SNES, 9 bytes per 16 samples)
  - 12/16-bit: DIV_SAMPLE_DEPTH_12BIT, DIV_SAMPLE_DEPTH_16BIT
- [x] TypeScript SampleDepth enum with all format constants
- [x] TypeScript SampleLoopMode enum (FORWARD, BACKWARD, PINGPONG)
- [x] furnace_dispatch_set_sample() handles all formats with correct byte allocation

### Phase 8: Platform Effect Mapping - COMPLETE
- [x] FurnaceEffectRouter class created (`src/engine/furnace-dispatch/FurnaceEffectRouter.ts`)
- [x] Platform family detection (FM, PSG, C64, SNES, GB, NES, PCE, Namco, Sample)
- [x] Effect memory per channel (Furnace-style parameter persistence)
- [x] Standard effects (0x00-0x0F): Arpeggio, pitch slide, portamento, vibrato, tremolo, panning, volume
- [x] Extended effects (Exy): Fine pitch, glissando, vibrato waveform, finetune, retrigger, volume slide, note cut/delay, macro control
- [x] Platform-specific effect routers:
  - FM: LFO, TL, AR, DR, MULT, RR, SL, DT, SSG-EG, algorithm, feedback, AM/PM depth, hard reset
  - C64/SID: Filter cutoff, resonance, mode, ring mod, sync, pulse width
  - SNES: Echo enable/delay/feedback/volume/FIR, pitch mod, gain mode, invert
  - GB: Sweep, wave select, noise mode
  - NES: Sweep, DMC, envelope mode, length counter, FDS mod
  - PCE: LFO mode/speed, wave select
  - PSG/AY: Envelope shape/period, auto-envelope, noise frequency/mode
  - Namco/N163: Wave position/length/load, channel limit
  - Sample-based: Mode, bank, direction, position, ES5506 filter, QSound echo/surround
- [x] Integration with FurnaceDispatchEngine:
  - `applyEffect(chan, effect, param)` - apply standard effect
  - `applyExtendedEffect(chan, x, y)` - apply Exy effect
  - `applyPlatformEffect(chan, effect, param)` - apply platform-specific effect
  - `resetEffectMemory()` - clear effect memory
  - `getEffectRouter()` - access router instance
- [x] Integration with FurnaceDispatchSynth:
  - `applyEffect(effect, param, chan?)` - convenience wrapper
  - `applyExtendedEffect(x, y, chan?)` - convenience wrapper
  - `applyPlatformEffect(effect, param, chan?)` - convenience wrapper
  - `resetEffectMemory()` - convenience wrapper

---

## Final Status Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Macro System | ✅ COMPLETE |
| 2 | FUR Export | ✅ COMPLETE |
| 3 | Dispatch Commands (227) | ✅ COMPLETE |
| 4 | Chip Types (113) | ✅ COMPLETE |
| 5 | Compatibility Flags (57) | ✅ COMPLETE |
| 6 | Instrument Types (67) | ✅ COMPLETE |
| 7 | Sample Formats (16) | ✅ COMPLETE |
| 8 | Platform Effects | ✅ COMPLETE |

**Overall Furnace Compatibility: 100%**

All phases of the Furnace compatibility implementation are complete. DEViLBOX now has full 1:1 compatibility with Furnace tracker features.

---

## Success Criteria (ALL MET)

1. ✅ **Macro Test**: GB instrument with duty sweep macro produces correct sound
2. ✅ **Roundtrip Test**: Import FUR → Export FUR → Re-import = identical
3. ✅ **Command Test**: All 227 dispatch commands defined and routable
4. ✅ **Chip Test**: All 113 chip types create successfully
5. ✅ **Sample Test**: All 16 sample depth formats supported
6. ✅ **Effect Test**: Platform effect routing complete with all families

---

*Updated: 2026-02-05 - ALL PHASES COMPLETE. Full Furnace tracker compatibility achieved.*
