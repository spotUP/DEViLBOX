# UADE Chip RAM Editing Design

**Date:** 2026-02-28
**Status:** Approved

---

## Goal

Make every UADE-supported Amiga format fully editable in DEViLBOX — pattern data, PCM samples, and synthesis instrument parameters — with playback always routed through UADE's authentic 68k emulator. Edits produce byte-perfect output in the original format, playable on real Amiga hardware.

---

## Core Insight

UADE's 68k CPU emulator loads the entire song into Amiga chip RAM. Every eagleplayer binary reads instrument parameters, pattern data, waveforms, and sample pointers directly from chip RAM on every note trigger. We already export `uade_wasm_read_memory` and `uade_wasm_write_memory` from the WASM.

This means: **edits written to chip RAM take effect on the very next note trigger — with zero latency and full eagleplayer accuracy.**

No separate native synth engines are needed. UADE is the single playback engine, always. The editing layer is a read/write interface on top of UADE's chip RAM.

---

## Architecture

```
Load file
  → UADE 68k emulator loads song into chip RAM
  → Native parser reads chip RAM layout → builds editable data model
  → DEViLBOX pattern editor + instrument editor show the data

User edits a parameter or note
  → Compute chip RAM address from format memory map
  → uade_wasm_write_memory(addr, newValue)
  → UADE eagleplayer reads updated value on next note trigger
  → User hears the change through UADE's authentic engine

Export
  → Read chip RAM from module base to module end
  → Write to file in original binary format
  → Plays on real Amiga hardware unchanged
```

---

## The Memory Map Registry

Each format gets a TypeScript `UADEMemoryMap` descriptor that encodes its chip RAM layout:

```typescript
interface UADEFieldDef {
  offset: number;            // Bytes from entry start
  size: number;              // 1 | 2 | 4 | N
  type: 'uint8' | 'uint16be' | 'int8' | 'bytes';
}

interface UADETableDef {
  baseOffset: number;        // Bytes from module base
  entrySize: number;         // Bytes per entry
  count: number | 'header'; // Fixed count or read from header
  fields: Record<string, UADEFieldDef>;
}

interface UADEPatternDef {
  baseOffset: number;
  rowsPerPattern: number;
  channelCount: number;
  rowStride: number;         // Bytes per row (all channels)
  channelStride: number;     // Bytes per channel cell within a row
  noteOffset: number;        // Offset within cell
  instrumentOffset: number;
  effectOffset: number;
  effectParamOffset: number;
}

interface UADEMemoryMap {
  formatNames: string[];     // UADE formatName strings that use this map
  moduleBase: number | 'scan'; // chip RAM address or scan for magic
  magicOffset?: number;      // If 'scan': offset from magic match to module base
  magicBytes?: number[];     // If 'scan': byte sequence to search for
  moduleSizeOffset?: number; // Offset in header that gives module total size
  instruments?: UADETableDef;
  patterns?: UADEPatternDef;
  waveforms?: UADETableDef;
  sequences?: UADETableDef;
  // Format-specific extension blocks
  fc?: { synthTableOffset: number; synthTableSize: number };
  soundMon?: { arpeggioTableOffset: number; waveformTableOffset: number };
}
```

Memory maps live in `src/engine/uade/memoryMaps/` — one file per format family.

---

## Edit Modes

### Live edits (instrument params, waveform bytes, volumes)
Write to chip RAM while UADE is playing. The eagleplayer picks up the change on the next note trigger. No restart required. This covers:
- Envelope parameters (attack, decay, sustain, release speeds)
- Waveform table bytes
- Arpeggio table values
- Volume/finetune
- Synthesis-specific params (FC frequency macros, SoundMon LFO, etc.)

### Structural edits (pattern length, song order, channel count)
Modify the in-memory TrackerSong representation, then serialize it back to the original binary format and reload UADE with the patched binary. The song restarts from the current position. This covers:
- Adding/removing patterns
- Changing song order
- Adding/removing instruments

---

## Export: Original Format Files

Because the chip RAM IS the module data, export is trivial:

```typescript
// Read chip RAM from module base → module end
const moduleData = await engine.readMemory(memoryMap.moduleBase, moduleSize);

// For formats with companion files (e.g. TFMX .mdat + .smpl),
// reconstruct each file separately from known chip RAM regions.

// Save as original binary format
download(moduleData, filename); // e.g. "mysong.fc"
```

Output is byte-for-byte the original format. Plays on real Amiga with ProTracker, Future Composer, SoundMon etc.

---

