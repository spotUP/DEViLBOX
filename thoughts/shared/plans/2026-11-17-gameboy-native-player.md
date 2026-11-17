---
date: 2026-11-17
status: draft - D1 decided (both drivers, hUGEDriver first); D2-D4 open
topic: Game Boy native ROM player - Furnace GB (SameBoy APU) register capture replayed by a Game Boy player ROM, DMG and GBC builds
related: thoughts/shared/plans/2026-11-17-nes-native-player.md (structure and reuse source), thoughts/shared/plans/2026-11-15-hardware-rom-export.md (decision 11, platform order), thoughts/shared/plans/2026-11-15-hardware-replayer-survey.md (Game Boy section, lines 79-89), thoughts/spot/next-session-native-export.md
---

# Game Boy native ROM player

## Rule

The export must model a real driver on real hardware (owner rule), and major platforms come before niche ones. Playback on the target is the same register writes Furnace's GB dispatch makes, at the song's tick rate, so the ROM sounds 1:1 with DEViLBOX.

## Why Game Boy (platform pick, 2026-11-17)

Candidates from the owner's order (hardware-rom-export plan: Neo Geo, SMS/GG, Game Boy, NES, X16, Amiga, SNES, AY, GBA/DS, 2600), minus what is done or owned elsewhere:
- Neo Geo: nullsound route, own plan (game-music priority). Mega Drive: XGM P1 built, P2-P5 open in their own plan. SNES: TAD, own plan. NES: this week, Phase 10 in progress. ZX/AY: ZX 128 .tap built; BossGame `tools/ay_music.py` HAS REPORTED (one or two AY-3-8910 chips, commits up to 2026-11-15 incl. final-boss match to Furnace), so AY/Z80 is covered.
- Left: SMS/GG and Game Boy (both major, both in Mesen2), C64 (major, but no headless harness installed: needs VICE or MAME plus ROMs).
- Game Boy picked: larger library and audience than SMS/GG; the Furnace GB dispatch drives SameBoy's APU (a real register model, so the capture is the hardware truth); Mesen2 (installed, already the NES harness) runs GB/GBC headless with Lua write callbacks, so the NES Phase 12 harness carries over. SMS/GG is the close second (see D2).

## Binding decisions

- **B1 Driver (owner 2026-11-17): build BOTH. hUGEDriver first, then the raw register stream.** hUGEDriver gives a real homebrew driver (songs reusable in games; lossy for Furnace wave/duty/volume macros, list every lossy item per macro type). The register stream follows as the 1:1 route (NES/Vectrex/ZX pattern). Phase order below: Phase 2h-5h hUGEDriver route, then Phase 2-5 register-stream route. RGBDS (decision 11) is therefore needed: D4 now only asks WASM build vs dev-time pre-assembly for the hUGEDriver song assembly.
- **B2 Emulators (owner hard rule 2026-11-17): never fullscreen.** Mesen2 harness runs headless; if the owner must look, a small window. MAME, if ever used: `-window -nomaximize -resolution 640x480`.

## Owner decisions (D1 decided, see B1; D2-D4 open)

- **D1 Driver.** (a) Recommended: raw per-tick register stream + small SM83 player, same as NES/Vectrex/ZX. 1:1 with Furnace (every macro, wave swap, pan, sweep), the stream is the capture. Trade-off: bigger ROM than a note driver; songs are not editable on the Game Boy side. (b) hUGEDriver (owner decision 11, 2026-11-15): a real homebrew driver songs can be reused in games, but Furnace wave/duty/volume macros map lossily to hUGE instruments (survey lines 79-89), so the ROM does not match DEViLBOX. Decision 11 predates the NES register-stream precedent; DECIDED 2026-11-17: both, hUGEDriver first (B1).
- **D2 Platform.** Game Boy (recommended, reasons above) vs SMS/GG (SN76489 stream via PSGlib-style VGM player; smaller chip, simpler player, also in Mesen2). Equal on harness; Game Boy wins on library size.
- **D3 Targets.** One ROM that detects GBC and runs on both (recommended: same APU, GBC only changes the screen and CPU speed) vs decision 11's two ROMs (DMG and GBC). Furnace's `GB_MODEL_AGB_NATIVE` model (GBA volume map) is out of scope until asked.
- **D4 Toolchain.** RGBDS is not installed. Options: build RGBDS to WASM (decision 11; needed for in-app export either way) vs pre-assemble the player at dev time and patch the stream into the ROM in TypeScript (the NES `tools/build-nes-player.sh` + staleness-guard pattern; no in-app assembler). Recommended: the NES pattern for route (a); RGBDS WASM only if D1 = (b).

## Reuse map (search done 2026-11-17: nesCapture, nesStream, nesMesenHarness, dispatchRegCapture, build-nes-player.sh, GBSExporter)

