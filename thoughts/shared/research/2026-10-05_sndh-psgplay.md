---
date: 2026-10-05
topic: Atari ST SNDH on PSG play (psgplay-wasm)
tags: [sndh, atari-st, psgplay, ym2149, wasm]
status: implemented
---

# SNDH on PSG play

## Problem
SNDH (.snd/.sndh) routed to the sc68 core (`public/sc68`, api68), which accepted
raw SNDH and rendered silence (`mad_max/jochen.snd`: peak 0 headless).

## Decision
- PSG play (Fredrik Noring; Musashi 68000 + cf2149 YM2149 + cf68901 MFP +
  cf300588 STE DMA) vendored in `third-party/psgplay`, built by
  `psgplay-wasm/` (emcmake) to `public/psgplay/`. Bridge `psgplay-wasm/src/psgplay_wasm.c`
  uses only the library API; ICE! files are decrunched with the library's `ice.c`.
- One routing decision, by content, in `AmigaFormatParsers.ts` (Atari ST block):
  SNDH -> `SNDHParser` -> `PsgplayEngine`; SC68 container -> `Sc68Parser` -> sc68.
  The chip-dump `.sndh` branch (a stub parser that threw on real SNDH, magic at 0)
  is gone; `Sc68Parser` no longer claims SNDH. sc68's C code is untouched
  (its source tree is not in the repo); nothing sends it SNDH any more.
- Subtunes: track 1 by default (import subsong 0); `sndhSubtune` rides
  TrackerSong -> format store -> live song -> `getLoadArgs`. Past the '##'
  count falls back to the file's default subtune (in C).
- Grid: register frames from the same wasm in digital mode (1/50 s steps,
  `cf2149.state.regs`), `ymRegisterGrid.ts` -> 64-row patterns at speed 1 /
  125 BPM (50 rows/s). Only the first 30 s are drawn at load (main thread);
  the grid spans the TIME tag's length, the rest empty.

## Findings
- psgplay's empiric stereo mix rides on the unipolar YM DAC: silence sits at
  -0.645 FS. The bridge subtracts the all-silent level before PSG play's
  fade-in (halving to stay in int16) and runs a 5 Hz one-pole high-pass
  (the ST's AC-coupled output). Peaks across the set: median 0.41, max 0.61.
- Emscripten's default JS setjmp put every indirect call in Musashi's execute
  loop through `invoke_*` trampolines (~50% of CPU). `-s SUPPORT_LONGJMP=wasm`
  made emulation ~3x faster with bit-identical output (222-song survey).
- Grid extraction cost after that: ~1/60 of real time typical, ~1/20 on the
  heaviest players (pritchett/grandad2: 6.5 s for 120 s).
- Licence: PSG play and its cf* modules are SPDX `GPL-2.0` (version 2 only);
  DEViLBOX is GPL-3.0-or-later. Same situation as other GPL-2.0 entries in
  THIRD_PARTY_NOTICES (AMSynth, setBfree, TFMX decoder); owner's call.

## Survey (headless, 48 kHz, first 10 s of subtune 1)
222 of 222 non-silent; none clip. Quietest: frequent/dma/Hardkant.snd (rms
0.008, first sound 3.6 s), stupe/dinoland.snd (0.0066), th3_d34d/manosnow.snd.

## Open
- Full-length grid: have the worklet post register frames as it plays and
  fill rows live (no load-time cost), or extract in a worker.
- No in-app subtune picker for SNDH (10 of 222 songs have several).
- STE DMA sound is not a mixer channel (mask covers YM A/B/C only).
- ICE!-packed path untested on a real file (none in the corpus).
