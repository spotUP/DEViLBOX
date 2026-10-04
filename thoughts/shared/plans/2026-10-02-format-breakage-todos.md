---
date: 2026-10-02
topic: Format breakage report of 2026-10-02 - what the record says happened, and every fix as a todo
tags: [uade, formats, hippel, worklet, chip-ram, todo]
status: draft
---

# Format breakage todos (2026-10-02, revised 2026-10-03 from the record)

Owner report: "almost all formats are broken", live (`9a375ce7a`) and local
alike; jukebox verdicts 20:44-21:30 in `tools/format-state.json`; a frozen
tab; a console full of UADE errors.

## What the record says (verified twice: measured live + read from history)

1. **Audio engines are unchanged.** Headless UADE sweep at HEAD
   (`tools/uade-audit/corpus-sweep.ts --only ...`) matches the stored baseline
   `test-data/uade-corpus-sweep.json` row for row for every affected file in
   `public/data/songs/formats` (11 rows, 0 changed). Native engines play too:
   `.hip`, `.gray`, `.jb`, `.hip7`, `.fred` all produce audio in the live tab.
2. **Every real pattern codec is still byte-exact at HEAD.**
   `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts` (ratchet
   `encoderRoundtrip.ratchet.json`, 93 formats) is in `test:ci` and passed in
   every pre-push run today. Byte-exact 1.0 includes futureComposer,
   fredEditor, glueMon, tfmx7v, tomyTracker, wallyBeben, davidWhittaker,
   benDaglish, daveLowe, digitalMugician, sonicArranger, soundMon, sidmon1/2,
   soundfx, hippelCoSo, tfmx, iffSmus, inStereo2, activisionPro, futurePlayer,
   sunTronic, earAche, infogrames, paulShields, ... Lossy (256-cell stubs):
   ashleyHogg, coreDesign, customMade, desire, fredGray, jankoMrsicFlogel,
   jasonBrooke, jasonPage, jesperOlsen, maniacsOfNoise, markCooksey, markII,
   mikeDavies, quartet, scumm, seanConnolly, sonicArrangerSas, soundPlayer,
   specialFX, steveBarrett.
