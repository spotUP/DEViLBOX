---
date: 2026-10-05
topic: One shared 68000 host (Musashi) - generic eagleplayer runner for the UADE long tail
tags: [musashi, eagleplayer, uade, paula, stonetracker, anders0land, benndaglish, coredesign, davelowe, davelowenew, wallybeben]
status: implemented
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
- D5 Gate: TrackerSong.eaglePlayerFileData + eaglePlayerId (string, saved
  with the project meta like asapFilename). Descriptor 'EaglePlayer' ahead of
  UADEEditable (the router dropped song.format gating the same day; the file
  data decides).
- D6 Ben Daglish held on BdEngine: the owner's brief assumed UADE plays BD;
  BdEngine (bd-wasm C port, live instrument-param editing via
  WasmParamEditor) does. Runner 0.9991/0.9982 vs BdEngine 0.948/0.984
  against UADE. Moving loses live editing -> owner's call. Flip = one route
  line + isDefault: true in eaglePlayerFormats.ts.
- D7 Paula interrupts follow the chip state machine in the host (not in
  paula_soft, which 15 CPU-less engines share): DMA-on interrupt at the next
  line, DMA off keeps the channel until the AUDx it requests is pending.
  Found by diffing RAM ours vs UADE (eagle_cli --dump vs uade_wasm_read_memory).
- D8 Metric: mono-sum envelope. UADE's wasm renders with panning 1.0 (mono),
  so a stereo envelope compares our hard-panned stereo to mono. Compared up to
  the player's own song end: after it UADE's frontend switches subsong
  (cursubsong 0 -> 1 at 25 s in dynamite dux), a policy, not the player.
- D9 Routes: withEaglePlayer() - native grid if it has notes, else UADE scan
  for the grid; the song always carries eaglePlayerFileData, UADE fields off,
  UADE instruments -> Sampler.

