---
date: 2026-10-05
topic: One shared 68000 host (Musashi) - generic eagleplayer runner for the UADE long tail
tags: [musashi, eagleplayer, uade, paula, stonetracker, anders0land, benndaglish, coredesign, davelowe, davelowenew, wallybeben]
status: draft
---

# Musashi replayer host

Owner decision 2026-10-05: one shared 68000 replayer host on Musashi, six
formats moved onto it (Anders 0land, Ben Daglish, Core Design, Dave Lowe,
Dave Lowe New, Wally Beben), replacing the transpiled-to-C scaffolds that trap
in player_load. Owner direction (same day): a GENERIC eagleplayer runner, so a
format is a data entry (player file, prefixes, voices, quirks), plus a
generator under tools/ that scaffolds a format onto it. StoneTracker shares the
host core.

## Done means
- musashi-host/ core used by stonetracker-wasm AND eagleplayer-wasm; one Paula
  (tools/asm68k-to-c/runtime/paula_soft.c).
- StoneTracker renders before/after compared.
- Per format: our render vs UADE 30 s, 100 ms loudness-envelope correlation;
  > 0.95 -> default load plays on our engine (parseModuleToSong +
  playingEngineFor proven in a test); else stays on UADE, reported.
- Headless watchdog render test in test:ci; scaffolds git rm'd.
- tools/ generator scaffolds a format; ledger ranks the next UADE formats.

## Decisions
- D1 Generic runner = UADE's own sound core `score` (third-party/uade-3.05/
  amigasrc/score/score, the committed binary UADE's wasm embeds) running on
  Musashi. score already IS the eagleplayer ABI host (tags, DTP_Check/
  InitPlayer/InitSound/Interrupt/EndSound/subsongs, exec/dos/CIA/timer
  emulation, relocator). Reimplementing it in C would be a second copy of the
  same ABI. The C side implements only what UAE gives score: memory, custom
  chips, CIAs, trap #5 messages ($200 out, $300 in), the $100-$198 boot block
  (src/uade.c uadecore_reset layout copied).
- D2 Musashi trap callback (M68K_TRAP_HAS_CALLBACK, compile define, no vendored
  edit) catches trap #5 the way newcpu.c Exception(37) does; the exception
  then proceeds normally (score's handler is an RTE).
- D3 Paula = shared paula_soft.c. Added: block-start poll (AUDx interrupt the
  chip raises when it latches LC/LEN) and a per-voice render. StoneTracker's
  private box-filtered Paula is dropped.
- D4 Players are data: public/eagleplayer/players/<UADE player file name>,
  fetched by the engine; the format table (src/engine/eagleplayer/
  eaglePlayerFormats.ts) maps format -> player file + voices + quirks.
- D5 Gate: TrackerSong.eaglePlayerFileData (+ eaglePlayerName), descriptor
  formats null like the other whole-song engines.

## Checklist
- [x] H1 musashi-host core (cpu, ram, custom, CIA, beam, VBlank, paula hook, call ABI)
- [x] H2 paula_soft: block-start poll + per-voice render
- [x] H3 stonetracker-wasm on the host; before/after render compared
- [ ] H4 eagle runner (score boot + trap #5 protocol + companion files + subsong)
- [ ] H5 eagleplayer-wasm build + worklet + engine + per-voice outputs + mute mask
- [ ] H6 measurement tool: ours vs UADE envelope correlation (30 s)
- [ ] F1 Anders 0land
- [ ] F2 Ben Daglish
- [ ] F3 Core Design
- [ ] F4 Dave Lowe
- [ ] F5 Dave Lowe New
- [ ] F6 Wally Beben
- [ ] W1 routing descriptor + parser carries fileData; parseModuleToSong+playingEngineFor test
- [ ] W2 watchdog render test in test:ci
- [ ] W3 git rm scaffolds (anders0land-wasm benndaglish-wasm coredesign-wasm davelowe-wasm davelowenew-wasm wallybeben-wasm davelonenew-wasm)
- [ ] G1 tools/ generator
- [ ] G2 ranked list of next UADE formats

## Evidence
- E1 StoneTracker hypnosphere 60 s @ 48 kHz, private Paula (before) vs host +
  shared Paula (after): envelope correlation 0.9994, RMS 0.1306 -> 0.1320,
  sample correlation 0.894 (the old Paula box-filtered each output sample over
  the sample period; paula_soft point-samples - same notes, timing and levels,
  different aliasing). stoneTrackerPlaysHypnosphere.test.ts 7/7 (mute, taps
  bit-identical, past the 108 s SOFT race). Render 60 s: 1.4 s -> 2.6 s.
