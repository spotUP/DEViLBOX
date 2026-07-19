---
date: 2026-04-12
topic: unified-sid-synth-editor
tags: [sid, synth-editor, goattracker, cheesecutter, sidmon]
status: final
---

# Unified SID Synth Editor — Research

## Three Formats, Same Chip

All three formats program the MOS 6581/8580 SID chip. The difference is HOW:

### GoatTracker Ultra (.sng)
- **Per-instrument**: AD, SR, firstwave, gatetimer, vibdelay, panning, 4 table pointers
- **Global tables**: Wave (255×2 hex), Pulse (255×2 hex), Filter (255×2 hex), Speed (255×2 hex)
- **Tables are programs**: sequential execution with commands (F0-FE), delays, jumps, end markers
- **Quirks**: 1-based pointers, inverted hard-restart bit, panning packed in nibbles
- **UI**: 4 tabs (Instrument, Sound Designer, Tables, SID Monitor)
- **Files**: `GTUltraControls.tsx`, `GTSoundDesigner.tsx`, `GTTableCodec.ts`, `GTVisualMapping.ts`
- **Engine API**: `setInstrumentAD/SR/Firstwave/TablePtr/Vibdelay/Gatetimer`, `setTableEntry`, `requestSidRegisters`
- **Type**: `exotic.ts:660-671` (GTUltraConfig)

### CheeseCutter (.ct)
- **Per-instrument**: AD, SR, wavePtr, pulsePtr, filterPtr + 3 unknown bytes (8 bytes total, 48 max instruments)
- **Global tables**: Wavetable (2×256), Pulse (256), Filter (256), Command (256)
- **Memory model**: 64KB C64 RAM image, column-major instrument storage
- **Quirks**: Load-time only (no runtime param editing via WASM bridge), instrument names at fixed offset 0x101A5
- **UI**: Pattern tracker only — NO instrument editor exists
- **WASM API**: Only `cc_load()`, `cc_render()`, `cc_get_sid_regs()` — no per-instrument setters
- **Parser**: `CheeseCutterParser.ts`, store: `useCheeseCutterStore.ts`

### SidMon II (.sd2)
- **Per-instrument**: waveform (0-3), pulseWidth, ADSR (0-15 each), vibrato (delay/speed/depth), filter (cutoff/resonance/mode), arpeggio (8-entry table + speed), PCM sample support
- **No global tables**: Everything is per-instrument direct parameters
- **Quirks**: Inverted ADSR speeds, sustain is level not time, Amiga panning, PCM samples with fixed-point playback
- **UI**: 4 tabs (Main, Filter, Arpeggio, PCM)
- **WASM API**: Binary serialization (22 bytes synth, 30+ bytes PCM)
- **Type**: `exotic.ts:139-161` (SidMonConfig)

## Common SID Parameters (All Formats)

| Parameter | GTUltra | CheeseCutter | SidMon |
|-----------|---------|--------------|--------|
| Attack (0-15) | AD upper nibble | AD upper nibble | attack field |
| Decay (0-15) | AD lower nibble | AD lower nibble | decay field |
| Sustain (0-15) | SR upper nibble | SR upper nibble | sustain field |
| Release (0-15) | SR lower nibble | SR lower nibble | release field |
| Waveform | firstwave bits 4-7 | via wavetable | waveform (0-3) |
| Pulse Width | via pulse table | via pulse table | pulseWidth (0-255) |
| Filter Cutoff | via filter table | via filter table | filterCutoff (0-255) |
| Filter Resonance | via filter table | via filter table | filterResonance (0-15) |
| Filter Mode | via filter table | via filter table | filterMode (LP/HP/BP) |
| Vibrato | via speed table | unknown | vibDelay/Speed/Depth |
| Arpeggio | via speed table | unknown | arpTable[8] + speed |
| Gate control | firstwave bit 0 | via wavetable | implicit |

## What Each Editor Needs

### CheeseCutter (needs everything — no editor exists)
1. ADSR controls (AD/SR bytes → 4 sliders, 0-15 each)
2. Table pointer controls (wavePtr, pulsePtr, filterPtr)
3. Table viewers (read-only initially since WASM can't edit at runtime)
4. SID register monitor (cc_get_sid_regs exists)
5. **Blocker**: No runtime instrument editing API in WASM bridge

### SidMon (decent editor, could improve)
1. Already has: waveform, ADSR, vibrato, filter, arpeggio, PCM
2. Missing: SID register monitor, waveform visualization, table-style view

### GTUltra (most advanced — reference implementation)
1. Has everything: ADSR, waveform, tables, sound designer, SID monitor
2. Could share: SID monitor, envelope visualization, table editor components