## Checklist
- [x] H1 musashi-host core (cpu, ram, custom, CIA, beam, VBlank, paula hook, call ABI)
- [x] H2 paula_soft: block-start poll + per-voice render
- [x] H3 stonetracker-wasm on the host; before/after render compared
- [x] H4 eagle runner (score boot + trap #5 protocol + companion files + subsong)
- [x] H5 eagleplayer-wasm build + worklet + engine + per-voice outputs + mute mask
- [x] H6 measurement tool: ours vs UADE envelope correlation (30 s)
- [x] F1 Anders 0land
- [~] F2 Ben Daglish - runner plays it (0.999/0.998) but NOT routed: BdEngine plays it today with live instrument editing (owner decision, see D6)
- [x] F3 Core Design
- [x] F4 Dave Lowe
- [x] F5 Dave Lowe New
- [x] F6 Wally Beben
- [x] W1 routing descriptor + parser carries fileData; parseModuleToSong+playingEngineFor test
- [x] W2 watchdog render test in test:ci
- [x] W3 git rm scaffolds (anders0land-wasm benndaglish-wasm coredesign-wasm davelowe-wasm davelowenew-wasm wallybeben-wasm davelonenew-wasm)
- [x] G1 tools/ generator
- [x] G2 ranked list of next UADE formats

## Evidence
- E1 StoneTracker hypnosphere 60 s @ 48 kHz, private Paula (before) vs host +
  shared Paula (after): envelope correlation 0.9994, RMS 0.1306 -> 0.1320,
  sample correlation 0.894 (the old Paula box-filtered each output sample over
  the sample period; paula_soft point-samples - same notes, timing and levels,
  different aliasing). stoneTrackerPlaysHypnosphere.test.ts 7/7 (mute, taps
  bit-identical, past the 108 s SOFT race). Render 60 s: 1.4 s -> 2.6 s.
  Unchanged after the Paula state machine (0.9994).
- E2 Runner vs UADE, 30 s @ 48 kHz, mono envelope (eagleCompare.ts), to song end:
  | format | song | first try | final |
  |---|---|---|---|
  | Anders 0land | primemover 07.hot / hot.primemover_01 / primemover_09.hot | 0.9988 / 0.9955 / 0.9998 | 0.9956 / 0.9972 / 0.9989 |
  | Ben Daglish | mickey_mouse.bd / motorhead-titleandingame.bd | 0.9991 / 0.6618 | 0.9991 / 0.9982 |
  | Core Design | dynamite dux.core | load fail (module LoadSeg'd by name) | 0.9969 (song end 22.6 s) |
  | Dave Lowe | incredibleshrinkingsphere.dl | load fail (same) | 0.9948 |
  | Dave Lowe New | m-bison.dln | 0.9907 | 0.9909 |
  | Wally Beben | wicked.wb | 0.9846 | 0.9845 |
  BdEngine (current BD default): 0.9482 / 0.9842.
- E3 Regression proof: motorhead.bd with the old interrupt timing -> test
  fails at 0.6618; restored -> passes.
- E4 Route proof: eaglePlayerPlaysFormats.test.ts - parseModuleToSong of each
  switched format carries eaglePlayerFileData, no UADE fields/instruments,
  playingEngineFor = EaglePlayer; BD still BenDaglish.

## Next formats for the runner (G2)
Corpus scan 2026-10-05: files matched to an eagleplayer by eagleplayer.conf
prefix/extension, and what the app plays the first 3 with today
(parseModuleToSong, UADE scan mocked). HEURISTIC counts - matching by name
over-counts (SpeedySystem matched 3474 `.ss` drum samples, ZoundMonitor
matched GoatTracker `.sng`, Sound-FX/SonicArranger matched DefleMask `.dmf`,
PTK-Prowiz matched plain `.mod`); these are dropped below. UADE today, by count:
1. SonixMusicDriver 979 (snx.* zips/instruments; Sonix has SonixEngine for
   some routes - check which files reach UADE)
2. SoundPlayer 31 (sjs.*; UADE refused the bare test name - companions?)
3. DigitalSonixChrome 14 (runner loads; comparison n/a - check render)
4. MIDI-Loriciel 13 (needs SMPL.* companions)
5. SUN-Tronic 8, CustomMade 7 (one on RonKlaren), custom 5 (DeliCustoms:
   module IS the player - runner fits by design), SynthDream 5,
   Jochen_Hippel_ST 5, MED 5 (UADEEditable)
6. BenDaglish-SID 4 (runner measured 0.9643 - passes), JesperOlsen 4,
   SoundMaster 4 (UADEEditable), SteveTurner 4 (scan)
7. BeathovenSynthesizer 3 (runner measured 0.9744 - passes),
   ForgottenWorlds 3, JasonBrooke 3, UFO 3, RiffRaff 3, MikeDavies 3
8. Two files each: Ashley_Hogg, DavidHanney, Desire, EarAche, TimFollin,
   TheMusicalEnlightenment, RobHubbard_ST, HowieDavies, Infogrames,
   MultiMedia_Sound, MMDC, SynthPack, SeanConran, FredGray, PaulSummers,
   Mark_Cooksey, ManiacsOfNoise, KrisHatlelid, MusicMaker-8V, JasonPage,
   Silmarils, JankoMrsicFlogel, SteveBarrett, SeanConnolly,
   ProfessionalSoundArtists, Quartet_PSG, Special-FX, VoodooSupremeSynthesizer
   (UADE scan); AudioSculpture, DIGI-Booster, TCB_Tracker, RobHubbard,
   PaulRobotham, JeroenTel, TomyTracker, PaulShields, GlueMon (UADEEditable)
Players needing the fake audio.device (MaxTrax class) are NOT supported by
the runner (eagle_unsupported_messages() counts them).

How to add one: `npx tsx tools/eagleplayer/scaffold-format.ts --player <P>
--corpus <song> [--write]`, add the printed route, set isDefault: true.

## Open
- BD default (D6) - owner.
- Grid follow: the runner reports no song position; the grid does not follow
  playback on these formats (UADEEditable did for some). Needs per-player
  position reads (module RAM) - not done.
- Subsongs: engine.setSubsong exists; not wired into nativeSubsongs (scope
  view control / auto-advance) - the silence detector ends the song.
- Instrument editing on these formats: none (the player is the module's own
  68k code); edits would be RAM pokes into the module.
- Untracked build dirs left on disk by earlier sessions: davelowe-wasm/,
  davelonenew-wasm/ (ignored build output only, tracked files git rm'd).
- NativeEngineRouting.contract.test 'SunTronicSong wildcard' fails since the
  router dropped `formats` (28d1af1a8, not this work).