## Format Priority: Synthesis Formats First

Synthesis formats are the most interesting and have the most unique parameter spaces. PCM-based formats are simpler (the Sampler editor already handles those well via the enhanced scan).

### Phase 1 target formats (all have complete native parsers already):

| UADE formatName | Extensions | Synthesis type | Memory map complexity |
|---|---|---|---|
| `FutureComposer1.3` | fc13, fc3, smod | Wavetable + macro | Medium |
| `FutureComposer1.4` | fc, fc14, fc4 | Wavetable + macro | Medium |
| `FutureComposer-BSI` | bfc, bsi, fc-bsi | Wavetable + macro | Medium |
| `SoundMon2.0` | bp, sndmon | Waveform synthesis | Medium |
| `SoundMon2.2` | bp3 | Waveform synthesis | Medium |
| `SIDMon1.0` | sid1, smn, sid | Phase-mod oscillator | Medium |
| `SIDMon2.0` | sid2 | SID-like | Medium |
| `Fred` | fred | PWM + wavetable | Medium |

### Phase 2 (parsers exist, memory maps need research):
- TFMX 1.5 / 7V / Pro / ST — macro-based, most complex
- JochenHippel-CoSo — synthesis
- JochenHippel-7V — 7-voice PCM hybrid

### Phase 3 (need parser research + memory maps):
- RobHubbard, DavidWhittaker, DeltaMusic 1/2, BenDaglish, MarkCooksey
- Mugician, GMC, Sonic Arranger, Dynamic Synthesizer

---

## Instrument Editor UI

Each format gets a dedicated instrument parameter panel in `src/components/instruments/`. The pattern follows Furnace:
- Read initial values from chip RAM via memory map
- Display as knobs, sliders, or waveform editors
- On change: `engine.writeMemory(computedAddr, newValue)` → instant UADE playback

For waveform data (FC synth tables, SoundMon waveforms, SidMon phase tables):
- Mini waveform editor — draw waveform directly, writes 16–64 bytes to chip RAM

---

## WASM Layer Requirements

Verify `uade_wasm_write_memory` exists — if not, add it to `uade-wasm/src/entry.c`:

```c
EMSCRIPTEN_KEEPALIVE
void uade_wasm_write_memory(uint32_t addr, const uint8_t *src, int len) {
    for (int i = 0; i < len; i++) {
        byteput(addr + i, src[i]);
    }
}
```

Add to `-sEXPORTED_FUNCTIONS` in `build.sh` and rebuild WASM.

Add engine wrapper:
```typescript
async writeMemory(addr: number, data: Uint8Array): Promise<void>
async readMemory(addr: number, len: number): Promise<Uint8Array>
```

Both work via worklet message passing (same pattern as existing `readStringFromMemory`).

---

## Key Benefits Over Previous Approach

| Old approach | New approach |
|---|---|
| Separate native synths (FCSynth WASM etc.) | UADE is the only synth |
| A/B dual instruments (confusing) | Single instrument, single playback path |
| Edits affect native synth only | Edits affect UADE's authentic engine |
| No export to original format | Export to original binary, plays on real Amiga |
| Need separate synth engine per format | One engine (UADE) handles all 175 formats |

---

## Files Touched

| File | Change |
|---|---|
| `uade-wasm/src/entry.c` | Add `uade_wasm_write_memory()` if missing |
| `uade-wasm/build.sh` | Add to `EXPORTED_FUNCTIONS` |
| `public/uade/UADE.js` / `.wasm` | Rebuilt |
| `src/engine/uade/UADEEngine.ts` | Add `writeMemory()`, `readMemory()` batch wrappers |
| `public/uade/UADE.worklet.js` | Add `writeMemory` message handler |
| `src/engine/uade/memoryMaps/index.ts` | Memory map registry |
| `src/engine/uade/memoryMaps/fc.ts` | Future Composer memory map |
| `src/engine/uade/memoryMaps/soundmon.ts` | SoundMon memory map |
| `src/engine/uade/memoryMaps/sidmon.ts` | SidMon 1/2 memory maps |
| `src/engine/uade/memoryMaps/fred.ts` | Fred Editor memory map |
| `src/engine/uade/UADEChipEditor.ts` | Read/write helpers using memory maps |
| `src/lib/import/formats/UADEParser.ts` | Embed memory map addr info in parsed song |
| `src/components/instruments/editors/UADEInstrumentEditor.tsx` | Per-format param UI |
| `src/components/instruments/editors/UADEWaveformEditor.tsx` | Mini waveform draw editor |
