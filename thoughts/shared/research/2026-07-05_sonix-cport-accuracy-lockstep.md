---
date: 2026-07-05
topic: sonix-cport-accuracy-lockstep
tags: [sonix, replayer, lockstep, uade, accuracy]
status: draft
---

# Sonix C-port accuracy — lock-step vs UADE

## Problem (domain terms)
The Sonix WASM C port (`sonix-wasm/src/sonix/sonix.c`, RetrovertApp port) renders
IFF-SMUS songs **inaccurately** vs the real Amiga. Symptoms on `public/data/songs/sonix/games/Spot - The Computer Game!/smus.wait2` (5 synth + 4 sample instruments):
- samples/synths sound like they loop a **too-short segment** (buzzy timbre),
- overall **~3x too loud**,
- envelope shape differs (see RMS below).

Integration is NOT the issue — the song loads all 9 instruments and plays; this is
replayer *accuracy*. Invariant violated: the per-channel Paula state (sample **LEN**,
**VOL**, **PER**) the C port produces per tick does not match the real replayer.

## Reference measurement (UADE = gold standard)
UADE runs the actual 68k Sonix Eagleplayer + Paula. Captured its Paula register timeline:
```
timeout 30 uade123 -1 -w 8 --frequency 48000 --write-audio /tmp/sonix_paula.dump "<song>"
```
Decoder: `tools/sonix-audit/decode-uade-paula.mjs` (reads the `uade_osc_0` format).

### UADE --write-audio format (decoded from third-party/uade-3.05/src/write_audio.c + include/write_audio_ext.h)
- 16-byte header: magic `"uade_osc_0\x00\xec\x17\x31\x03\x09"`.
- Frames, 12 bytes each: `int32 tdelta (BE)` + 8-byte union.
  - If `tdelta & 0x80000000`: Paula event `{int8 channel, int8 event_type, uint16 value (BE)}` (packed, first 4 bytes of the union).
  - Else: 4x `int16 output (BE)` audio samples.
- Event types (permanent ints): `VOL=1 PER=2 DAT=3 LEN=4 LCH=5 LCL=6 LOOP=7 OUTPUT=8 START_BUFFER=9`.
- LEN is Paula DMA length in **words** (bytes/2); VOL is 0-64; PER is the Paula period.

### UADE reference values (smus.wait2, first ~8s)
```
ch0  LEN n=91 range=[1..720] distinct={1,4,8,208,416,720}   VOL max 47   PER 150..427
ch1  LEN n=21 range=[1..416] distinct={1,4,208,416}          VOL max 47   PER 150..403
ch2  LEN n=13 range=[1..720] distinct={1,8,720}              VOL max 47   PER 150..427
ch3  (mostly idle)
```
So the real replayer plays samples up to **720 words = 1440 bytes** long, at VOL<=47.

## Hypotheses to confirm (discriminating measurement = instrument the C port identically)
1. **LEN too small (short-loop):** the C port's active sample length / loop length per note
   is much smaller than UADE's 208/416/720. Compare C-port `snx_active_pcm_len` /
   `snx_active_loop_len` / synth decimation length vs UADE PET_LEN per channel per tick.
2. **VOL/post-amp ~3x:** RMS was UADE ~0.06 vs C-port ~0.18 over 20s (per-second, /tmp WAVs).
   Check the C port's per-channel volume (`snx_hw_vol`) vs UADE PET_VOL (max 47), and any
   getPostAmp/master scaling in `sonix_song_decode` / the harness.
3. **PER (pitch):** compare period — likely OK-ish since melody is recognizable.

## Next steps (fresh context)
1. Instrument the Sonix C port to log per-tick per-channel `{period, active_pcm_len, loop_len, hw_vol}` (analog of PET_PER/LEN/VOL). Native harness pattern: `/tmp/wav.c` / the probe in this session (compile sonix.c+sonix_io.c with real-FS io callbacks over the song's Instruments/ dir).
2. Diff C-port trace vs decoded UADE timeline (decode-uade-paula.mjs, extend to emit an ordered per-channel event list, not just stats).
3. Find the FIRST diverging register → that names the bug level (data/algorithm/param). Fix at that level (NOT a post-amp band-aid unless the divergence really is only VOL).
4. Regression: a lock-step test asserting C-port LEN/VOL/PER match UADE for smus.wait2 within tolerance.

## Files
- C port: `sonix-wasm/src/sonix/sonix.c` (synth_* + snx_* per-channel state), `sonix_io.c` (instrument .instr/.ss parsing → lengths/loops).
- Reference dump: `/tmp/sonix_paula.dump` (regenerate with the uade123 cmd above).
- Decoder: `tools/sonix-audit/decode-uade-paula.mjs`.
- A/B WAVs: `/tmp/uade_ref.wav` (correct) vs `/tmp/sonix_out.wav` (current C port).

## Separate open bug (not accuracy): editor knobs no-op
SonixControls editor shows for synth instruments (getEditorMode → 'sonix' works, param
bridge populated config.parameters.sonix), but turning a knob has no audible effect.
Likely: updateInstrument → SonixSynth.applyConfig → SonixEngine.setSynthParams reaches the
WASM, but the playing song's instruments only re-read scalar params on the NEXT note (or no
live SonixSynth voice exists for a suppressNotes engine, so applyConfig never fires). Needs
live trace of the setSynthParams → worklet applySynthParams path during playback.
