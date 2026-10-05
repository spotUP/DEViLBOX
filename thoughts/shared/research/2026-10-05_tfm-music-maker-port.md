---
date: 2026-10-05
topic: TFM Music Maker (.tfe) playback port - route decision
tags: [tfm, turbofm, ym2203, zxtune, ymfm, wasm, zx-spectrum]
status: implemented
---

# TFM Music Maker (.tfe) - how it plays

## The format (from ZXTune, GPL-3)

- `src/formats/chiptune/fm/tfmmusicmaker.cpp` (vitamin-caig/zxtune master,
  fetched 2026-10-05). Two layouts: v0.1-1.2 ("0.5", no signature, speeds
  packed in one byte) and v1.3+ (`TFMfmtV2` signature, 4 effect columns).
- Everything after the signature is one RLE stream: byte 0x80 + a 7-bit
  little-endian varint counter repeats the previous byte (counter-1) more
  times; counter 0 is a literal 0x80. It decompresses to the full fixed
  header: 1 981 904 bytes (v0.5) / 4 341 209 bytes (v1.3), ending with 256
  patterns of 6 channels x 256 lines in column-planar layout.
- Notes are stored XOR 0xFF; 0xFE = key off, 0xFF = empty; the player note is
  `note - 12`. 255 instruments x 42 bytes (alg, fb, 4 x 10 operator bytes,
  TL XOR 0x7F; v1.3 also inverts AR/DR/SR/RR).
- `src/module/players/tfm/tfmmusicmaker.cpp` + `tfm_base_track.cpp`: a 50 Hz
  frame player (even/odd tempo interleave, arpeggio, tone slide, portamento,
  vibrato, volume slide, TL/multiple/feedback/mixer overrides, special-mode
  channel 3, retrig/cut/delay, loop start/stop) that emits YM2203 register
  writes; channels 0-2 go to chip 0, 3-5 to chip 1. `devices/fm/tfm.cpp`:
  two YM2203 at 3.5 MHz, outputs summed and halved, mono.

## Routes considered

1. **Compile ZXTune itself.** The two files sit on ZXTune's whole module
   framework (Binary containers, Parameters, PatternsBuilder, OrderList,
   Time, Sound::Chunk, MAME fm.c wrapper). Pulling that into emscripten is
   thousands of lines of unrelated code for ~900 lines of logic. Rejected:
   cost far beyond the benefit.
2. **TypeScript player + an OPN chip.** Needs an FM core anyway (wasm) and
   splits the frame player from the chip across the worklet boundary. No gain.
3. **Chosen: extract ZXTune's parser + player + register builder into one
   self-contained C++ file (`tfm-wasm/src/tfm_player.cpp`), framework types
   replaced by plain structs, logic kept line for line; drive ymfm's `ym2203`
   (BSD-3, already in tree at
   `third-party/furnace-master/src/engine/platform/sound/ymfm`, the same core
   furnace-wasm builds).** Two chips, FM engine clocked at its native rate
   (3.5 MHz / 72 = 48 611 Hz), linear resample to the context rate, per-channel
   mute through ymfm's `output(..., chanmask)`.

Cost of route 3: ~700 lines C++ (player port + bridge), a 60-line worklet, a
100-line engine class, a TS grid parser (RLE + planar cells), the usual
wiring. The OPN emulator differs from ZXTune's (MAME fm.c vs ymfm); both are
YM2203 models, ymfm is the more exact one. No SSG is used by TFM.

## Known duplication

The TS grid parser (`TFMMusicMakerParser.ts`) re-reads the decompressed
layout for the view; the C++ reads it for playback. Same split as AYParser
vs aylet and PiyoPiyoParser vs its worklet.

Note: `zxtune-wasm/` in this repo is not ZXTune - it is a C wrapper around
the ayumi AY core with its own format readers; it has no FM and no TFM.

## Finding during the build: register write timing

ZXTune applies a frame's writes at one instant to MAME fm.c, which acts on a
key-off/key-on pair immediately. ymfm samples the key state once per FM
sample, so the same pair at one instant is no edge: every channel held its
first note and decayed to silence within 0.5 s (RMS 0.032 -> 0.0000). The
bridge now spaces writes one per FM sample (~20 us), the order of the Z80
OUT sequence on the real bus. Measured after: rainstorm.tfe RMS 0.046-0.054
in every 0.5 s window of the first 4 s.

## Measured (src/engine/__tests__/tfmPlaysRainstorm.test.ts, 48 kHz)

- RMS per 0.5 s, first 4 s: 0.0537 0.0515 0.0502 0.0463 0.0507 0.0525 0.0500 0.0486
- 3 s all channels 0.0509; mask 0 -> 0.000000; channel 1 muted -> 0.0264
- 8-10 s (chip 2 enters at frame 384): all 0.0557, chip 1 only 0.0498

## Not verified

No listening test in a browser yet, and no A/B against a ZXTune render.
