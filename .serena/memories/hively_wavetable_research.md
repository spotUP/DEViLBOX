---
date: 2026-02-27
topic: HivelyTracker waveform/wavetable system
tags: [hively, ahx, hvl, waveforms, synthesis]
status: final
---

# HivelyTracker/AHX Waveform & Wavetable System Research

## What HivelyTracker/AHX Uses for Waveforms

**HivelyTracker (HVL) and AHX (.ahx) both use HARDCODED wavetables**, NOT loaded from disk.

The replayer generates all waveforms at initialization time in a single large memory block:
- **No external .wav files or binary data files required**
- **No runtime disk I/O for waveforms**
- **All waveforms generated once at `hvl_InitReplayer()` startup**

### Waveform Types (5 main types)

1. **Triangle** — 6 sizes: 4, 8, 16, 32, 64, 128 samples
2. **Sawtooth** — 6 sizes: 4, 8, 16, 32, 64, 128 samples
3. **Square** — 32 fixed widths (0x20 variations)
4. **White Noise** — 0x280 * 3 samples (~1920 bytes)
5. **Filtered variants** — Low-pass and High-pass versions of triangle (31 filter curves × 6 sizes each)

Total waveform buffer: `WAVES_SIZE` bytes
- Source: `hvl_tables.h` defines offset constants (`WO_TRIANGLE_04`, `WO_SAWTOOTH_04`, etc.)

### Generation Code (hvl_replay.c:300-318)

```c
void hvl_InitReplayer(void) {
  hvl_GenPanningTables();
  hvl_GenSawtooth(&waves[WO_SAWTOOTH_04], 0x04);
  hvl_GenSawtooth(&waves[WO_SAWTOOTH_08], 0x08);
  // ... 4 more sawtooths (10, 20, 40, 80)
  hvl_GenTriangle(&waves[WO_TRIANGLE_04], 0x04);
  hvl_GenTriangle(&waves[WO_TRIANGLE_08], 0x08);
  // ... 4 more triangles
  hvl_GenSquare(&waves[WO_SQUARES]);
  hvl_GenWhiteNoise(&waves[WO_WHITENOISE], WHITENOISELEN);
  hvl_GenFilterWaves(&waves[WO_TRIANGLE_04], &waves[WO_LOWPASSES], &waves[WO_HIGHPASSES]);
}
```

### Waveform IDs in .hvl/.ahx format
- 0 = Triangle
- 1 = Sawtooth
- 2 = Filtered Low-Pass (dynamic, using filter modulation)
- 3 = White Noise
- 4 = Filtered High-Pass (dynamic, using filter modulation)

### Wave Length parameter
- Selects size: 4, 8, 16, 32, 64, or 128 samples
- Controls pitch resolution / aliasing tradeoff

---

## Current DEViLBOX Implementation Status

### What We Parse ✅
- **HivelyParser.ts** — Binary parser reads .hvl/.ahx files correctly
  - Extracts instrument configs (volume, envelope, filter, square, vibrato)
  - Extracts performance list (effects, notes, waveforms)
  - Maps to TrackerSong format (instruments + patterns)

### What We Serialize ✅
- **HivelySynth.ts** — Serializes 22-byte instrument header + plist
  - Sends `serializeInstrument()` buffer to WASM worklet
  - WASM calls `hively_player_set_instrument()` to install config

### What the WASM Should Do
- **Hively.wasm** (compiled from C reference)
  - `_hively_init()` — Calls `hvl_InitReplayer()` to generate all wavetables ✅
  - `_hively_player_set_instrument()` — Accepts serialized instrument config ❌
  - `_hively_player_note_on()` / `_hively_player_note_off()` — Trigger notes ❌
  - `_hively_player_render()` — Produces audio samples for a block ❌

### What's Broken 🔴

**Instrument mode playback is non-functional** because:

The Hively C reference implementation is **song-playback only**, not designed for standalone instrument mode:
- No `hvl_create_player()` function
- No `hvl_player_set_instrument()` function
- No `hvl_player_note_on()` / `hvl_player_note_off()` functions
- No `hvl_player_render()` function
- Only exports: `hvl_init()`, `hvl_load_ahx()`, `hvl_decode_frame()`, `hvl_free_tune()`

The WASM binary currently lacks:
- Standalone player object management
- Per-voice ADSR envelope handling for individual notes
- Sample-by-sample rendering for live note triggering

---

## What's Required for Audio to Work

### Song Playback (working)
1. ✅ Init waveforms via `hvl_InitReplayer()`
2. ✅ Load .hvl/.ahx file into WASM memory
3. ✅ Call `hvl_decode_frame()` each frame (~960 samples at 50Hz)
4. ✅ Read float output, ring-buffer to AudioWorklet

### Standalone Instrument Playback (missing)
1. Create standalone voice/player object
2. Install instrument config on player
3. Send noteOn (MIDI note + velocity) to player
4. Call `hvl_player_render()` to get audio each sample block
5. Route to output

This requires extending the WASM with new C functions that don't exist in the reference replayer.

---

## Root Cause Summary

**HivelyTracker waveforms are NOT the problem.** They are:
- ✅ Hardcoded (no external files needed)
- ✅ Generated at init time
- ✅ All present in WASM at startup

**The problem is the WASM API lacks standalone instrument playback.**

Current implementation expects functions that were never implemented in the C reference code.
The Hively replayer was designed exclusively for song playback, not per-note synthesis.