| Need | Reuse | How |
|------|-------|-----|
| Register capture | `furnace_dispatch_reg_writes` (FurnaceDispatchWrapper.cpp:1152) | Platform-generic: dumps `getRegisterWrites()` of any dispatch. GB `rWrite` adds `addWrite(a,v)` with `a` = 0x10-0x3f. No change. |
| Capture mapping | `src/lib/export/nes/nesCapture.ts` pattern | New `src/lib/export/gb/gbCapture.ts` (Phase 1, built). |
| Stream encoder | `src/lib/export/nes/nesStream.ts` (tick record, chip mask, static dictionary, repeat, loop, bank split, `decodeNesStream`) | D1(a): new `gb/gbStream.ts` reusing its algorithm. Extracting a shared encoder from nesStream is right only after NES Phase 10 lands (another agent owns the NES files now). |
| Player build + staleness guard | `tools/build-nes-player.sh`, `public/nes/player.s` | Same shape: `tools/build-gb-player.sh`, `public/gb/player.asm`, hash guard test. Read only; do not edit the NES files. |
| ROM assembly | `src/lib/export/nes/nesCartridge.ts` (header + bank layout) | Pattern only: GB header (Nintendo logo, title, CGB flag, MBC5 cart type, header + global checksum) in `gb/gbCartridge.ts`. |
| Harness | `src/lib/export/__tests__/nesMesenHarness.ts`, `tools/nes-rom-check.ts` | Mesen2 runs .gb/.gbc; Lua callback range `$FF10-$FF3F`. New `tools/gb-rom-check.ts`, resumable, `--only`, `--failed`. |
| Export dialog | `useExportDialog.ts` native-export rows | Add Game Boy row after Phase 11. |
| Existing GB code | `src/lib/export/GBSExporter.ts` | Read in Phase 0: GBS file shape may reuse the same stream (GBS = player + data without cart header). |

## Phases (in order)

### Phase 0 - Tooling and unverified-fact checks (no product code)
- Install or locate an SM83 assembler (RGBDS) for dev builds (D4). Confirm Mesen2 headless runs a .gb with the Lua write callback (same flags as NES harness).
- Verify GB tick rates Furnace uses (59.7275 Hz VBlank default; custom Hz songs need a timer interrupt, see Phase 6).
- Read `GBSExporter.ts`: what it emits today and whether it is 1:1.

### Phase 1 - Capture mapping (BUILT 2026-11-17, driver-independent)
- `src/lib/export/gb/gbCapture.ts`: GB dispatch batches -> bus writes `$FF00 | addr`, sample-accurate, order kept; pseudo-addresses `0xffff____` kept as control events (GB dispatch emits none today; kept so a future one is never written to the bus); other platforms ignored; tick rate recorded.
- Address space counted from `third-party/furnace-master/src/engine/platform/gb.cpp` writes: NR10-NR44 `0x10-0x23` (`16+ch*5+n`), NR30 `0x1a` (wave DAC / bank select), NR51 `0x25` (pan via `procMute`), wave RAM `0x30-0x3f`; reset writes `0x12,0x14,0x17,0x19,0x1c,0x1e,0x21,0x23,0x25`. NR50 `0x24` and NR52 `0x26` are not written by the dispatch: the player must set them at boot (NR52=0x80, NR50=0x77).
- Test: `src/lib/export/__tests__/gbCapture.test.ts`.

### Phase 2h-5h - hUGEDriver route (FIRST, per B1)
- Song model -> hUGEDriver song asm (patterns, orders, duty/wave/noise instruments, routines); assemble with RGBDS against upstream hUGEDriver (public domain) into a DMG/GBC ROM; lossy-item report per Furnace macro type shown in the export dialog; harness compares Mesen2 bus writes with the Phase 1 capture and reports the lossy diff, not 0 diffs.

### Phase 2 - Stream format and encoder (register-stream route, after hUGEDriver)
- D1(a): `gb/gbStream.ts`: per tick (reg index, value) items, wave-RAM run item (16 bytes, bracketed by NR30 off/on exactly as captured), repeat/dictionary/loop/end as nesStream, 16 KiB bank split for MBC5. `decodeGbStream` round-trip test + size report.
- D1(b): song model -> hUGEDriver song asm; lossy items listed per macro type.

### Phase 3 - SM83 player core
- VBlank-driven tick, reads the stream, writes `$FF10-$FF3F`. Wave RAM writes with channel 3 DAC off (hardware rule; the capture already contains the NR30 writes). Boot sets NR52/NR50.

### Phase 4 - Cart and banking
- MBC5, 2 MiB max; stream banks at `$4000-$7FFF`. Header + checksums.

### Phase 5 - GBC build (per D3)
- CGB flag 0x80 (dual-mode). Double-speed mode not needed for playback.

### Phase 6 - Tick source for non-VBlank rates
- Timer interrupt (TAC/TMA) for songs not at ~59.73 Hz; measure the error per rate.

### Phase 7 - Player screen
- Title, author, channel meters; same content rules as NES Phase 8.

### Phase 8 - Full-coverage test song and coverage table
- One .fur using every GB feature (duty, sweep, envelope, wave swaps, noise width, pan, hardware sequence if used). Coverage table rows = dispatch write classes.

### Phase 9 - GBS output
- Same stream, GBS header; replaces or extends `GBSExporter.ts` after Phase 0 read.

### Phase 10 - Export dialog wiring, end to end
- Dialog row, download, file name; verify full wiring (menu -> handler -> encoder -> file).

### Phase 11 - Automated verification harness
- `tools/gb-rom-check.ts`: capture -> build ROM -> Mesen2 headless -> per-tick bus-write diff vs capture; record per song in `test-data/gb-rom-check.json`; resumable.

## Open risks (unverified)
- Mesen2 GB Lua write-callback range and headless flags: assumed same as NES, not run.
- Furnace GB `hardware sequence` feature: writes may be issued outside tick boundaries; check in Phase 8.
- Wave RAM write timing on DMG while channel 3 plays (corruption quirk): player writes with DAC off; the capture order must keep that bracket.
- Real-song stream size vs ROM size: unmeasured.