3. **The April "full" grids of the stub formats were noise.** `tools/format-state.json`
   at `967b40e0f` (2026-04-12) records `patternQuality=full editability=chip-ram`
   for fredGray, jasonBrooke, seanConran, jankoMrsicFlogel, ... Those grids came
   from `UADEChipRAMPatternReader.populatePatternsFromChipRAM`, which decoded
   whatever bytes sat at a guessed offset; the only check was
   `nonEmptyCells > 0`, which passes on noise (`75c94925e`: "a 5-instrument song
   came back with 237 note cells naming 56 distinct instruments").
4. **Timeline of the two steps down**, from commit times and tracker notes:
   - 2026-09-22 19:16 `a8bed896f` — scans capped at 15 s wall-clock (Hippel 7V
     scanned for minutes). Fewer rows/ticks for every heuristic-scan grid.
   - 2026-09-22 19:57 `fc6cce436` — a scan whose samples are all constant
     falls back to classic.
   - 2026-09-24 05:17-09:23 — the FIRST corpus-wide jukebox sweep. ~60 formats
     marked "Incorrect Pattern Data" / Silent, byte-exact codecs among them
     (fc, fred, tomy, wally, dw, bd, dl, mugician, sonicArranger, soundmon,
     sidmon, soundfx, hip7, tf, gluemon). The owner's words that morning:
     "audio is very delayed when i press play and pattern data off sync".
   - 2026-09-24 07:17-08:38 — `9ec621606` (grid anchored to UADE's clock,
     "Incorrect Pattern Data" button added), `3a8dcae18` (engine boots twice),
     `7b8945c42` (play paths skip the scan), `914464c62` (one door),
     `75c94925e` (chip-RAM noise gate: >5 % out-of-range instruments → grid
     stays EMPTY). The sweep's verdicts were recorded while these landed and
     were never re-taken; the tracker still shows them.
   - 2026-10-02 — owner re-tests: stubs now "Empty" (the gate, by design:
     "empty is the honest answer"), several byte-exact formats "Incorrect".
5. **Live measurements 2026-10-02** (relay, `load_file {filename,data}`):
   `eco.gray` / `warp (ingame 2).hip` / `demo music10.sog`: one empty 64-row
   pattern (stub + gate), audio present except `.sog` (silent, rms 0.0003).
   `ikari_warriors.jb`: 39 heuristic notes. `lethalxcess-intro.hip7`: 207
   patterns, 67 notes, cursor at pattern 0 row 1 while the engine is at
   songPos 4 row 24, peak 1.37. `fireworks ii.fred`: 12 patterns, 46 notes,
   cursor and engine agree.

So: nothing in the engines or codecs regressed. Three things did: the stubs
lost their (noise) grids on purpose; the 15 s scan cap thinned heuristic
grids; and the 09-24 sync fixes left at least Hippel 7V's cursor wrong. The
owner's expectation ("fully editable, all formats") was fed by the April
tracker entries that the 09-24 gate proved false.

## Todos

Done = root-cause fix, regression test in `test:ci` that fails on the old
code, type-check clean, owner check where only a human can.

| ID | Symptom | Evidence | Cause (measured / suspected) | Dig here | Verify |
|----|------|------|------|------|------|
| F1 | DONE 2026-10-03 (a3af29b82): `uade_wasm_full_reset` zeroes the song and resets both IPC ends before `uade_cleanup_state` (so `uade_stop` is a no-op) and keeps the exit guard up; `uadecore_wasm_init` marks a re-spawned core un-initialised so the stereo CONFIG is re-sent. `public/uade` rebuilt; headless sweep identical to baseline (13 files, RMS exact); `fullResetSurvivesRender.test.ts` in test:ci fails on the old bundle (`RuntimeError: unreachable`). Follow-up: two "stack may have been breached" warnings on the load after a reset, audio correct. Whether the freeze is gone: owner, 50-song run at :5174 after a reload. | — | — | — | — |
| F2 | DONE 2026-10-03 (grid): Hippel 7V "Incorrect Pattern Data" (`lethalxcess-intro.hip7`) was the grid hiding what the ear hears. Headless (TFMX worklet, 60 s, both 7V songs): every reported read offset fell in the grid's cells, steps 0..N in order, rows 0..31, no pattern breaks, same subsong - the position sync (afafb6d21) is right, and the cursor is NOT the complaint. The measured difference between the two songs: the track table's 4th byte per voice (`0xFx` = voice volume, `TFMX_7V_trackTabCmd`). lethalxcess: 245 of 1449 voice-steps at 36 % or less that still carry notes; ghostbattle ("Good"): 0. Fix: row 0's volume column shows the step's voice volume (`0x10 + 0..64`), edits write the command byte back (`HippelCellSpan.aux`), a rate command (`0xDx`) under it is refused. Same pass: 7V instrument numbers were the raw volume-sequence index (0 showed as none, every other off by one against the instrument list); now 1-based like CoSo's, codec and encoder follow. `hippel7VVoiceVolume.test.ts` in test:ci. Owner: re-judge lethalxcess at :5174 with the grid's volume column open. The old verify criterion (`currentRow == enginePosition.row`) was wrong: `transport.currentRow` never follows a WASM engine by design; the canvas reads `useWasmPositionStore` directly. | | | | |
| F3 | CLOSED 2026-10-03, not a defect: the 1.37 / 0.45 reading came from a double start (load_file auto-plays, then `play` started the engine again - the console shows two `Hippel loaded & playing` within seconds) on the live tab. Measured clean at :5174 (dub bus off, single start) against the TFMX worklet rendered headless, same song, same steps: steps 3-8 app rmsAvg 0.22-0.27 / peak 0.80-1.07 vs worklet 0.20-0.23 / 0.63-0.87; steps 62-68 app 0.07-0.10 / 0.29-0.33 vs worklet 0.08-0.12 / 0.40-0.46 (the meter is a mono downmix, the worklet figure is stereo RMS). No gain stage between the engine and the meter adds level; masterChannel 0 dB, limiter threshold -1 dB ratio 4 (soft, lets ~1.07 transients through by design). Lesson for every level measurement: one start per measurement, count `loaded & playing` lines first. | | | | |
| F4 | OPEN, needs an engine (owner decision): `.sog` (Hippel ST) silent (`demo music10.sog`, `astaroth.sog`). Both files are raw Atari ST TFMX song data (`TFMX\0` header, sound sequences `E2 E5..` = ST sound-chip commands, no samples, 4.8 / 12.9 KB). Measured 2026-10-03: (1) libtfmxaudiodecoder refuses them (`tfmx_load_module failed: -3`; COSO.cpp rejects Atari ST TFMX by design, TFMX_init likewise) - the native route `JochenHippelSTParser` -> `hippelFileData` -> TFMXEngine can never sound; (2) UADE maps `.sog` to the AMIGA `JochenHippel` player (eagleplayer.conf line 64: `prefixes=hip,mcmd,sog`) -> `module check failed`; (3) renamed `hst.<name>` UADE picks `Jochen_Hippel_ST` (Wanted Team's ST sound-chip emulator), loads without error, and renders a flat 0.004 RMS buzz for 10 s (peak 0.007, 375 zero crossings/s, no per-second variation) - not music. Its readme: raw ST TFMX often needs the original PC-relative replayer code in front of the module to be recognised and played. Options: (a) a native TFMX-ST decoder with a YM2149 model (libtfmxaudiodecoder has the TFMX sequencer but rejects the ST sound commands; the ST voice model is new work); (b) prepend the ST replayer the Wanted Team conversions carry and play via UADE's ST player (needs a reference `hst.` file that does play, none in the corpus); (c) leave `.sog` as grid-only with a clear "no player" message instead of silence. Recommended: (c) now, (a) as the real fix. | | | | |
| F5 | Byte-exact formats marked "Incorrect Pattern Data" today: `fireworks ii.fred` (fredEditor 1.0), `gnu-song.glue` (glueMon 1.0), plus the 09-24 list (fc, tomy, wally, dw, bd, dl, mugician, sonicArranger, soundmon, sidmon, soundfx, tf, futurePlayer, soundControl, activisionPro, ronKlaren, instereo2, fashionTracker) | Codec round-trips prove the grid IS the file's pattern bytes. `fred` measured in sync today. | "Not the song" on a byte-exact grid can only be: cursor/row sync (F2's class), wrong subsong, the raw command-stream carrier shown as notes (`blockRows`), or audio from a different engine than the grid. Needs the owner to say which. | Per format: compare `get_playback_state` currentRow vs enginePosition; check `song.order`/subsong; check which engine plays (`get_format_state` names it: F20). | Owner cannot judge by ear: solo is dead on the Fred engine (F25). Verify without ears: dump the engine's own note events per voice (the way `[FP]` traces Future Player) for `fireworks ii.fred` and diff them against the parsed grid row by row; a byte-exact codec with a matching event trace means the grid is right and the complaint is the cursor or the mix. |
| F6 | Stub formats "Empty Patterns" (`eco.gray`, `spacestation.jmf`, `count duckula.scr`, `surf ninjas.scn`, `warp (ingame 2).hip`, `demo music10.sog`, `offroad.jpo`, `bottle popper.mms`, `64_conversion.tme`, `newtek.bsi`, `riffraff_smallest`) | Stub parser returns one empty 64-row placeholder; `withNativeThenUADE(..., { injectUADE: true })` returns `injectUADEPlayback(native)` and never runs the scan; `75c94925e` rejects the chip-RAM guess. Formats with NO native parser (`.jb`) still get the heuristic scan grid. | By design since 09-24. A stub parser pre-empts the scan: worse display than having no parser. | (a) Give stubs the heuristic scan grid (display-only) by not short-circuiting in `withFallback.ts` when the native result is a placeholder; (b) real editability stays the July plan: emulate the player, trace the bytes it reads (`tools/uade-audit/traceModuleReads.ts`), build the codec on the real layout. | (a) noteCells > 0 after load for `.gray`; (b) ratchet entry 1.0. |
| F7 | Heuristic grids thinned by the 15 s scan cap (`.jb`, `.jt`, `.jpn`, and every FORCE_CLASSIC format) | `a8bed896f`: `SCAN_WALL_MS = 15000` in `UADE.worklet.js` 1166/1253. Rows and tick snapshots stop at the deadline. | Trade made for Hippel 7V (now native, no longer needs it). | Make the budget per format (`getScanParams`), raise it for formats whose grid depends on the scan, keep 15 s for never-ending players. | Row count for `ikari_warriors.jb` before/after. |
| F8 | CLOSED 2026-10-04 by F11: the `aon.x` that failed was `SUNTronicTunes/instr/aon.x`, a SunTronic instrument the jukebox offered as a song (and ~100 `instr/*.x` siblings before it), not Art of Noise. Instrument directories are no longer indexed. | | | | |
| F9 | OWNER (corpus asset): `centerbase_soft.os` / `smp.set` exist nowhere under `public/data/songs` (searched 2026-10-04). The loader resolves companions correctly when they are beside the module; `formats/` holds the single file. Same class, 11 rows in the baseline: `moveback.sdata`->`moveback.i`, `bob4e.dum`->`bob4e.ins`, `centerbase_soft.osp`->`.os`, `dawnpatrol-sad.dat`->`.SSD`, `jpn.virocop-14`->`SMP.virocop-14`, `lollypop-subgame_01.jo`->`WantedTeam.bin`, `mdat.rocknroll`->`smpl.rocknroll`, `radiokomppi.smus`->`Instruments/SnareDrum.instr`, `sdr.monsterbusiness_5` and `sdr.nobuddiesland_jigsaw`->`SMP.*`, `silmarils_smallest.mok`->`silmarils`. Fix = drop the partner file beside each (Modland has them), or remove the half-pair from `formats/`. | | | | |
| F10 | OWNER (corpus asset), see F9: `SMP.monsterbusiness_5` is not in the corpus. | | | | |
| F11 | DONE 2026-10-04: the song index listed companions as songs. `scripts/build-song-index.ts` now drops (a) every file another module in its directory resolves as a companion - the resolver's own rule run backwards (`companionFilesIn`, `src/lib/import/companionResolver.ts`), checked against the file's own and its parent directory; (b) anything under an `instr/`, `instruments/`, `samples/` directory (`isInSampleDirectory`); (c) `.instr`, `.bak`, `.info`. Sonix instruments may be extensionless, so the resolver claims those too. 2203 -> 1472 files, 731 companions gone; `uade_ah` and `iceTracker` lost their "coverage" because it was `Ah.instr` / `Ice.ss` misdetected by name. Still listed, misplaced in the corpus (owner): `formats/SnareDrum.ss` (a Sonix instrument), `formats/jamespond2aga-title.ins` (an InStereo? half with no partner). Tests in `companionFilesIn.test.ts` (test:ci). | | | | |
| F12 | DONE 2026-10-04 with F11: `advantage tennis-intro.ins` is no longer offered as a song; the `.dum` is, and the loader resolves the `.ins` beside it. For a mutual pair the registry decides which half is the song (`.dum` -> infogrames, `.ins` -> catch-all). | | | | |
| F13 | OWNER (corpus asset), see F9: `WantedTeam.bin` is not in the corpus. | | | | |
| F14 | DONE 2026-10-04 (loader): `prepareModuleImport` asked libopenmpt for metadata because `karlMorton` carries `libopenmptFallback`, and a libopenmpt refusal (`ptr`) killed the import before any other route ran. It now falls through to header metadata and parseModuleToSong decides (`prepareModuleImportLibopenmptFallback.test.ts`, test:ci, fails on the old code). The file itself: `boogie.mus` is NOT a Karl Morton module (no `SONG` chunk; `isKarlMortonFormat` false), libopenmpt rejects it, and UADE's mus player says `module check failed` - no engine in the tree knows this `.mus`. It now refuses with UADE's reason instead of `ptr`. Owner: what is `formats/boogie.mus`? | | | | |
| F15 | MEASURED 2026-10-04, owner decision: `spring.emul` detects as `ay` now (the registry took `.emul` on 09-24; the 10-02 log predates that build). `mega mix 1.strc` and `aztec theme.amad` are the same ZXAY container with STRC / AMAD payloads; `parseAYFile` knows only EMUL (deliberately, see the `ay` entry), and the ZXTune wasm carries no ZXAY strings - no engine in the tree plays them. `black glass ][ - muzik0.670`: `isCDFM67Format` rejects it (speed byte 0x06 passes, a later check fails) and the registry only lists `.c67`; either a different Composer 670 variant or a damaged file. Options: (a) extend the AY path with the STRC/AMAD players (Z80 emulation of each replayer - new work), (b) check whether libopenmpt reads the .670 (it reads C67) and add `.670` to the `cdfm67` entry if so, (c) leave all three refused with their reasons. | | | | |
| F16 | OWNER (corpus asset), see F9: Kris Hatlelid needs its `songplay` partner (resolver special case); none in the corpus, so the player ends at tick 0. | | | | |
| F17 | DONE 2026-10-04: the badges probed `ws://${location.hostname}:4003/probe`, Mixed Content on the HTTPS live page. One relay address now (`src/bridge/relayEndpoint.ts`, `ws://localhost:4003`), used by `MCPBridge` and `ServerStatusBadges`; localhost is a potentially trustworthy origin, so the HTTPS page may open it. `relayEndpoint.test.ts` (in test:ci) renders the badges with a fake WebSocket and fails on the old component. | | | | |
| F18 | DONE 2026-10-04: the per-tick `T000..` and `[FP] set_subsong` traces in `futureplayer-wasm/src/FuturePlayer.c` are behind `#ifdef FP_TRACE`; bundle rebuilt (`cmake --build futureplayer-wasm/build`, emcc 4.0.16) and shipped to `public/futureplayer/`. Headless render of `imploder_drums.fp`, 5 s: rms 0.1254 / peak 0.488 on both bundles, stderr lines 202 -> 0. The new wasm imports no `fd_write` at all. | | | | |
| F19 | DONE 2026-10-03 (f076e3e2e): `[UADEParser]`, `[UADEEngine]`, `[ChipRAMReader]`, `[UnifiedFileLoader]`, `[applySong]` reach `get_console_errors`; unhandled rejections were already captured. | — | — | — | — |
| F20 | CLOSED 2026-10-04, not reproduced on the load path: `createScriptProcessor` wrapped in the live tab, 8 loads (eco.gray / fireworks ii.fred alternating) and 3 load+play+stop cycles: 0 creations. The 60 lines of 2026-10-02 came from other creators (DJ, capture, MAME, SID) - re-measure in that session if it recurs. | | | | |
| F21 | CLOSED 2026-10-04: eco.gray after ONE start (load_file, then play once): rmsAvg 0.17-0.18, peak 0.80-0.83. The 1.06-1.14 of 10-02 was a double start, as F3's. | | | | |
| F22 | DONE 2026-10-04: `load_file` answers `engine` and `get_format_state` answers `playingEngine`, both from `playingEngineFor(song)` in `NativeEngineRouting.ts` - the router's own activation rule (first `WASM_ENGINES` descriptor whose file data the song carries; `UADE classic` for UADESynth streaming; `tracker`). `format` stays the registry label. `playingEngineFor.test.ts` in test:ci. | | | | |
| F23 | Tracker still carries the 09-24 verdicts for byte-exact formats, taken before the same morning's sync fixes | `tools/format-state.json` notes "jukebox 2026-09-24 05:17-09:23"; fixes 07:17-08:38. | Stale data presented as current. | Re-run the jukebox on the byte-exact set with the owner; mark with date. | Each entry re-dated. |
| F25 | DONE 2026-10-04 (mask path and isolation report): at :5174 `fireworks ii.fred` all 0.083 rms -> solo ch0 0.054 -> solo ch3 0.034 -> all muted 0.0001; owner: "isolation seems to work". `get_channel_effect_slots` names `FredReplayerEngine`, `slotsSupported: true`. Still open: MaxTrax, Qsf, Pmdmini, Mdxmini, MusicLine have no mute API. Found on the way: see F27. | | | | |
| F26 | uade-wasm did not link from the tree since 2026-09-30 (`wasm-ld: undefined symbol: uade_wasm_capture_write`, c153c59f1 "entry.c def pending"); the shipped bundle predated that change and the uade-core workflow cannot have been green | DONE 2026-10-03 (20eb08b28). Lesson: a source change to uade-wasm/ without a rebuild commits a wasm that does not match its sources; the pre-push gate does not build wasm. Todo: a cheap CI-independent check that `public/uade/UADE.wasm` is newer than every file under `uade-wasm/src` and `third-party/uade-3.05/src` (or a hash manifest). | | | |
| F27 | DONE 2026-10-04: `SilenceDetector.start(..., isSilencedUpstream)` - the detector resets its silence count while `mixerSilencesAChannel()` (any channel muted, or a solo elsewhere) is true; `NativeEngineRouting` passes it for every direct-routed engine. `silenceDetectorMixerMute.test.ts` (test:ci) fails on the old detector. Owner asked (2026-10-04) for F28 next. | | | | |

## Owner-only checks
- For ONE byte-exact song marked "Incorrect" today (`fireworks ii.fred` or `gnu-song.glue`): what is wrong — the cursor, the notes, the instruments, the timing? That decides F5.
- Which file was loaded when the tab froze (F1).

## Decisions on record (do not re-litigate)
- Stubs are deferred, not dropped (owner, 2026-07-12): emulate the player, trace the bytes it reads, build a byte-exact codec on the real layout. No fabr| F28 | TODO (owner, 2026-10-04): check that the silence detector does not clash with the dub bus - a dub persona or move that throws silence (Version Drop, kill moves, a dry cut, a long reverse capture) for 5 s would read as the song ending and stop the engine. Dig: where each move silences - mixer mute/solo (covered by F27's gate), channel-chain gain or the dub bus insert (downstream of the detector's tap at `instance.output`, so not seen), or an engine mute mask set directly by dub channel targeting (`setMuteMask` outside the mixer - seen as silence, NOT covered). Verify: fire Version Drop / a kill move on a native-engine song for > 5 s at :5174; the song must still be playing after release (`enginePosition` advancing, rms back). If a move drives the engine mask directly, the detector's predicate must include the dub bus's own silencing state. | | | | |icated grids — `75c94925e` enforces that.
| F29 | TODO (owner, 2026-10-04): open the DEViLBOX repo once nothing sensitive is in it. Not a code change - an audit, in this order: (1) secrets in the WHOLE history, not the tree: `git log --all -p -- .env '*.pem' '*.key'`, plus a scanner (gitleaks / trufflehog) over all refs - checked 2026-10-04: `.env` is ignored and was never tracked on any ref, `.env.docker.example` is tracked, `Reference Code/` is untracked, 15190 corpus files ARE tracked; (2) deploy material: `scripts/server-setup.sh`, `scripts/deploy-manual.sh`, `.github/workflows/deploy.yml`, the Hetzner webhook secret and host names; (3) the song corpus `public/data/songs` (312 MB, ~15k files): copyrighted modules redistributed with the repo - decide what stays (own tunes, permissive) and what moves to a private asset bucket the dev/CI fetches; (4) `Reference Code/` and `third-party/` (42 trees): licence per tree (UADE GPL-2, Furnace GPL-2, libopenmpt BSD, MAME GPL/BSD mix, Hippel decoder, zxtune, ...) against the licence DEViLBOX picks - GPL components make the whole a GPL distribution; vendored trees without a licence file cannot be published; (5) personal data: commit author emails are fine, `thoughts/<name>/` is ignored, check `thoughts/shared/` and `tools/format-state.json` for anything private; (6) a LICENSE, a README that says what works, and `CONTRIBUTING` naming the house rules. Order matters: a secret found after publishing is leaked for good - rotate before flipping the switch. | | | | |- "Transpile all players to C" is the editability road map for the ~21 compiled-68k stubs, not a repair for anything in this list.
