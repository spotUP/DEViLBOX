---
date: 2026-03-08
topic: symphonie-pro-68k-transpile
tags: [symphonie, transpile, 68k, wasm]
status: draft
---

# Symphonie Pro 68k → C Transpilation Research

## Source File
- **Path:** `/Users/spot/Code/Reference Code/Symphonie/Symphonie Source.Assembler`
- **Size:** 46,023 lines, 777KB
- **Version:** Symphonie III v3.3d (Oct 2000)
- **CPU:** MC68020 minimum

## Key Facts
- UADE does NOT support Symphonie Pro (commented out in amifilemagic.c)
- No UADE ground truth available — must validate against existing JS worklet or rendered test files
- Current DEViLBOX impl: Pure JS AudioWorklet (`public/symphonie/Symphonie.worklet.js`)
- Supports up to 256 virtual channels mixed to 4 Paula outputs
- 16-bit Pro mode (not 8-bit JR mode) is what we need

## Architecture Overview
- Software mixer: N channels → 4 audio buffers → Paula DMA
- Audio IRQ double-buffer system
- Per-channel resonant filters (LP/HP/BP state-variable)
- DSP effects: Echo, CrossEcho, CenterEcho, Delay, Hall
- Fixed-point frequency stepping for sample playback
- Delta decompression for 16-bit samples

## Replayer Line Ranges (to extract)

| Subsystem | Lines | Key Labels |
|-----------|-------|------------|
| Constants & struct defs | 560-670, 2614-2832 | NOTE_, SONG_, SEQUENCE_, POSITION_ |
| Instrument structure | 30059-30085 | INSTR_ fields |
| VoiceExp/Buffer/Sample structs | 35117-35217 | VOICEEXP_, BUFFER_, SAMPLE_ |
| Play/Stop/Init | 33502-33520, 33735-33777, 34567-34983 | InitSong, PlayActualSong, StopSong |
| Pattern/sequence traversal | 32298-32478 | PlaySong, PlaySongData, PlayStereoPatLine |
| Note & effect processing | 32500-33500 | PlayLineNote, all FX handlers |
| Complex FX tables | 41414-41465 | ComplexFX_JMP |
| Sample start/trigger | 39425-39596 | StartSample |
| Freq table lookup/build | 35017-35130 | GetNoteFreq, BuildFreqList |
| Audio IRQ system | 35557-35726 | NewChangeSyncBuf |
| Buffer management | 35649-35679, 39104-39295 | ChangeBuffers, SetAudioRegisters |
| Mixer (CopyVoiceBuffer) | 36019-36161 | CopyVoiceBuffer |
| CopySample 16-bit | 38210-38670 | CopySample Pro version |
| Per-channel filter | 35773-35940 | ResoFilterPreMix/PostMix |
| Global post-mix filter | 32870-33080 | RTResoFilterPostMix |
| DSP echo/delay | 36779-37194 | CopyDSP_Echo, PrepPostDsp |
| Master volume | 36620-36700 | ProcMVol |
| Output & oversample | 36165-36400 | CopyBackStream, DoOversample |
| VoiceExp alloc | 35243-35400, 17741-17800 | GetVoiceExpander, InitVexVars2 |
| Delta decompression | 26768-26812 | DeltaPackModuleBlock |

## Data Structures

### NOTE (4 bytes)
- byte 0: FX command
- byte 1: pitch (0-84, 0xFF = no note)
- byte 2: volume (0-100 or command 242-254)
- byte 3: instrument number

### SAMPLE structure (256 bytes per channel)
- Full channel state: ptr, freq, volume, loop, sustain, effects, filter, LFOs
- Fixed-point frequency accumulator (HIOFFSET = fractional)

### Effects (23 total)
1-4: Volume/Pitch slide up/down
5-8: Sample replay/offset
9: Set speed
10-11: Add pitch/volume
12-14: Vibrato/Tremolo/Sample vibrato
15: Pitch slide to
16: Retrigger
17: Emphasis (volume fade)
18: Add semitone
19-20: Channel volume (panning)
23: Per-channel resonant filter
24-25: DSP echo/delay

### Volume Commands (in volume byte)
242-247: Pitch up/down at 3 speeds
249-250: Speed up/down
251: Key off
253: Continue sample
254: Stop sample

## Mixing Pipeline
```
CopyVoiceBuffer:
  ClearSample (zero mix buffers)
  For each channel pair (L/R):
    ResoFilterPreMix (redirect to filter buf if active)
    CopySample (mix channel into buffer with all effects)
    ResoFilterPostMix (apply per-channel filter)
  PostDSP effects
  PostMixDryWet (mix dry+wet)
  ProcMVol (master volume + balance)
  CopyBack (output format conversion)
```

## Filter Algorithm (State Variable, 2-pole)
```
hp = input - lp
bp += freq * hp >> 8
lp += freq * bp >> 6
lp += reso * lp >> 6
lp >>= 2
Output: LP=lp, HP=hp, BP=(input-hp-lp)
```

## Transpilation Strategy

Since UADE doesn't support this format, validation approach:
1. Transpile replayer core to C
2. Build as standalone player + WASM module
3. Compare output against existing JS worklet (which is known to have bugs)
4. Compare against actual .symmod files played on WinUAE/FS-UAE if possible
5. Use test modules from `/Users/spot/Music/Amiga/SymMOD/` (if available)

### Estimated scope
- ~5000 lines of replayer ASM to transpile
- Complex mixer with per-channel effects
- Per-channel resonant filters
- DSP ring buffer effects
- 16-bit sample mixing with fixed-point math
