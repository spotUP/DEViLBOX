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
| F1 | Every load after a rendered song: `[UADE.worklet] Soft reset (rendered)...` → `protocol error: receiving in S state is forbidden` → `uadecore: Invalid input. Expected score name.` → `[uade-wasm] FATAL: unguarded exit(1)` → `Soft reset threw: unreachable` → full WASM reinit. Owner's tab froze during format testing (3164 underruns / 16.9 s that session). | MEASURED headless, deterministic: `tools/uade-audit/resetTrapRepro.ts` traps on HEAD's bundle AND on the 09-24 bundle (`a3fb9afa6`) — not a regression; the soft reset has never survived a rendered song. `PRE=stop` and `PRE=cleanup` do not help. | `uade_wasm_full_reset` (uade-wasm/src/entry.c:839) calls `uade_cleanup_state(s_state)`, which runs libuade's IPC teardown (send/receive). After a render the shim IPC is in `UADE_S_STATE` (third-party/uade-3.05/.../uadeipc.c:195), the receive is refused, uadecore reads garbage ("Expected score name") and calls `exit(1)` with `uade_exit_guard` = 0 → trap. `uade_wasm_stop` (entry.c:474) already documents this class and avoids `uade_stop()` for the same reason. | Fix shape: in `uade_wasm_full_reset`, reset the shim IPC the way `uade_wasm_load` does — `uade_shim_reset_for_load()` (shim_ipc.c:191: clears both ring buffers, `uadecore_wasm_reset_for_load()`) plus the frontend/core `ipc->state` reset entry.c does at :355/:451 — BEFORE `uade_cleanup_state`, and wrap the cleanup in the same setjmp guard as `guarded_new_state` (entry.c:246) so a stray `exit()` returns -1 instead of trapping. Rebuild `public/uade` (`uade-wasm/build.sh`; CI rebuilds from source, PR #78). | `resetTrapRepro.ts` prints `VERDICT OK`; the worklet logs no `Soft reset threw`; a 50-song jukebox run with no freeze (owner). Whether the freeze itself is this (each load paying a 2.5 MB reinit) or something else is still unverified: capture `unhandledrejection` + the UADE prefixes first (F19). |
| F2 | Hippel 7V "Incorrect Pattern Data" (`lethalxcess-intro.hip7`) | Grid full and byte-exact (tfmx7v 1.0); cursor pattern 0 row 1 vs engine songPos 4 row 24. | MEASURED: position sync `hippelRowAt(spans, step, patternOffset)` (afafb6d21) or the grid follows the wrong store for 7V. | `src/engine/hippel/hippelCellSpans.ts`, `rebuildHippelModule.ts mapHippelCells`, `NativeEngineRouting.ts` Hippel block, TFMX worklet `step`/`patternOffset`. | `get_playback_state` currentRow == enginePosition.row during playback. |
| F3 | Hippel 7V clips | peak 1.37, rms 0.45. | TFMXEngine output level for 7V. | `src/engine/tfmx/TFMXEngine.ts`, `tfmx-wasm/src/tfmx_synth.cpp`. | peak < 1.0 at default master. |
| F4 | `.sog` (Hippel ST) silent (`demo music10.sog`; `astaroth.sog` marked Silent) | Native route (`AmigaFormatParsers.ts` ~2122 → `JochenHippelSTParser` placeholder + TFMXEngine) rms 0.0003; UADE refuses `astaroth.sog` ("module check failed") headless. | libtfmxaudiodecoder ST sub-format detection / voice init for `.sog`. | `tfmx-wasm/lib/libtfmxaudiodecoder/src/Jochen/*`, `isJochenHippelSTFormat`. | rms > -40 dBFS within 3 s. |
| F5 | Byte-exact formats marked "Incorrect Pattern Data" today: `fireworks ii.fred` (fredEditor 1.0), `gnu-song.glue` (glueMon 1.0), plus the 09-24 list (fc, tomy, wally, dw, bd, dl, mugician, sonicArranger, soundmon, sidmon, soundfx, tf, futurePlayer, soundControl, activisionPro, ronKlaren, instereo2, fashionTracker) | Codec round-trips prove the grid IS the file's pattern bytes. `fred` measured in sync today. | "Not the song" on a byte-exact grid can only be: cursor/row sync (F2's class), wrong subsong, the raw command-stream carrier shown as notes (`blockRows`), or audio from a different engine than the grid. Needs the owner to say which. | Per format: compare `get_playback_state` currentRow vs enginePosition; check `song.order`/subsong; check which engine plays (`get_format_state` names it: F20). | Owner names what differs (cursor, notes, instruments, timing) for ONE song; fix that class. |
| F6 | Stub formats "Empty Patterns" (`eco.gray`, `spacestation.jmf`, `count duckula.scr`, `surf ninjas.scn`, `warp (ingame 2).hip`, `demo music10.sog`, `offroad.jpo`, `bottle popper.mms`, `64_conversion.tme`, `newtek.bsi`, `riffraff_smallest`) | Stub parser returns one empty 64-row placeholder; `withNativeThenUADE(..., { injectUADE: true })` returns `injectUADEPlayback(native)` and never runs the scan; `75c94925e` rejects the chip-RAM guess. Formats with NO native parser (`.jb`) still get the heuristic scan grid. | By design since 09-24. A stub parser pre-empts the scan: worse display than having no parser. | (a) Give stubs the heuristic scan grid (display-only) by not short-circuiting in `withFallback.ts` when the native result is a placeholder; (b) real editability stays the July plan: emulate the player, trace the bytes it reads (`tools/uade-audit/traceModuleReads.ts`), build the codec on the real layout. | (a) noteCells > 0 after load for `.gray`; (b) ratchet entry 1.0. |
| F7 | Heuristic grids thinned by the 15 s scan cap (`.jb`, `.jt`, `.jpn`, and every FORCE_CLASSIC format) | `a8bed896f`: `SCAN_WALL_MS = 15000` in `UADE.worklet.js` 1166/1253. Rows and tick snapshots stop at the deadline. | Trade made for Hippel 7V (now native, no longer needs it). | Make the budget per format (`getScanParams`), raise it for formats whose grid depends on the scan, keep 15 s for never-ending players. | Row count for `ikari_warriors.jb` before/after. |
| F8 | `aon.x` "module check failed" after ~100 `instr/*.x` companions | Baseline sweep: COMPANION. | Wrong main file or player name for Art of Noise two-file sets. | `UADEParser` companion handling for `aon`; eagleplayer.conf. | Plays headless. |
| F9 | `centerbase_soft.osp`: `file not found '/uade/centerbase_soft.os'`, `'/uade/SMP.set'` | Baseline: MISSING-COMPANION (SynthPack). | Companion not shipped / not resolved. | `src/lib/import/companionRelativeName.ts`; corpus dir. | Loads with companion. |
| F10 | `sdr.monsterbusiness_5`: `file not found '/uade/SMP.monsterbusiness_5'` | Baseline: MISSING-COMPANION (SynthDream). | As F9. | As F9. | As F9. |
| F11 | `Saxophone.ss`, `deeptrumpet1.ss`, `SnareDrum.ss`, `Sax.42.instr`: "module check failed" / Load Failed | Names are instrument files under `iff-smus/` (companions of `.smus`), listed as songs. | Corpus listing, not a player bug. | Jukebox list builder: hide companions of a two-file format. | Not offered as songs. |
| F12 | `advantage tennis-intro.ins` → `Cannot play file (ret=0)`; then `.dum` loads | Infogrames two-file (.dum module + .ins instruments): `.ins` tried as the main file first. | Companion-pair ordering. | `UnifiedFileLoader.ts` companion resolution for `dum`/`ins`. | Pair loads once, `.dum` main. |
| F13 | `lollypop-subgame_01.jo`: `file not found '/uade/WantedTeam.bin'` | Jesper Olsen two-file. | Missing companion. | As F9. | Loads. |
| F14 | `boogie.mus`: `Failed to load module: ptr` | Baseline: NOT-UADE (karlMorton). | KarlMorton native parser throws. | `src/lib/import/formats/KarlMortonParser.ts`. | Loads or refuses with a reason. |
| F15 | `mega mix 1.strc`, `aztec theme.amad`, `spring.emul`, `black glass ][ - muzik0.670`: `Unsupported file format` | Registry has no entry (AY/ZX formats, Composer 670). | Missing detectors. | `FormatRegistry.ts`. | Load. |
| F16 | `hatlelid_smallest.kh`: INSTANT-END / Silent | Baseline: INSTANT-END. | Player ends at tick 0 under UADE. | Headless row; eagleplayer. | Plays > 2 s. |
| F17 | `Mixed Content: ... insecure WebSocket endpoint 'ws:.../probe'` x40+ on the live site | `src/components/layout/ServerStatusBadges.tsx:51` opens `ws://${host}:4003/probe` from an HTTPS page, repeatedly. | No gate on protocol/host. | Gate on `location.protocol === 'http:'` or localhost; stop retrying when blocked. | No Mixed Content lines on live. |
| F18 | `[FP] set_subsong ... T000..T199` 200+ lines per Future Player load | `futureplayer-wasm/src/FuturePlayer.c` 1199, 1349-1365: unconditional `fprintf(stderr, ...)` per tick. | Debug trace left on. | Gate behind a debug flag; rebuild `public/futureplayer`. | No per-tick lines on load. |
| F19 | `0095e802:1 Uncaught (in promise)` during Furnace platform creation | One unhandled rejection in the bundle, message not shown. | Unknown. | Capture `unhandledrejection` in `src/bridge/consoleCapture.ts`; add `UADEParser|UADEEngine|ChipRAMReader|UnifiedFileLoader|applySong` to `CAPTURED_LOG_PREFIXES` so load paths are visible to the relay. | Rejection text captured. |
| F20 | `[Deprecation] The ScriptProcessorNode is deprecated` x60 in one session | One per created node; creators: `TrackerAudioCapture.ts:80` (torn down by `stopCapture`), `SequencerEngine.ts:76`, `GranularFreezeEffect.ts:236`, `MAMESynth`, `VFXSynth`, `KontaktBridge`, `JSIDPlay2Engine`, `audioExport`, `LiveCapture`. | Possible leak (freeze contributor). | Count creations per load in the live tab (wrap `createScriptProcessor` via `evaluate_script`). | Count flat across 20 loads. |
| F21 | `eco.gray` plays at peak 1.06-1.14 | `get_audio_level` peakMax 1.06 / 1.138. | UADE classic streaming level; no clipper before master? | `UADEEditableSynth` gain / master insert. | peak < 1.0. |
| F22 | `load_file` / `get_format_state` label the registry entry ("Amiga Format", "Jochen Hippel ST"), not the engine playing | Misled this triage twice. | Cosmetic. | Response names the engine (TFMXEngine / UADEEditable / native). | Response correct for `.hip` and `.gray`. |
| F23 | Tracker still carries the 09-24 verdicts for byte-exact formats, taken before the same morning's sync fixes | `tools/format-state.json` notes "jukebox 2026-09-24 05:17-09:23"; fixes 07:17-08:38. | Stale data presented as current. | Re-run the jukebox on the byte-exact set with the owner; mark with date. | Each entry re-dated. |
| F24 | April tracker rows claim `patternQuality=full editability=chip-ram` for stubs | Proven noise by `75c94925e`. | The April status writer tested `nonEmptyCells > 0`. | Reset those rows to `none`/`stub` with the reason; never let a status writer mark `full` without the plausibility gate or a ratchet 1.0. | Tracker agrees with the ratchet json. |

## Owner-only checks
- For ONE byte-exact song marked "Incorrect" today (`fireworks ii.fred` or `gnu-song.glue`): what is wrong — the cursor, the notes, the instruments, the timing? That decides F5.
- Which file was loaded when the tab froze (F1).

## Decisions on record (do not re-litigate)
- Stubs are deferred, not dropped (owner, 2026-07-12): emulate the player, trace the bytes it reads, build a byte-exact codec on the real layout. No fabricated grids — `75c94925e` enforces that.
- "Transpile all players to C" is the editability road map for the ~21 compiled-68k stubs, not a repair for anything in this list.
