---
date: 2026-10-05
topic: MusicMaker V8 native replayer - plan and ledger
tags: [musicmaker, native-replayer, ledger]
status: implemented
---

# MusicMaker native replayer - ledger

Research: `thoughts/shared/research/2026-10-05_musicmaker-native-replayer.md`.
Done = moveback.sdata and best of guitars.sdata load through parseModuleToSong with
their companions, route to the MusicMaker engine, the real worklet renders them
non-silent with the sequencer running, grid shows real notes; test in test:ci.

Decisions (do not re-open):
- Decode once in TS (MusicMakerParser.ts); engine.loadTune decodes the stored IFF and
  posts arrays; worklet = sequencer + voice renderer only.
- Song carries one file: MMV8 IFF (SDAT + PINS/INST), the format's own container.
- STD/EXT by structural parse (not `_isstdsong`, which misreads both corpus songs).
- Each voice resampled at its exact period; EXT voices at half amplitude (calculateinstruments).
- Grid: one pattern per melody position, row = 2 ticks, notes named by period (periodNotes).
- `.mm4`/`.mm8` IFF routes stay on UADE (out of scope; engine accepts IFF already).

Checklist:
- [x] M1 research doc
- [x] M2 decoder: sdata STD/EXT (player limits: STD pattlen 16..64, speed 300..2800), instruments, HULL, IFF, voice timelines
- [x] M3 grid parser parseMusicMakerSongFile + routing for .sdata + registry entry 'musicMaker'
- [x] M4 worklet; lock-step vs UADE MM4 (moveback) and MM8 (best of guitars as mm8.*): periods/volumes/HULL identical; samples within 1-2 dB per band below 6 kHz
- [x] M5 engine + wiring; MusicMakerSynth in PAULA_SYNTH_TYPES (A500 RC stage; measured +8 dB treble without)
- [x] M6 tests: src/lib/import/__tests__/musicMakerSong.test.ts (test:ci), src/engine/__tests__/musicMakerPlays.test.ts (engine glob); reverted-fix runs fail
- [x] M7 type-check, commit (not pushed)
- [ ] M8 owner listening in the browser (no browser was connected to MCP)

Found during the run:
- Root cause of "moveback sounds wrong" on UADE: companionResolver registered `<tune>.i`
  read from `<tune>.ip`; the player picks the codec by name, so it read packed codes as
  raw samples. Fixed: the `.ip` keeps its own name (UADE falls back to `.ip` itself).
- UADE's shipped MM8 binary plays best of guitars when named `mm8.*`; the app routed every
  `.sdata` to the 4V player. Moot now (native), noted for the record.
- Oracle scripts (scratchpad only): byte-22 patch is NOT needed; shipped binaries differ
  from the asm's `_isstdsong`.
