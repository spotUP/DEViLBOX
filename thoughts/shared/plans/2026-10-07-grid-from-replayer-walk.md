---
date: 2026-10-07
topic: Grid from the replayer's walk - which of the owner's jukebox grid flags need the David Whittaker treatment, in what order
tags: [formats, patterns, grid, replayer-walk, oracle, uade, plan, jukebox]
status: draft
---

# Grid from the replayer's walk (plan, 2026-10-07)

Input: the owner's jukebox flags (77 rows, tools/format-state.json, read only) -> 75 rows
collapse to **61 distinct formats**; the other 2 rows are David Whittaker (P10 in
thoughts/shared/plans/2026-10-06-fix-all-open.md, another agent; not touched here).
Research and plan only: no code changed. Builds on
thoughts/shared/research/2026-10-06_grid-provenance-per-format.md (class A-D of how a grid
is built today) and the ledger in thoughts/shared/plans/2026-10-05-broken-formats-sweep.md.

## Result in one paragraph

Class counts (this plan's classes, section "Classes"): **A 19, B 15, C 25 (17 with player
source in the repo, 8 binary only), D 2**. By state: 43 open, 13 fixed since the owner flagged
them (re-verify, not re-build), 1 reopened (Hippel ST: flagged after its fix), 2 owner-Good,
2 blocked (no oracle can exist). Many flags are stale: they are dated 09-24/10-02, before the
10-05/10-07 grid commits for their format (git log per parser, listed in the table). Two cross-cutting causes
explain a large part of what is left: (1) 15 of the native WASM replayers in this plan post no playhead position
(grep of their worklets for a position message: 0 hits), so the grid scrolls on the tracker scheduler while audio free-runs
("frozen", "out of sync"); (2) the existing GridMatchesPlayer tests for classic formats
(SoundMon, Delta Music 1, Digital Mugician) pin the expected notes of ONE file, not every note
of every voice of every corpus song.

## The bar ("DW treatment", applied per format, all corpus songs, all sub-songs)

Templates: src/engine/__tests__/davidWhittakerGridVoices.test.ts (own C replayer exports a walk
and an independent trace) and src/engine/__tests__/actionamicsGridMatchesPlayer.test.ts
(worklet event log per voice). A format is done when one test through the product entry point
(parse -> grid; worklet or UADE -> events) proves, with a call-count or sentinel that the walk ran:

1. every note-on the oracle shows on a voice has a cell at that voice and row with the same pitch name
   (src/lib/amiga/periodNotes.ts, 428 = C-2, transposes applied) and the same instrument;
