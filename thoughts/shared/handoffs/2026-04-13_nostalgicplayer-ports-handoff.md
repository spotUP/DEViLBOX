---
date: 2026-04-13
topic: nostalgicplayer-c-ports-handoff
tags: [port, nostalgicplayer, wasm, edit-api]
status: final
---

# NostalgicPlayer C Ports — Handoff

## What Was Done

23 NostalgicPlayer C# replayers ported to standalone C/WASM:
- ~35K lines of C code, ~500KB total WASM
- All have per-channel render for oscilloscope + effects routing
- 22 pass native tests, all wired to NativeEngineRouting

## What's Missing: Edit APIs

The replayers are read-only — they load the binary and play it. No way to:
- Modify pattern cells (notes, instruments, effects)
- Change instrument parameters
- Export modified data

### Required Edit API Per Format

Each C replayer needs exported functions like:
```c
// Pattern editing
void XX_set_cell(Module* m, int pattern, int row, int channel,
                 uint8_t note, uint8_t instrument, uint8_t effect, uint8_t effect_arg);
void XX_get_cell(Module* m, int pattern, int row, int channel,
                 uint8_t* note, uint8_t* instrument, uint8_t* effect, uint8_t* effect_arg);

// Instrument editing
int XX_get_instrument_count(Module* m);
void XX_set_instrument_param(Module* m, int inst, const char* param, float value);
float XX_get_instrument_param(Module* m, int inst, const char* param);

// Export: serialize current state back to binary
size_t XX_export(Module* m, uint8_t* out_buffer, size_t max_size);
```

### Per-Format Instrument Parameters

Each format has different instrument fields. The instrument editor needs to know what's available:

- **Sonic Arranger**: waveform, volume, fine tuning, vibrato (delay/speed/level), portamento, ADSR (number/delay/length/repeat/sustain), AMF tables, 17 synth effects with 3 args each, 3 arpeggios
- **SoundMon**: sample vs synth type, wave table, ADSR/LFO/EG/FX/MOD controls with table numbers, speeds, delays, lengths
- **Digital Mugician**: volume waveform, pitch waveform, instrument effects (16 types), arpeggio, sample/synth
- **David Whittaker**: volume, envelope, arpeggio, vibrato, square waveform params
- **Fred Editor**: ADSR envelope, pulse/blend synth with sweep params, arpeggio, portamento, vibrato
- **Oktalyzer**: sample-based (volume, loop, fine tune) + mixed channel modes
- **Future Composer**: frequency/volume sequences, vibrato, portamento, multi-samples
- **InStereo! 1+2**: ADSR, LFO, EGC, arpeggio tables, synth waveforms
- etc.

### Implementation Strategy

For each format:
1. Add `XX_set_cell()` / `XX_get_cell()` to C code — directly modifies the internal pattern arrays
2. Add `XX_get_instrument_param()` / `XX_set_instrument_param()` — modifies instrument structs
3. Add `XX_export()` — serializes back to the format's binary layout
4. Expose via Emscripten exports + worklet messages
5. Build format-specific instrument editor React component (DOM) + Pixi equivalent

### Files

All C sources are in `*-wasm/src/*.c`. The internal data structures (pattern arrays, instrument arrays) are already there — they just need public accessor functions.

### Priority Order

Start with the 4 that were browser-tested and are most commonly used:
1. Sonic Arranger
2. SoundMon  
3. Digital Mugician
4. David Whittaker

Then the rest in batches.