2. every note or instrument the grid shows is started by the oracle on that voice (no stray numbers);
3. a note-off only where the oracle mutes a sounding voice; a voice that never sounds is empty;
4. rows read per pattern equal the grid's pattern lengths (set-rows / break / pattern-length commands);
5. effect and volume columns hold the commands the replayer ran, named as the format names them;
6. byte-exact carrier round trip on every corpus file (the format's existing *Roundtrip test stays green);
7. playhead: the engine reports song position + row (src/engine/wasm/PositionCallbacks.ts) and the
   reported row is the row sounding;
8. a song that cannot be matched opens the scope view (no-guess rule, 047ca8685).

Per global rule 6a every unit runs only its own format's songs; new tests go in
src/engine/__tests__/ (inside the test:ci glob; files in src/lib/import/__tests__ must be named
one by one in package.json test:ci).

## Oracle toolbox that already exists (reuse, do not rebuild)

- **Paula write log** (AUDxPER, AUDxLC per 10 ms): `_uade_wasm_enable_paula_log` / `_uade_wasm_get_paula_log`;
  pattern in src/engine/__tests__/sidmon1GridMatchesUade.test.ts; CLI scorer tools/uade-audit/gridVsPaula.ts.
  The same 20 lines are copy-pasted in 8 test files (grep `_uade_wasm_get_paula_log`): unit U1 extracts them.
- **68k voice records** (`_uade_wasm_read_memory`, sampled every half tick): src/engine/__tests__/jochenHippelSTGridMatchesPlayer.test.ts.
  Needs the voice-struct offsets from the player asm: third-party/uade-3.05/amigasrc/players/** (wanted_team/* for ~80 players).
- **Module-read trace** (which module bytes the 68k reads per tick; for binary-only players): tools/uade-audit/traceModuleReads.ts, test traceModuleReads.oracle.test.ts.
- **Our own 68k runner** (EaglePlayer, Musashi host): the same eagleplayer on our CPU, memory readable, UADE not needed; formats in src/engine/eagleplayer/eaglePlayerFormats.ts:48-94.
- **WASM replayer event log** (`*_event_field`, `_player_get_voice_rows_consumed`): src/engine/__tests__/workletHarness.ts; for a port this is circular unless first checked against UADE (SidMon 1 measured 87.6% register equality).
- **Playhead test**: src/engine/__tests__/nativeReplayerPlayheadFollowsGridRow.test.ts + PositionCallbacks.ts (template commit d98a02cf1).

gridVsPaula caveat (measured 10-07, scores in the table are indicative only): it misreads arpeggio,
vibrato and double-period writers (Fred, SoundMon, DM1), is blind to players that rewrite the period
every tick (Hippel ST), cannot compare 7-voice formats with 4 Paula voices, and failed to detect
about 20 corpus files by content ("no native parser") although the app parses them; those are tool
faults, not format faults. It disagrees with the ledger on SoundMon nicktune1 (0.21-0.41 now, 1.00 then):
unconfirmed whether the yardstick or the grid changed.

## Classes

- **A** classic pattern format: the grid is a direct decode of stored patterns; the bug is a decode
  error or a sync/position error. Small fix, no new walk.
- **B** command-stream or flow-controlled format with our own replayer source (C/WASM in the repo):
  DW treatment = add a walk export to the replayer, build the grid from it, verify against an
  independent oracle (UADE, or the runner), carriers byte-exact.
- **C-src** the player is 68k code run by UADE or the EaglePlayer runner and its asm is in
  third-party/uade-3.05/amigasrc: walk = voice records read from 68k memory, oracle = Paula log.
- **C-bin** same, but the player is binary only: walk = module-read trace + Paula; no struct layout to read.
- **D** cannot be a grid (no oracle can exist: UADE silent or crashing); the scope view is correct.
- State: OPEN (build), REVERIFY (a fix landed after the flag: apply the bar, owner re-looks),
  REOPEN (flagged after the fix), GOOD (owner verdict Good), BLOCKED.

## Table (61 formats)

| Format | Jukebox keys | Class | State | Engine | Current grid source (file:line) | Oracle | Size | Wave |
|---|---|---|---|---|---|---|---|---|
| SUNTronic | SUNTronicTunes-unknown, formats-SUNTronicTunes-unknown, formats-SUNTronicTunes-suntronic | B | OPEN | SunTronicSong native engine (wasmEngineRegistry.ts:921); UADE for 5 raw rips | SunTronicParser.ts:327 parseSunTronicFile + SunTronicV13 score decode (637 of 642 corpus files, provenance doc); sunReproject.ts | UADE Paula (amigasrc/suntronic asm in repo) + SunTronicSongEngine trace. gVP Bass-test.src 1.00/0.54/1.00/0.48 | L | W1 |
| Activision Pro | activision-pro, formats-activisionPro | B | REVERIFY | ActivisionProReplayer wasm (wasmEngineRegistry.ts:729) | ActivisionProParser.ts:426; grid = replayer event stream (8c7aedfa0, 10-06 22:00, after the flags) | activisionProGridMatchesUade.test.ts, activisionProReplayerPlayhead.test.ts | S | W2 |
| Ben Daglish | ben-daglish | B | OPEN | BdEngine (bd-wasm C port); EaglePlayer BenDaglish runner exists but held (eaglePlayerFormats.ts:52-56) | BenDaglishParser.ts:1001, patterns :804, per-byte blockRows carriers; gVP motorhead 0.35/0.59/0.55/0.65, ledger mickey_mouse 0.68/0.49/0.65 | UADE Paula + runner + bd-wasm; bdEngineMatchesUade.test.ts (engine vs UADE 0.948/0.984) | L | W2 |
| Ben Daglish SID | ben-daglish-sid, formats-benDaglishSID | C-bin | GOOD | EaglePlayer runner BenDaglishSID (eaglePlayerFormats.ts:74); player binary only | BenDaglishSIDParser.ts:119, stub pattern :220 -> scope view; owner verdict on ben-daglish-sid: Good (10-06 14:33) | traceModuleReads.ts only | L | drop (decision D3) |
| SoundMon (v2, v3) | bp-soundmon-2 (frozen), bp-soundmon-3 | A | OPEN | SoundMonReplayer wasm; worklet posts no position (public/soundmon/SoundMon.worklet.js: 0 position messages) | SoundMonParser.ts:148, layout :677 (song steps x 4 tracks, 3-byte rows) | soundMonGridMatchesPlayer.test.ts; UADE (amigasrc/soundmon). gVP nicktune1 0.21-0.41, testmod.bp3 1.00/0.01/0.27 (arpeggio writers: indicative only) | M | W1 (position), W5 (bp3 decode) |
| CheeseCutter | cheesecutter | A | OPEN | cheesecutter-wasm (6502 + reSID), CheeseCutterEngine.ts | CheeseCutterParser.ts:136, patterns :354 from the .ct metadata tables | SID register writes of the 6502 player (no Paula; trace API not confirmed) | M | W8 |
| Custom Made | custommade | C-src | OPEN | UADE | CustomMadeParser.ts:160, empty grid :343 + uadePatternLayout; isCustomMadeFormat true on 5/5 corpus files (checked 10-07) | UADE Paula + voice records (amigasrc/wanted_team/CustomMade) | L | W8 |
| Darius Zendeh | darius-zendeh | C-src | OPEN | UADE | no parser (UADE_ONLY_PREFIXES) -> scan -> scope view | amigasrc/dz asm; 1 corpus song | M | W9 |
| Dave Lowe | dave-lowe, formats-daveLowe | C-src | REVERIFY | EaglePlayer runner DaveLowe (eaglePlayerFormats.ts:62) | DaveLoweParser.ts:308, patterns :415, blockRows; gVP 1.00x4 (10-07), ledger S1 | runner / UADE | S | W2 |
| Dave Lowe New | dave-lowe-new | C-src | REVERIFY | EaglePlayer runner DaveLoweNew (eaglePlayerFormats.ts:66); the flag 'Load Failed: UADE abort' predates the runner (10-06 09:xx) | DaveLoweNewParser.ts:185, patterns :332 (426 notes on m-bison.dln) | UADE aborts on m-bison.dln, so gVP is impossible: oracle = runner voice records | S | W2 (verify), W6 (fix if it fails) |
| Delta Music 1 | delta-music | A | REVERIFY | DeltaMusic1Replayer wasm; no position message (public/deltamusic1/DeltaMusic1.worklet.js: 0) | DeltaMusic1Parser.ts:183, grid :734-737 | deltaMusic1GridMatchesPlayer.test.ts; gVP triplex1 0.28-0.72 vs ledger crusaders1 0.96/0.92/1.00/0.99 (yardstick unreliable here) | S | W2 (verify), W5 (fix if it fails) |
| Desire | desire | C-src | OPEN | UADE | DesireParser.ts:208, stub pattern :298; the note on the key is a smoke-test line, not a grid verdict | amigasrc/wanted_team/Desire; subsong 1 is silent (first-audible rule) | M | W9 |
| Digital Mugician (I, II) | digital-mugician, formats-mugician | B | OPEN | DigMugReplayer wasm; no position message | DigitalMugicianParser.ts:716 layout; flag 10-06 19:01 is AFTER 7f9675391 (10-05); existing test pins expected sequences of one file only | UADE Paula + digmug trace; gVP cockwise 7 voices 1.00/1.00/0.93/0.78/0.44/0.67/0.89 (7 voices vs 4 Paula voices: ambiguous); amigasrc/wanted_team/Mugician + MugicianII | M | W4 |
| Digital Sonix & Chrome | digital-sonix-and-chrome, digital-sonix-and-chrome-David Hanlon, formats-digitalSonixChrome | C-src | REVERIFY | UADE (parser-decoded grid follows UADE ticks) | DigitalSonixChromeParser.ts:269; done 5ada02984 + dc3ff4d13 (10-06), owner: in sync, real; gVP 1.00x4 | digitalSonixChromeGridMatchesPlayer, dscPlayheadFollowsUade, traceModuleReads.oracle tests | S | W2 |
| Digital Symphony | digital-symphony | A | OPEN | libopenmpt | DigitalSymphonyParser.ts:646-701; two effects approximated (~:1220, ~:1267, from the provenance doc) | libopenmpt pattern cells (Load_dsym.cpp); harness not confirmed | S | W7 |
| Earache | earache, formats-earAche | C-bin | OPEN | UADE; player binary only | EarAcheParser.ts:104-107, one empty channel; byte-exact EASO codec exists (earAcheRoundtrip.test.ts) | UADE Paula (grid 0 events, Paula 142/13/36/36) + traceModuleReads | L | W10 |
| Fashion Tracker | fashion-tracker | A | OPEN | UADE | FashionTrackerParser.ts:130 cells, :270 patterns, located from player code (f028924b3) | fashionTrackerGrid.test.ts claims gVP 1.00x4 but gVP 10-07 on ivory tover ii.ex gives 0.47/0.25/1.00 - conflict, measure first; amigasrc/wanted_team/FashionTracker-v1.0 | S | W7 |
| Forgotten Worlds | forgotten-worlds | D | BLOCKED | UADE | no parser; UADE renders intro.fw silent (sweep B11/S6) | none (no sound to compare) | - | none (decision D2) |
| Anders Oland | formats-anders0land | C-src | OPEN | EaglePlayer runner (eaglePlayerFormats.ts:48) | Anders0landParser.ts:404 buildA0Patterns (mdt position lists + byte streams); gVP 0.50/0.82/0.44/0.45, ledger 0.98/0.58/0.94/0.66 | runner voice records + UADE; amigasrc/wanted_team/Anders0land | M | W6 |
| Ashley Hogg | formats-ashleyHogg | C-src | OPEN | UADE | AshleyHoggParser.ts:324 stub -> scope view | amigasrc/wanted_team/Ashley Hogg; gVP: grid 0 events, Paula 44 on voice 3 | M | W9 |
| Core Design | formats-coreDesign | C-src | OPEN | EaglePlayer runner (eaglePlayerFormats.ts:58) | CoreDesignParser.ts:312 stub -> scope view | runner voice records; amigasrc/wanted_team/CoreDesign; Paula 437/435/435 on voices 1-3 | M | W6 |
| Digital Sound Studio | formats-digitalSoundStudio | A | REVERIFY | DssReplayer wasm, has position hook (DssEngine.ts) | DigitalSoundStudioParser.ts:556; own engine since ae4c869ac (10-05, after the 09-24 flag) | wasm trace; amigasrc/wanted_team/DSS | S | W2 |
| Future Composer 1.3/1.4 | formats-fc, future-composer-1.3 (out of sync) | A | OPEN | FutureComposerReplayer wasm; no position message (public/fc/FC.worklet.js: 0) | FCParser.ts:1373 patterns, macro simulation :1052; FC-BSI/Follin stub :661-677 | UADE; gVP adept 1.00/1.00 (2 voices empty), commando 1.00/0.85/0.44/0.40 | M | W1 |
| Fred Editor | formats-fred, fredmon | B | REVERIFY | FredReplayer2 wasm | FredEditorModule.ts + fredEditorGrid.ts (e4d9eb725, c5e575e84, 9ee300e34, all 10-06 after the 10-02 flags); gVP fireworks ii 1.00x4, bomb jack 0.57/1.00/1.00 | fredEditorGridMatchesPlayer.test.ts, fredReplayerPlayhead | S | W2 |
| Fred Gray | formats-fredGray | C-bin | OPEN | UADE; binary only | FredGrayParser.ts:162 stub | traceModuleReads; Paula 125/125/125 | L | W10 |
| Future Player | formats-futurePlayer, future-player | B | OPEN | FuturePlayer wasm (futureplayer-wasm); no position message | FuturePlayerParser.ts:299 decodeBlock, voice streams linearised, shared subroutine graph flattened; grid 2055 events vs Paula 440; gVP 0.55/0.54/0.55 and 0.30/0.57/0.35/0.77 | UADE Paula + wasm; amigasrc/wanted_team/FuturePlayer | L | W3 |
| GlueMon | formats-gluemon, gluemon | C-bin | OPEN | UADE; binary only | GlueMonParser.ts:170 (5-byte cells in a located region); gVP 0.27/0.21/0.20; Paula shows 0 events on 3 voices (yardstick blind) | traceModuleReads | M | W10 |
| InStereo! 1 | formats-inStereoAmbiguous (fantasi8.is) | A | REVERIFY | InStereo1Replayer wasm | InStereo1Parser.ts:477-609; playhead 4213e42ea and keyboard 943c9f42e (10-07, after the 09-25 flag) | instereoPlayheadFollowsGrid.test.ts | S | W2 |
| InStereo! 2 | instereo!-2.0 | A | REVERIFY | InStereo2Replayer wasm | InStereo2Parser.ts:668; cde690718 (10-07, after the 10-02 flag) | instereo2TrackLenGrid.test.ts, instereoPlayheadFollowsGrid.test.ts | S | W2 |
| JamCracker | formats-jamcracker | A | GOOD | JamCracker wasm, has position hook | JamCrackerParser.ts:311; owner verdict on this key: Good (10-02 20:45) | jamCrackerRoundtrip.test.ts | - | drop (decision D3) |
| Jason Brooke | formats-jasonBrooke | C-bin | OPEN | UADE; binary only | JasonBrookeParser.ts:69 stub; ledger: tick-rebuilt scan grid scored 0.97 on ikari_warriors.jb | traceModuleReads; Paula 61/24/14/81 | L | W10 |
| Jason Page | formats-jasonPage | C-src | OPEN | UADE | JasonPageParser.ts:477 stub; the flag is 'Load Failed' = companion SMP.virocop-14 not fetched (sweep plan open item), not a grid fault | amigasrc/wanted_team/JasonPage | M | W9 |
| Jeroen Tel | formats-jeroenTel | C-src | OPEN | UADE (injectUADE) | JeroenTelParser.ts:482-647 track byte stream (Play_1 encoding); gVP 0.43/0.71/1.00/1.00 | UADE Paula + voice records; amigasrc/wanted_team/JeroenTel | M | W8 |
| Jesper Olsen | formats-jesperOlsen | C-src | OPEN | UADE | JesperOlsenParser.ts:221 + jesperOlsenGrid.ts + JesperOlsenModule.ts (8ff7677a5: L/G songs decoded, Format 0 still scan, playhead + CI test open); gVP 0.61/0.74/0.36/0.34 | UADE Paula + voice records; research 2026-10-06_jesper-olsen-format.md | M | W6 |
| Music Assembler | formats-musicAssembler | B | OPEN | MusicAssembler wasm (wasmEngineRegistry.ts:177); no position message | MusicAssemblerParser.ts:399 decodeTrack, patterns :767, per-byte blockRows | UADE (amigasrc/ma) + ma-wasm trace | M | W3 |
| MusicLine Editor | formats-musicLine (empty, frozen, silent) | B | OPEN | MusicLine wasm (has onPosition) | MusicLineParser.ts:477 PARTs; parseMusicLineFile on harmonic disorder.ml gives 29 patterns / 402 notes (run 10-07), so the 'empty' fault is not the decoder: wiring or engine - unconfirmed | musicline-wasm trace; amigasrc/musicline_editor | L | W3 |
| Rob Hubbard | formats-robHubbard | C-src | REVERIFY | UADE (injectUADE, AmigaFormatParsers.ts:506-513); robhubbard-wasm serves the keyboard voice only | RobHubbardParser.ts:415 decodeRHBlock + tick grid; gVP 1.00x4; no grid commit since 07-12 | UADE Paula; amigasrc/wanted_team/RobHubbard | S | W2 |
| Ron Klaren | formats-ronKlaren | B | OPEN | RonKlarenReplayer wasm (6d1e20344, 10-05); no position message | RonKlarenParser.ts opcode scan; sparse (125 notes / 3072 rows, provenance doc) | ronklaren-wasm trace + UADE | M | W4 |
| Sawteeth | formats-sawteeth (missing notes) | B | OPEN | Sawteeth wasm (NostalgicPlayer C# port); no position message | SawteethParser.ts:604 (per-channel steps + parts); no grid commit since 04-14 | replayer trace only (UADE has no Sawteeth player): not independent, check against the C# source | M | W5 |
| SidMon 2 | formats-sidmon2 (out of sync) | A | OPEN | SidMon2 wasm; no position message (public/sidmon2/Sd2.worklet.js: 0) | SidMon2Parser.ts:882-942 (3-pass interleaved tracks); blockRows; gVP bruno_time 0.47/0.81/0.79/0.42 | UADE Paula; sd2 trace | M | W1 |
| Sonic Arranger | formats-sonicArranger | A | REVERIFY | SonicArranger wasm (SOARV1.0 only; 4EFA modules stay on UADE, SonicArrangerParser.ts doc d9cfa2489); position hook d98a02cf1 | SonicArrangerParser.ts:735-989; gVP almighty.sa 1.00x4 | nativeReplayerPlayheadFollowsGridRow.test.ts | S | W2 |
| Sound Control | formats-soundControl | A | OPEN | SoundControlReplayer wasm; no position message | SoundControlParser.ts:448-546 (track list + 4-byte rows) | soundcontrol-wasm trace; amigasrc/wanted_team/Soundcontrol (gVP could not detect the file: tool side) | S | W5 |
| Sound Factory | formats-soundFactory (out of sync) | B | OPEN | SoundFactory2Replayer wasm; no position message | SoundFactoryParser.ts:666-815 (command stream per voice, first sub-song) | UADE (amigasrc/wanted_team/Soundfactory) + wasm | M | W1 |
| Sound Master | formats-soundMaster | C-src | REVERIFY | UADE (injectUADE) | SoundMasterModule.ts + soundMasterGrid.ts (c2cc825a8, 10-06); owner then said 'almost correct' - whether a later fix landed is unconfirmed (no later commit in git log -- SoundMasterParser.ts); gVP 0.87/0.80/0.36/0.90 | soundMasterGridMatchesPlayer, soundMasterPlayheadFollowsUade | S | W2 |
| SoundFX | formats-soundfx | A | OPEN | UADE (no SoundFX key in wasmEngineRegistry; soundfx-wasm exists but is not a registry engine, checked 10-07) | SoundFXParser.ts:376-587; effects 7-9 approximated :501-525 (provenance doc) | UADE Paula; gVP batdance 1.00 (ledger) | S | W5 |
| Tomy Tracker | formats-tomyTracker | A | OPEN | UADE | TomyTrackerParser.ts:142; note fix 4e4a1bd38 (byte3/2); gVP 0.94/0.72/1.00/1.00 | UADE Paula; amigasrc/wanted_team/TomyTracker | S | W7 |
| Wally Beben | formats-wallyBeben | C-src | OPEN | EaglePlayer runner (eaglePlayerFormats.ts:70) | WallyBebenParser.ts:142 decodePhraseToRows, patterns :273; gVP 0.09/0.13/0.08/0.27 (worst measured) | runner voice records + UADE; amigasrc/wanted_team/WallyBeben | M | W6 |
| Actionamics | formats-uade_ast (dynablaster.ast) | B | REVERIFY | ActionamicsReplayer wasm | ActionamicsParser + actionamicsGrid.ts (0f1f6518a, 10-06 20:35, after the 09-24 flag) | actionamicsGridMatchesPlayer.test.ts | S | W2 |
| Beathoven Synthesizer | formats-uade_bss | C-bin | OPEN | EaglePlayer runner (eaglePlayerFormats.ts:79); binary only | no parser output (stub) -> scope view | traceModuleReads | L | W10 |
| DeliTracker customs | formats-uade_cus | D | BLOCKED | UADE cannot run skyfox.cus ('score crashed', sweep B13, owner: accept) | no parser | none | - | none (decision D2) |
| David Hanney | formats-uade_dh | C-bin | OPEN | UADE; binary only | DavidHanneyParser stub (320 empty rows) | traceModuleReads | L | W10 |
| Tim Follin (Follin Player II) | formats-uade_tf | C-bin | OPEN | UADE; binary only | FCParser.ts:661-677 returns a stub for Follin | traceModuleReads | L | W10 |
| Jochen Hippel (.hip Amiga) | hippel | B | OPEN | Hippel TFMX decoder (libtfmxaudiodecoder) via hippelFileData | AmigaFormatParsers.ts:2213 -> parseJochenHippelAmigaSogFile: one empty pattern | reuse JochenHippelSTModule decode (COSO / raw TFMX); UADE amigasrc/hippel | M | W2 |
| Jochen Hippel 7V | hippel-7v | B | OPEN | Hippel TFMX engine, 7 voices (367c0c662) | JochenHippel7VParser.ts:272; gVP 0.54/0.29/0.93/0.72/0.67/0.04/0.06 (7 voices vs 4 Paula voices: ambiguous) | UADE (amigasrc/wanted_team/Jochen_Hippel_7V) voice records | M | W2 |
| Jochen Hippel ST | hippel-st | C-src | REOPEN | UADE (injectUADE) | JochenHippelSTParser.ts:130 + JochenHippelSTModule.ts; walk done c5a654764 (10-06 11:57) but the owner flagged wrong-patterns at 10-06 21:33, AFTER it | jochenHippelSTGridMatchesPlayer.test.ts (voice-record oracle; gVP is blind: the ST player writes the period every tick) | S | W2 |
| Images Music System | images-music-system | A | OPEN | libopenmpt (Load_ims.cpp) | ImagesMusicSystemParser.ts:194 empty-grid stub | libopenmpt pattern cells + amigasrc/wanted_team/ImagesMusicSystem; Paula 81/86/68 | S | W7 |
| Infogrames | infogrames-infogrames | C-src | OPEN | UADE | InfogramesParser.ts:158-161 empty 1-channel grid (whole-file carrier codec 08fa86507); companion bank bob4.ins is a separate open item | amigasrc/infogrames asm | M | W9 |
| Klystrack | klystrack (out of sync, wrong patterns, wrong meters) | A | OPEN | KlysSynth / klystrack-wasm (source in Reference Code/klystrack-master), has onPosition | KlysParser.ts:453-560 (patterns + sequences) | klystrack-wasm trace (no UADE; UADE refuses the file) | M | W7 |
| MusicMaker V8 | musicmaker-v8 | B | OPEN | MusicMaker worklet from the author's asm (wasmEngineRegistry.ts:501), native for split .sdata (64873f240); route for single-file .mm8 unconfirmed | MusicMakerParser.ts:289 stub; AmigaFormatParsers.ts parseMusicMaker8VFile; gVP: 8 channels, 0 events | amigasrc/music_maker; musicMakerPlays.test.ts | M | W4 |
| SynTracker | syntracker (frozen) | A | OPEN | UADE; binary only | SynTrackerParser.ts:106-175 (128x4 position lists + patterns); reached only via NATIVE_ROUTES, firing not confirmed - frozen suggests the scan or the position mapping | UADE Paula | S | W5 |
| TCB Tracker | tcb-tracker | A | OPEN | libopenmpt per provenance doc (format-state says uade-generic: unconfirmed) | TCBTrackerParser.ts:310-454; gVP m-demo3 1.00/0.21/0.50/0.58 | UADE Paula; amigasrc/wanted_team/TCB Tracker | S | W7 |

Sizes: S about one session, M two to three, L a multi-day reverse. Line numbers marked "~" or
"from the provenance doc" were not re-read this session. "gVP" = tools/uade-audit/gridVsPaula.ts
run 10-07 with --secs 20 (raw output in the session scratchpad, not committed).

## Re-verify list (fixed after the flag; the owner re-looks, the bar test is applied in U6)

Activision Pro, Digital Sonix & Chrome (3 keys), Fred Editor (2 keys), Sound Master, Actionamics
(formats-uade_ast), Sonic Arranger, Dave Lowe, Dave Lowe New, Rob Hubbard, Delta Music 1,
Digital Sound Studio, InStereo! 1 and 2. Reopen: Jochen Hippel ST (the owner flagged it AFTER the
walk landed; needs the failing row/voice from him or a bar-test failure).

## Waves (at most 3 parallel units each; a wave starts after the previous one is merged)

Order = shared machinery first (kit, position reporting), then the biggest corpus (SunTronic 272
songs), then families that share a replayer (Hippel, Amiga-asm runner), then single formats by
corpus size. Every unit: one format family, one commit series, no push per commit (batch pushes),
type-check after every change, wasm rebuilt and the built file committed with its source.
Common brief for every unit: read the format's research doc in thoughts/shared/research/ if one
exists, run `tools/uade-audit/gridVsPaula.ts <file>` for the starting number, write the failing
bar test first (revert check: it must fail on the old grid), then fix.

### Wave 1

- **U1 Oracle kit (M) - DONE 2026-10-07.** Paula-log load/render/drain/note-on rules and chip-RAM access now live in src/engine/__tests__/gridOracle.ts (PaulaSession, PaulaNoteOns, drainPaulaLog, chipRamEngine) plus compareGridToWalk (bar items 1-3 and 5); the 8 copy-pasting tests (sidmon1, activisionPro, fredEditor, digitalSonixChrome, soundMaster x2, dscPlayhead, hippelST) are re-pointed, behaviour unchanged (45 tests green). Not done from the original brief: the voice-record sampler and the event-log reader were not extracted (no second user yet). Files: new src/engine/__tests__/gridOracle.ts (paula log reader from
  sidmon1GridMatchesUade.test.ts, voice-record sampler from jochenHippelSTGridMatchesPlayer.test.ts,
  event-log reader from actionamicsGridMatchesPlayer.test.ts, and `assertGridIsPlayersWalk(song, events)`
  implementing the bar items 1-5); migrate sidmon1 and hippel-ST tests onto it as proof and delete the
  copies. Test: src/engine/__tests__/gridOracle.test.ts (anarchy.sid1; asserts the sentinel counter
  and that a deliberately shifted grid fails). Unblocks U6 and every later unit.
- **U2 Position reporting for four native replayers (M). DONE 2026-10-07 (e926bce15; verified by nativeReplayerPlayheadFollowsGridRow.test.ts).** Formats: SoundMon (frozen), Future Composer
  (out of sync), SidMon 2 (out of sync), Sound Factory (out of sync). Template: commit d98a02cf1
  (C `*_get_position` + worklet `{type:'position',songPos,row}` + Engine.onPositionUpdate through
  PositionCallbacks.ts). Files: soundmon-wasm + public/soundmon + src/engine/soundmon/SoundMonEngine.ts;
  fc-wasm/futurecomposer-wasm (which one FutureComposerReplayer loads: unconfirmed, check
  wasmEngineRegistry.ts:830) + src/engine/fc/FCEngine.ts; sidmon2-wasm + Sd2Engine.ts;
  soundfactory-wasm + SoundFactory2Engine.ts. Test: add four cases to
  src/engine/__tests__/nativeReplayerPlayheadFollowsGridRow.test.ts (reported positions walk the grid;
  a grid note sounds at the reported row). Then re-ask the owner whether the flags remain (data vs sync).
- **U3 SunTronic (L) - DONE 2026-10-07.** Measured: 193 distinct V1.3 files in the two corpus folders (not 272). Walk = SunTronicPlayer sequencer via new SunTronicWalk.ts (groupRecorder/passRecorder hooks, walkOnly). Grid equals the walk per voice per row (notes, instruments, commands) on 192 of 193; the one real fault (mic-0001: a group of several note-ons showed the first, the player sounds the last) is fixed in sunGroupCodec.ts. One song (smooth: per-voice speed 0x8f, voices on different row clocks) cannot be a row-aligned grid and opens in the scope view with gridUnmatchedReason recorded. Eight songs have a sub-row offset (0x98 in voice 1's stream reaches the other voices late, 2-5 steps inside a 6-10 step row): not representable in a tracker row, asserted bounded. Independent oracle: the player's per-vblank period equals UADE's Paula PER on every voice (>=0.93 per voice, most 1.000) over the corpus. Lightforce and Bass-test.src both match the walk; what the owner sees wrong there is not in the grid-vs-walk data (open: owner re-look). Raw rips: pseudo oops.sun is not recognised by isSunTronicRawRip (offset 8 is 4A2E07C0), goes through the UADE scan and already opens in the scope view; the 5 raw rips named below are not in the repo corpus. Not done: playhead (SunTronicSongEngine posts no position; plan item 7). Files: SunTronicParser.ts:327, SunTronicV13.ts, sunReproject.ts,
  src/engine/suntronic/SunTronicSongEngine.ts. Oracle: UADE Paula (asm amigasrc/suntronic) and the
  engine's own voice trace, per voice per row, over every V1.3 corpus song; the 5 raw rips and
  "Lightforce" (extensionless) must either match or open the scope view. Memory notes: tank1 PER
  must stay green (cycle-accurate Paula DMA gap is known, +/-2 ticks: tolerate exactly that, document).
  Test: src/engine/__tests__/sunTronicGridMatchesPlayer.test.ts. Unconfirmed: what exactly the owner
  sees wrong on Lightforce and Bass-test.src; ask or let the bar test list the first 10 mismatches.

### Wave 2

- **U4 Hippel family (M): Hippel .hip (Amiga), 7V, ST reopen. DONE 2026-10-07 (dac96670a decoder walk export, 8f1d24a69 .hip + 7V grids, ST tests in jochenHippelSTGridMatchesPlayer.test.ts).**
  Result: .hip and 7V grids are a TS walk (src/lib/import/formats/HippelTfmxWalk.ts) held tick for tick to the TFMX decoder's own walk
  export (tfmx_module_walk_*), tests hippelTfmxWalkMatchesDecoder + hippelTfmxGridMatchesPlayer (not the plan's file names; the oracle is
  the decoder that plays them, not UADE voice records). ST: no corpus failure reproduced - every subsong, whole pass, grid cell and
  playhead held to the player's voice records; the owner's failing row is still needed. Open: sound-sequence pitch (an instrument's own
  transposition or fixed note) is not in the cell; ST step attenuation ($Fx) not checked against a player field; only subsong 0 of .hip/.hip7
  (the engine plays subsong 0). Original brief: Reuse
  src/lib/import/formats/JochenHippelSTModule.ts (COSO / raw TFMX decode + simulate) for the Amiga
  `.hip` (AmigaFormatParsers.ts:2213 currently an empty pattern); 7V: JochenHippel7VParser.ts:272;
  ST: apply bar items 1-8 to all 8 corpus files and get the owner's failing row. Oracle: voice records
  (offsets from amigasrc/hippel and wanted_team/Jochen_Hippel_7V). Tests:
  src/engine/__tests__/hippelAmigaSogGridMatchesPlayer.test.ts, hippel7VGridMatchesPlayer.test.ts,
  extend jochenHippelSTGridMatchesPlayer.test.ts.
- **U5 Ben Daglish (L) - DONE 2026-10-07 (subsong 0 only; other subsongs open).** Walk = bd_walk in ben_daglish.c (every track and position-list command with tick, voice, track, byte), BenDaglishWasmExtractor.ts, grid benDaglishGrid.ts (50 Hz tick rows, notes named by the period they play, effect block 0xD8..0xEC), carriers kept (benDaglishRoundtrip.test.ts green), position reporting (bd_play_tick -> Bd.worklet.js -> BdEngine.onPositionUpdate; case added to nativeReplayerPlayheadFollowsGridRow.test.ts). Oracle UADE Paula, mickey_mouse.bd and motorhead-titleandingame.bd: every sample start is a grid note with the same pitch and every grid note a sample start (benDaglishGridMatchesPlayer.test.ts, revert-checked); bdEngineMatchesUade green. Open: motorhead has 3 subsongs, the parser reads only the first; an unmatched song falls through withNativeThenUADE to the UADE scan grid on zero notes (not the scope view). Brief was: BenDaglishParser.ts:804/1001 + bd-wasm + src/engine/bd; add a walk to the C
  port, grid from the walk, blockRows carriers kept (benDaglishRoundtrip.test.ts). Oracle: UADE Paula
  + the runner (BenDaglish id, held) with bdEngineMatchesUade.test.ts as the engine-vs-UADE gate: if
  the port differs from UADE the grid follows UADE and the port is fixed first. Test:
  src/engine/__tests__/benDaglishGridMatchesPlayer.test.ts.
- **U6 Re-verify sweep (S-M). RUN 2026-10-07; table below, new units W2-a..W2-f opened.** Test:
  src/engine/__tests__/reverifiedGridsArePlayersWalk.test.ts (34 songs, every in-repo corpus song of the 13
  formats; Paula note-on reader shared with gridVsPaula.ts via tools/uade-audit/gridVsPaulaCore.ts).
  Limits, stated plainly: the whole-corpus check covers bar item 1-2 as NOTE ORDER and PITCH STEPS only (intervals; instruments,
  note-offs, commands, row timing are NOT compared by it). The interval score is lenient (a shuffled grid still scores 1.0 on
  sparse voices) and blind to arpeggio/slide writers (Sound Master, Activision, Actionamics score 0.3-0.5 here while their own
  exact-timing tests pass). So a verdict is exact only where an exact oracle exists.

  | Format (corpus songs) | Verdict | Evidence |
  |---|---|---|
  | Activision Pro (1) | PASS 1/1 | activisionProGridMatchesUade (exact timing, period, retrigger) + playhead test |
  | Digital Sonix & Chrome (13) | PASS 12/13 notes, 1 open | all 13: UADE note-ons are the grid's first notes in order on every voice (new exact test, whole song or 200 s); 4 songs of 1 note each equal. OPEN: fanfares.dsc, UADE plays 287/364/533/577 note-ons in 200 s, grid shows 14/3/14/3 (W2-a) |
  | Fred Editor (4) | PASS 3/3 testable, 1 untestable | fredEditorGridMatchesPlayer exact on fireworks ii, rebels, bomb jack; fuzzball-title: UADE refuses the file (ret -1), only the instrument/command test applies |
  | Sound Master (3) | PASS 3/3 | soundMasterGridMatchesPlayer exact (period + row) on all three |
  | Actionamics (1) | PASS 1/1 | actionamicsGridMatchesPlayer (worklet event log) |
  | Sonic Arranger (2) | NOTE ORDER OK 2/2, timing/instr/commands UNVERIFIED | yardstick 0.99-1.00; almighty exact opening on all voices, mega end 0.43-0.54 exact-prefix (W2-b) |
  | Dave Lowe (1) | NOTE ORDER OK, 1 voice to look at | yardstick 1.00x4; voice 2 exact-prefix 0.42 (W2-b) |
  | Dave Lowe New (1) | UNVERIFIED | yardstick 0.88-1.00 (UADE does play m-bison here), exact-prefix 0.01-0.14 (W2-b) |
  | Rob Hubbard (2) | PASS 2/2, exact (W2-c DONE 2026-10-07, cba774ad8) | was: skateordie ch1 0.59 (notes named by table index + 25, not by the period the sample scale gives). Now every Paula note-on of both songs is the grid note on its row with the grid instrument's sample: skateordie 2432/1672/925/251 note-ons over the whole 243 s pass, centurion_battle through its song end (robHubbardGridIsPlayersWalk.test.ts); yardstick 1.00, exact-prefix 1.00 on every playing channel |
  | Delta Music 1 (2) | UNVERIFIED, likely FAIL | yardstick 0.28-0.30 on 7 of 8 channels, exact-prefix 0.00; existing test pins the opening notes of two voices only (W2-d) |
  | Digital Sound Studio (2) | PASS 2/2 notes | exact leading notes on every voice (floor 0.95 asserted, shuffle-teeth on zrimay) |
  | InStereo 1 (1) | UNVERIFIED, likely FAIL | yardstick 0.25/0.69/0.64/1.00 (W2-e) |
  | InStereo 2 (2) | UNVERIFIED, likely FAIL | yardstick 0.28-0.50 on all 8 channels (W2-e) |

  New units (no failure was confirmed small; each needs an exact oracle first):
  - W2-a DSC fanfares: UADE re-arms pitch 16 on voices 1 and 3 hundreds of times, the grid holds it as one note. Find whether the record loops (grid should show retriggers) or the oracle counts sample-loop re-arms.
  - W2-b Sonic Arranger, Dave Lowe, Dave Lowe New: exact oracle (timing, instruments, note-offs, commands) from the wasm event log / runner; mega end.sa, incredibleshrinkingsphere voice 2, m-bison.dln.
  - [x] W2-c Rob Hubbard: DONE (cba774ad8), see the table row.
  - W2-d Delta Music 1: exact oracle from DeltaMusic1Replayer's event log; both corpus songs.
  - W2-e InStereo 1 and 2: exact oracle from the replayers' event logs; three corpus songs.
  - W2-f Fred Editor fuzzball-title: no UADE oracle; decide whether the replayer log is the oracle.

### Wave 3

- **U7 Future Player (L).** FuturePlayerParser.ts:299 flattens shared subroutines (2055 grid events
  vs 440 Paula); build the grid from futureplayer-wasm walking calls/returns/loops, carrier keeps
  the byte-exact raw-block codec (futurePlayerRoundtrip.test.ts). Oracle: UADE Paula (asm
  wanted_team/FuturePlayer). Include position reporting. Test: futurePlayerGridMatchesPlayer.test.ts.
- **U8 Music Assembler (M).** MusicAssemblerParser.ts:399/767 + ma-wasm (registry :177) + position
  reporting; oracle UADE (amigasrc/ma) Paula + ma-wasm trace. Test: musicAssemblerGridMatchesPlayer.test.ts.
- **U9 MusicLine (L).** First reproduce "empty / frozen / silent" (parser alone gives 402 notes, so the
  fault is in wiring or the engine), then the PART walk (MusicLineParser.ts:477) against
  musicline-wasm (has onPosition) and amigasrc/musicline_editor. Test: musicLineGridMatchesPlayer.test.ts.

### Wave 4

- **U10 MusicMaker V8 (M).** Confirm the single-file .mm8 route (MusicMakerParser.ts:289 stub,
  gVP 0 events on 8 channels); the worklet from the author's asm is the walk; oracle amigasrc/music_maker
  and UADE. Test: musicMakerGridMatchesPlayer.test.ts (musicMakerPlays.test.ts stays).
- **U11 Digital Mugician I/II (M).** DigitalMugicianParser.ts:716 + digmug-wasm: walk including the
  Pattern Length effect and the 7-voice pairing (Mugician II_v8.asm), all 5 corpus songs, replace
  the one-file expected sequences; position reporting. Test: digitalMugicianGridMatchesPlayer (move
  into src/engine/__tests__/ so it is in CI by glob).
- **U12 Ron Klaren (M).** RonKlarenParser.ts opcode scan (125 notes / 3072 rows is too sparse to
  believe) against ronklaren-wasm walk + UADE; keep ronKlarenEditKeepsWait.test.ts green; position
  reporting. Test: ronKlarenGridMatchesPlayer.test.ts.

### Wave 5

- **U13 Sawteeth (M).** SawteethParser.ts:604 + sawteeth-wasm; no UADE player exists, so the oracle is
  the replayer's trace checked against the C# source (NostalgicPlayer SawteethWorker.cs): "missing
  notes" = parts/steps the grid drops. Position reporting. Test: sawteethGridMatchesPlayer.test.ts.
- **U14 SynTracker (S-M, 16 songs).** Confirm whether the NATIVE_ROUTES entry fires (UADEParser.ts
  ~:1040); frozen = scan grid or position mapping; oracle UADE Paula. Test:
  synTrackerGridMatchesPlayer.test.ts.
- **U15 UADE-comparable classics (M).** Sound Control (SoundControlParser.ts:448), SoundMon v3
  decode (testmod.bp3 gVP 1.00/0.01/0.27), Delta Music 1 arpeggio columns, SoundFX effects 7-9
  (SoundFXParser.ts:501-525). One test file per format, each over its own corpus.

### Wave 6 (runner family; oracle = our runner's memory, UADE not needed)

- **U16 Wally Beben + Dave Lowe New (M).** WallyBebenParser.ts:142/273 (gVP 0.09-0.27) and
  DaveLoweNewParser.ts:332; UADE aborts on m-bison.dln so the runner is the only oracle.
  Tests: wallyBebenGridMatchesPlayer.test.ts, daveLoweNewGridMatchesPlayer.test.ts.
- **U17 Anders Oland + Core Design (M).** Anders0landParser.ts:404, CoreDesignParser.ts:312 (stub);
  runner voice records from amigasrc/wanted_team/Anders0land and CoreDesign.
- **U18 Jesper Olsen finish (M).** Format 0 (guldkornsexpressen, routine inside the file) still scans;
  L playhead and the UADE CI test are open (8ff7677a5); gVP 0.61/0.74/0.36/0.34 says the L/G grid is
  not yet the walk. Test: jesperOlsenGridMatchesPlayer.test.ts.

### Wave 7

- **U19 Fashion Tracker + Tomy Tracker + TCB Tracker (S each).** MOD-like cells over UADE with asm
  (wanted_team/FashionTracker-v1.0, TomyTracker, TCB Tracker). Fashion: resolve the contradiction
  between fashionTrackerGrid.test.ts (claims 1.00) and gVP 0.47/0.25/1.00 first.
- **U20 Digital Symphony + Images Music System (S each).** libopenmpt is the engine; oracle =
  libopenmpt's own pattern cells (harness to write, unconfirmed) plus Paula for IMS (asm
  wanted_team/ImagesMusicSystem). DigitalSymphonyParser.ts effect approximations; ImagesMusicSystemParser.ts:194 is an empty stub.
- **U21 Klystrack (M).** KlysParser.ts:453-560 against klystrack-wasm (source Reference Code/klystrack-master);
  out-of-sync + wrong-patterns + wrong-meters: sequence-step pattern lengths and track speed;
  oracle = engine trace (UADE cannot load it).

### Wave 8

- **U22 CheeseCutter (M).** CheeseCutterParser.ts:354 vs the SID register writes of the 6502 player
  in cheesecutter-wasm; a register-trace export may be needed (unconfirmed).
- **U23 Jeroen Tel (M).** JeroenTelParser.ts:482-647 vs UADE voice records (asm wanted_team/JeroenTel).
- **U24 Custom Made (L).** Patterns live inside the 68k code (CustomMadeParser.ts:343); voice records from
  amigasrc/wanted_team/CustomMade; 5 corpus files.

### Wave 9 (small corpora, asm available)

- **U25 Infogrames (M)**: InfogramesParser.ts:158; amigasrc/infogrames. **U26 Desire + Jason Page (M)**:
  DesireParser.ts:298, JasonPageParser.ts:477; fix the SMP.virocop-14 companion path first (separate
  open item). **U27 Ashley Hogg + Darius Zendeh (M)**: AshleyHoggParser.ts:324, no parser for dz.

### Wave 10 - owner decision (D1)

C-bin: GlueMon, Jason Brooke, Fred Gray, Earache, Beathoven Synthesizer, David Hanney, Tim Follin,
Ben Daglish SID. About 18 corpus songs, no player source, each L.

## Owner decisions

- **D1 C-bin (8 formats).** Option 1: per-tune 68k reverse with traceModuleReads (L each, uncertain).
  Option 2: keep the scope view, which the no-guess rule already gives. Recommended: option 2 for all
  eight; revisit only Jason Brooke (tick-rebuilt scan already 0.97) and GlueMon (grid partly decoded)
  after wave 8, because they have the decisive trade-off: partial data already exists.
- **D2 Forgotten Worlds and DeliTracker customs.** No oracle can exist (UADE silent / "score crashed",
  sweep B11/B13). Recommended: accept the scope view and close both.
- **D3 Ben Daglish SID and JamCracker.** Owner verdict Good (10-06 14:33, 10-02 20:45) next to a stale
  "incorrect" status. Recommended: drop both from the list.
- **D4 Wave order.** Recommended as written (kit and position reporting before any format work,
  because 15 engines lack position reporting and every later unit needs the kit).

## Unconfirmed (not verified this session)

- Whether the flags dated before a fix still reproduce: nothing was listened to; all state is from
  git log and tests.
- (RESOLVED 2026-10-07) FutureComposerReplayer loads futurecomposer-wasm (FutureComposerEngine -> public/futurecomposer/FutureComposer.*); fc-wasm / public/fc is the keyboard-voice FCEngine/FCSynth.
- Engine of TCB Tracker and Digital Symphony (provenance doc says libopenmpt; tools/format-state.json says uade-generic for TCB).
- MusicLine "empty/frozen/silent" cause; Hippel ST's remaining fault; Sound Master after the owner's "almost correct".
- A libopenmpt pattern-cell oracle harness and a CheeseCutter register trace were not found; both may need to be written.
- Corpus counts per format beyond the provenance doc were not recounted (the provenance doc itself warns counts truncate).

## Position reporting progress (U2 and its extension, 2026-10-07)

Done (worklet posts songPos+row, engine has onPositionUpdate, corpus-song test in
nativeReplayerPlayheadFollowsGridRow.test.ts): SoundMon (e926bce15), Future Composer (e926bce15),
SidMon 2 (e926bce15), Sound Factory (e926bce15; row = 50 Hz tick, patterns of 64; the sample starts on the
tick of the note or the next, by instrument), Delta Music 1 (reference = longest track), Digital Mugician (4-voice file).
Not done, because the grid itself is not time-aligned to one global row, so a position would point at the wrong cell:
Music Assembler (grid = decoded track events zipped per position, voices drift), Sound Control (event rows, voices advance
the position independently), Sawteeth (per-part speed, channels not row-aligned), Ron Klaren (sparse opcode scan),
Future Player (flattened subroutine graph). Each is blocked on its own grid-from-walk unit (U7, U8, U12, U13, U15); position
reporting comes with that walk.

## G11 additions: every other reconstructed grid (2026-10-07, thoughts/shared/research/2026-10-07_reconstructed-grids-audit.md)

Source: the registry audit. 144 of 279 FORMAT_REGISTRY keys are classed RECONSTRUCTED (a static guesser, heuristic walker, UADE scan or a stub grid that falls to the UADE scan); the 25 listed in the 61-format table above keep their U-ids, the rest become the units below. Guard: src/engine/__tests__/gridProvenanceGuard.test.ts + src/lib/import/gridProvenance.ts: a key with no entry, or RECONSTRUCTED without a unit id defined in this file, fails CI.
Size rule used here: asm source of the player in third-party/uade-3.05/amigasrc = M, binary-only player or no source = L (reverse work). Sizes are estimates, not measured. Class column of the research doc is from the 10-06 provenance audit (H rows = judged from code/header, no corpus song).

- **U28 C-bin family (Wave 10, owner decision D1)**: GlueMon, Jason Brooke, Fred Gray, Earache, Beathoven Synthesizer (uade_bss), David Hanney (uade_dh), Tim Follin (uade_tf). Recommended in D1: keep the scope view. Registry keys carry U28 so the guard accepts them until D1 is answered.
- **G11-uade-only (M to start, then per format)**: the 61 `uade_*` registry keys have no native parser entry. Step 1: map each key to the parser AmigaFormatParsers.ts routes its prefix to (e.g. uade_ast to Actionamics, uade_fredmon to Fred, uade_hip/uade_sog to Hippel ST, uade_sun to SunTronic, uade_tomy to Tomy, uade_rkl to Ron Klaren) and move the key to that format's class in gridProvenance.ts; step 2: what is left is a true UADE-scan grid, one unit each. Not verified per key in this audit.

| Unit | Format (registry key) | Engine | Oracle | Size |
|---|---|---|---|---|
| G11-midi | midi | none (sampler) | the .mid event list (quantise round-trip: no note lost or moved by more than half a row) | S |
| G11-soundFactory | soundFactory | SoundFactory2Replayer | UADE Paula + SoundFactory2Replayer event log | M |
| G11-magneticFieldsPacker | magneticFieldsPacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/MagneticFieldsPacker | M |
| G11-speedySystem | speedySystem | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-tronic | tronic | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-medley | medley | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/medley; Replayers/MedleySoundEditor | M |
| G11-lme | lme | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/LME | M |
| G11-markCooksey | markCooksey | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/mark_cooksey_old | M |
| G11-quartet | quartet | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Quartet; Replayers/Quartet | M |
| G11-synthPack | synthPack | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Synth Pack | M |
| G11-mmdc | mmdc | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/MMDC | M |
| G11-psa | psa | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/PSA | M |
| G11-tme | tme | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/TME; Replayers/TheMusicalEnlightment | M |
| G11-laxity | laxity | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-musicMaker4V | musicMaker4V | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/music_maker | M |
| G11-specialFX | specialFX | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/SpecialFX | M |
| G11-timeTracker | timeTracker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/TimeTracker | M |
| G11-cinemaware | cinemaware | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Cinemaware | M |
| G11-novoTradePacker | novoTradePacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/NovoTradePacker | M |
| G11-alcatrazPacker | alcatrazPacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Alcatraz_Packer | M |
| G11-bladePacker | bladePacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/BladePacker | M |
| G11-multiMediaSound | multiMediaSound | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/MultiMedia_Sound; Replayers/MultimediaSound | M |
| G11-seanConran | seanConran | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/SeanConran | M |
| G11-thomasHermann | thomasHermann | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/ThomasHermann | M |
| G11-titanicsPacker | titanicsPacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Titanics Packer | M |
| G11-krisHatlelid | krisHatlelid | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/KrisHatlelid | M |
| G11-ntsp | ntsp | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/NTSP-system | M |
| G11-moshPacker | moshPacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Mosh Packer | M |
| G11-jankoMrsicFlogel | jankoMrsicFlogel | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/JankoMrsic-Flogel | M |
| G11-nickPellingPacker | nickPellingPacker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Nick Pelling Packer | M |
| G11-steveBarrett | steveBarrett | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/SteveBarrett | M |
| G11-paulSummers | paulSummers | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/PaulSummers | M |
| G11-martinWalker | martinWalker | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/MartinWalker | M |
| G11-paulShields | paulShields | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/PaulShields | M |
| G11-paulRobotham | paulRobotham | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/PaulRobotham | M |
| G11-pierreAdane | pierreAdane | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/PierreAdanePacker | M |
| G11-andrewParton | andrewParton | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Andrew Parton | M |
| G11-kimChristensen | kimChristensen | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Kim Christensen | M |
| G11-adpcmMono | adpcmMono | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/ADPCM_mono | M |
| G11-janneSalmijarvi | janneSalmijarvi | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Janne Salmijarvi Optimizer | M |
| G11-maximumEffect | maximumEffect | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Maximum_Effect | M |
| G11-midiLoriciel | midiLoriciel | EaglePlayer | EaglePlayer runner voice records + UADE Paula | M |
| G11-onEscapee | onEscapee | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/onEscapee | M |
| G11-paulTonge | paulTonge | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/Paul Tonge | M |
| G11-maniacsOfNoise | maniacsOfNoise | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-mdx | mdx | Mdxmini | mdxmini register log | M |
| G11-pmd | pmd | Pmdmini | pmdmini register log | M |
| G11-piyoPiyo | piyoPiyo | PiyoPiyo | PiyoPiyo replayer event stream (chords) | S |
| G11-adplug | adplug | UADE | AdPlug OPL register writes | M |
| G11-ufo | ufo | UADE | UADE Paula (gridVsPaula) + voice records; asm in amigasrc/wanted_team/UFO | M |
| G11-scumm | scumm | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-seanConnolly | seanConnolly | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-artAndMagic | artAndMagic | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-mikeDavies | mikeDavies | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-markII | markII | UADE | UADE Paula (gridVsPaula) + voice records | L |
| G11-sonicArrangerSas | sonicArrangerSas | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-aProSys | aProSys | UADE | UADE Paula + traceModuleReads (binary only) | L |
| G11-amiga_formats_catchall | amiga_formats_catchall | UADE | UADE Paula (gridVsPaula) + voice records | L |
