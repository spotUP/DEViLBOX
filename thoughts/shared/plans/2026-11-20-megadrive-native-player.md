---
date: 2026-11-20
status: approved 2026-11-20 - owner answers recorded under OWNER DECISIONS; Phase 0 next
topic: Mega Drive / Genesis native ROM player - Furnace Genesis songs (YM2612 + SN76489) converted to MDSDRV song data, played by MDSDRV in a DEViLBOX player ROM
related: thoughts/shared/plans/2026-11-15-hardware-replayer-survey.md (Mega Drive rows, lines 19-20, 31-66), thoughts/shared/plans/2026-11-15-hardware-rom-export.md (section "Mega Drive XGM: phases", superseded here), thoughts/shared/plans/2026-11-17-gameboy-native-player.md and 2026-11-17-nes-native-player.md (structure, hUGEDriver / FamiStudio route pattern), thoughts/shared/design/player-ui/player-screens.html (platform `md`)
---

# Mega Drive native ROM player (MDSDRV route)

## Rule

Native export = song data for a real driver (owner hard rule). MDSDRV (superctr, zlib) is the driver: 68k sequencer +
Z80 PCM mixer, about 1 KB 68k work RAM, 16 tracks, FM + PSG + 2-3 PCM channels, FM3 special mode. We write the MDSDRV
song data (`mdsseq.bin`, `mdspcm.bin`) ourselves from the documented format (`doc/mdsseq.md`). `mdslink` (ctrmml,
GPL-2.0) is never vendored, linked, or run by the product. Done = every Furnace effect used by Genesis songs is 1:1,
measured in the check tool, or listed as lossy with its measured cost.

## Supersedes

- XGM / XGM2 (VGM-fed register streams) are out (owner rule: never a register-stream / VGM capture played back).
  `hardware-rom-export.md` "Mega Drive XGM: phases" P1 (xgmtool WASM, `src/lib/export/xgm/xgmtoolWasm.ts`,
  `public/xgmtool/`, `third-party/sgdk-xgm/`) is built but stops here. Fate: OWNER DECISION D4.
- Survey verdict (XGM first, MDSDRV only for driver-RAM meters) is reversed by the owner rule above.

## Local survey (2026-11-20, which/ls only)

| Tool | Found | Use |
|---|---|---|
| `vasmm68k_mot` | /opt/homebrew/bin | 68k assembler for the player shell (and maybe MDSDRV 68k side, D1) |
| `m68k-elf-as`, `m68k-elf-gcc` | /opt/homebrew/bin | alternative 68k toolchain (C shell, D2) |
| `sjasmplus` | ~/.local/bin | MDSDRV Z80 side (its Makefile names sjasmplus) |
| `mame` 0.286 | /opt/homebrew/bin | headless harness. Drivers `genesis` (USA NTSC), `megadriv` (EU PAL), `megadrij` (JP); `-verifyroms genesis` OK (no BIOS needed); devices `genesis_snd_z80` (Z80 3.57 MHz), `ymsnd` (YM2612 7.67 MHz) |
| Furnace CLI 0.6.8.3 | /Applications/Furnace.app/Contents/MacOS/furnace | reference register streams via `-vgmout` (`tools/furnace-audit/vgm-register-fixture.ts`, set `FURNACE_CLI`; its default path `/Users/spot/Code/Reference Code/...` does not exist) |
| asm68k, salvador, wine, BlastEm, Genesis Plus GX, clownmdemu, SGDK, Mesen2-MD | not found | Mesen2 has no Mega Drive core anyway |
| `third-party/` | `sgdk-xgm` (XGM, out), `musashi` (68k core, MIT; not needed: MAME is the harness), `furnace-master` (dispatch source, docs) | no MDSDRV yet |

Test songs: `public/data/songs/furnace/genesis/*.fur`, 29 files (e.g. Shovel_Knight_Title, Plok_Beach, mm5_boss,
RaveOfDoom, MegadriveOverdrive, Puyopuyo~n_DopplegangerArle-TsuuStyle, RubyIllusions_Genesis). Register fixtures
already in tree: `src/engine/__tests__/fixtures/furnace-registers/mm5_boss.fur.json`, `RaveOfDoom.fur.json`
(chip kinds `opn` + `psg`, `KIND_OF_PLATFORM` in `src/engine/__tests__/helpers/furnaceRegisterStream.ts`).

## MDSDRV facts (from README, doc/api.md, doc/mdsseq.md; read 2026-11-20 via web, V = stated in doc, U = not stated)

- Build (V): `make mdsdrv` needs `sjasmplus`, `salvador`, `mdslink` on PATH and `wine` for `asm68k.exe`
  (SN Systems, non-free, bundled). So the 68k side is asm68k syntax. This is the main Phase 0 blocker (D1).
- API (V): `mdsdrv` base +0 `mds_init(a0 work, a1 seq)`, +4 `mds_update(a0)` once per VINT, +8 `mds_request(a0, d0 sound, d1 prio)`,
  +12 `mds_command` (get_status 0x02 = active-track mask, set_gtempo 0x05, set_pause 0x0B, fade 0x0A, set_pcmmode 0x11, ...).
  `a1` even. Default global tempo 128 NTSC, 107 PAL (auto region adjust unless set_gtempo).
- Tick model (U): tempo byte `F9 dd` = BPM dd*300/256; how tempo turns into sequencer ticks per VINT is not documented.
  Phase 0 reads the 68k source and measures it in MAME.
- Work RAM size (U, README says ~1 KB). Per-track volume / note / key state is not documented as readable (U): only the active mask.
- Sound data (V): header magic `10 01 1f 00`, `sdver`, `sdcnt`, `sdtop`, pointer table; per sequence `tbase` (signed word),
  `tvol` (0-127, -0.75 dB steps), `tcount` (byte), track table of 4 bytes (channel id, flag 00, signed-word position).
  Channel ids 00-05 FM1-FM6 (FM6 = PCM1), 06-08 PSG1-3, 09 PSG noise, 0A-0F dummy / PCM2+.
- Command set (V): see the effect map. Instruments: FM voice 30 bytes (+0..+24 op regs in register order, +28 FB/ALG,
  +29 transpose); PSG envelope bytes; pitch envelope (4-byte or extended 6-byte nodes); macro table (2-byte nodes,
  per-tick TL/volume/detune/transpose/pan/LFO/noise/FM-register writes, waits, loops); PCM header 8 bytes (rate 1-7 or 1-8 in
  ~2190 Hz steps, 24-bit address, 32-bit length).
- The doc says it may contain errors: every format fact gets a unit test against bytes the real driver plays (MAME), not the doc alone.

## Binding decisions

- B1 Driver: MDSDRV, vendored under `third-party/mdsdrv/` at a pinned commit with `COPYING` and `UPSTREAM_COMMIT`
  (GB/NES pattern). Song data written by our converter.
- B2 Emulators: never fullscreen. MAME harness headless (`-video none -sound none -nothrottle`); owner viewing:
  `mame genesis -cart x.bin -window -nomaximize -resolution 640x480`. Window purpose text per global rule 6a-2
  (MAME has no title option: say in chat which window is whose).
- B3 Builds through `~/.claude/bin/buildq --purpose "<session>: <task>" -- <build command>`; test runs nice 19, 2 workers.

## OWNER DECISIONS (recommended default first)

**Owner answers 2026-11-20:**
- Downloads: ONLY MDSDRV source (pinned commit) approved. Prebuilt `mdsdrv.bin`, salvador and wine NOT approved.
- D1: "prebuilt bin, else vasm". The prebuilt bin download is not approved, so build path = port the 68k source to
  `vasmm68k_mot`. If a prebuilt bin turns out to be inside the approved source checkout, use it. If the Z80 blob build
  needs salvador, stop and ask the owner (do not download; check first whether the source ships the blob or allows an
  uncompressed build).
- D4: keep the XGM route until MDSDRV passes 1:1, then delete it in one commit.
- D2, D3, D5-D9: recommended defaults (a), not vetoed by the owner.

- **D1 MDSDRV 68k assembly.** (a) Recommended: use the official prebuilt `mdsdrv.bin` from a GitHub release of
  superctr/MDSDRV (zlib) if one exists for the pinned commit, plus a byte-hash staleness guard; (b) port the 68k source
  to `vasmm68k_mot` syntax in our build script (risk: local fork of the driver, asm68k macro features); (c) wine +
  bundled asm68k (non-free tool on the dev machine; never in the product). Phase 0 checks whether a release blob exists.
- **D2 Player shell.** (a) Recommended: small 68k asm shell (`public/md/player.s`, vasm): header, TMSS, VDP init,
  font tiles, VINT -> `mds_update`, screen. (b) m68k-elf-gcc C shell. (c) SGDK (needs Java rescomp; not installed). 
- **D3 Meter source.** (a) Recommended: read MDSDRV work-RAM track fields (volume, key/note) at offsets taken from the
  driver source, pinned by a MAME test; (b) a per-frame level table emitted by the converter beside the song (no driver
  RAM dependency, but it is not the driver's state).
- **D4 XGM route.** (a) Recommended: keep `src/lib/export/xgm/`, `public/xgmtool/`, `third-party/sgdk-xgm/` until the
  MDSDRV route passes, then delete them in one commit (NES capture-route pattern). (b) delete now.
- **D5 1:1 compare basis.** (a) Recommended: per-frame register state (shadow of every YM2612 register both ports +
  SN76489 latches at end of each VINT frame) plus the key-on/key-off event list per frame; (b) exact write order per
  frame (MDSDRV writes in a different order and skips redundant writes; would fail on equal sound).
- **D6 Region.** (a) Recommended: NTSC 60 Hz ROM first (`genesis` set); PAL via MDSDRV auto tempo, measured second.
  (b) Both from the start.
- **D7 PCM mode.** (a) Recommended: 2 channels at 17.5 kHz, switch to 3 at 13.3 kHz only when a song needs 3 PCM voices.
- **D8 ctrmml as reference.** (a) Recommended: do not read ctrmml / mdslink source (GPL-2.0); write from mdsseq.md and
  MDSDRV's zlib source only. (b) Read it to settle doc gaps (licence-contamination risk for our converter).
- **D9 Songs whose tick rate is not 60/50 Hz.** (a) Recommended: approximate with the MDSDRV tempo accumulator, report
  the timing error per song as lossy; (b) refuse export.

## Reuse map (searched 2026-11-20: famistudioSong, hugeSong, nes-rom-check, gb-rom-check, vgm-register-fixture, furnaceRegisterStream, xgmtoolWasm, nativeExportRouter)

| Need | Reuse | How |
|---|---|---|
| Furnace song model | `parseFurnaceSong` (used by `src/lib/export/nes/famistudioSong.ts`, `gb/hugeSong.ts`) | same entry for `src/lib/export/md/mdsSong.ts` |
| Converter shape | `furnaceToFamistudio` / `furnaceToHuge` (bytes + lossy list) | `furnaceToMds(song) -> { seq, pcm, lossy }` |
| ROM patch + staleness | `tools/build-nes-famistudio-player.sh`, `buildFamistudioRom`, player.json sourceHash | `tools/build-md-player.sh` -> `public/md/player.bin` + `player.json` (slot addresses, sourceHash) ; `buildMdRom` patches seq/pcm/strings, fixes header checksum |
| Reference registers | `tools/furnace-audit/vgm-register-fixture.ts` + `furnaceRegisterStream.ts` (`opn`, `psg` kinds) | reference = Furnace CLI `-vgmout` stream per frame |
| Check tool | `tools/nes-rom-check.ts`, `tools/gb-rom-check.ts` (resumable, `--only`, `--failed`, inputHash) | `tools/md-rom-check.ts` |
| Feature song generator | `tools/make-nes-feature-test.ts` (untracked, another session) | pattern for `tools/make-md-feature-test.ts` |
| Player screen | `player-screens.html` platform `md` | port the shared `layout()` to 68k tiles |
| Export dialog | native ROM rows where NES/GB tiles are wired (`nesExport.ts` callers) | add Mega Drive row last |

## Phases (in order)

### Phase 0 - Toolchain, driver build, headless proof (no product code)
- After owner approval of the downloads: vendor MDSDRV at a pinned commit. Build the Z80 blob with sjasmplus + salvador,
  the 68k side per D1. Record sizes of `mdsdrv.bin` and the Z80 blob.
- Hand-write a minimal `mdsseq.bin` (one FM track, one PSG track, 4 notes) from mdsseq.md; shell calls `mds_init` and
  `mds_update` per VINT. Run `mame genesis -cart p.bin -video none -sound none -nothrottle -seconds_to_run 5
  -autoboot_script tap.lua`; the Lua script taps writes on `:maincpu` program 0xA04000-0xA04003 and 0xC00011, and on
  `:genesis_snd_z80` program 0x4000-0x4003 and 0x7F11 (which side writes FM is U: tap both), stamps them with the frame
  number, prints JSON. PASS = expected key-ons and F-numbers appear.
- Measure the tick model: notes of length 1..N at tempos 128, 255, others -> frames per sequencer tick. Settle whether one
  MDS tick can equal one Furnace tick at 60 Hz (needed for 1:1 macros and effects).
- Read MDSDRV source for: work RAM size and track struct (D3), FM F-number table and PSG period table (pitch error vs
  Furnace per note, cents table), `dtn` unit, `pta` speed unit, pitch envelope unit (0x100 = semitone V).
- Generate Furnace reference fixtures for 3 songs with `FURNACE_CLI=/Applications/Furnace.app/Contents/MacOS/furnace`.

### Phase 1 - Converter core (`src/lib/export/md/mdsSong.ts`)
- Sound data header + pointer table + sequence header + track table + song data table, written by us (linker step of
  mdslink, reimplemented from the doc per D8).
- Channels: FM1-6 -> 00-05, PSG1-3 -> 06-08, noise -> 09, ext FM3 operators -> extra tracks with `EC 8x`, DAC / PCM ->
  FM6 PCM1 plus 0A-0F PCM2/3.
- Orders unrolled to per-track streams; each Furnace pattern used twice or more becomes a subroutine (`FE`), loop point via
  `FA`..`FB 00` or `F5` jump. Row length = speed ticks (grooves and speed changes baked into lengths).
- Instruments: Furnace FM ops -> 30-byte FM voice; PSG volume macro -> PSG envelope; other macros -> macro tables
  (per-tick nodes, `81` waits, `84`-`86` loops); pitch macro -> pitch envelope.
- Unit test `src/lib/export/__tests__/mdsSong.test.ts`: header bytes, command encoding, decoder round-trip (`decodeMds`
  for tests only), player staleness hash.

### Phase 2 - Player ROM and patching
- `public/md/player.s` (D2), `tools/build-md-player.sh` (via buildq), `player.json` slots: seq, pcm, title/author/message
  strings, subsong table. `buildMdRom` places data, pads to a power of two, fixes the header checksum.

### Phase 3 - Check tool `tools/md-rom-check.ts` (design below), first verdicts on all 29 songs (state + lossy counts).

### Phase 4 - Effects 1:1
- `tools/make-md-feature-test.ts` builds `public/data/songs/furnace/genesis/md_feature_test.fur`: one block per effect
  and per macro type in the map below, each on FM and PSG where it applies.
- Per effect: implement, measure in md-rom-check (state match per frame for that block), move it to MATCHED or to the
  lossy list with the measured difference. Coverage table in this plan (effect, block, frames, match %, verdict).

### Phase 5 - Player screen (platform `md` in player-screens.html)
- 320x224, margins m=1/mx=1, 40x28 cells, 10 bars (6 FM + 4 PSG; bar width 3 cells), palette `qpal(3)` (9-bit MD colour),
  text logo DEVILBOX (font has no lowercase), title, `BY <author>`, chip line `YM2612 + SN76489` with `MEGA DRIVE` right,
  rule, bars with labels 1-9/A, time (`{`/`|` play/pause glyphs), `SONG n/m`, rule, message scroller (song comments,
  sample names). Bars fed per D3. Joypad: left/right subsong, start pause. Text check in MAME (VRAM name-table dump
  via Lua), screenshots only via a subagent.

### Phase 6 - Export dialog wiring, end to end
- Mega Drive ROM row next to NES/GB rows; disabled with reason when the song has no YM2612/SN76489; lossy list shown in
  the dialog; MCP `export_native` target `md`. Verify menu -> handler -> converter -> download -> MAME boot.

### Phase 7 - PAL + region, SSF2 banking only if a real song exceeds 4 MB (unlikely; PCM-heavy songs first).

## Effect map Furnace -> MDSDRV (status: PLANNED until measured)

| Furnace | MDSDRV | Notes / risk |
|---|---|---|
| note, note off `OFF`, release `===` / `REL` | `82-DF` note (C1 + n), rest, key-off at length end; `E0` slur when legato | Furnace notes outside C1..+93 clamped (LOSSY) |
| instrument | `E1` song-table index | max 255 table entries per song (shared with envelopes, subroutines, PCM) |
| volume column (FM 0-7F, PSG 0-F) | `E2 00-7F` (-0.75 dB = 1 TL step) FM; `E2 80-8F` PSG | FM scale matches TL units; PSG 2 dB steps vs SN 2 dB: verify |
| 00 arpeggio, E0 arp speed | macro table `16` transpose nodes + `81` waits | |
| 01/02 pitch slide, F1/F2 | pitch envelope with per-tick delta, or macro `51`/`8A`/`8B` detune add | units from Phase 0 |
| 03 portamento | `E7 pta` | speed curve may differ: measure; else pitch envelope (LOSSY if neither matches) |
| 04 vibrato, E3 shape, E4 range | looping pitch envelope (jump node) | sine shape approximated by nodes |
| 07 tremolo | macro `58` volume add loop | |
| 08 / 80 pan | `E9` (FM only) | MD is hard L/C/R: Furnace on YM2612 is too; PSG has no pan (Furnace neither) |
| 09/0F speed, groove, F0 BPM, FD/FE virtual tempo | baked into row lengths; `F9` tempo | non 60/50 Hz tick rates: D9 |
| 0A / FA / F3 / F4 / F8 / F9 volume slides, D3/D4 | macro `58` volume add per tick, `E3` per row | |
| 0B jump, 0D pattern break, FF stop | order unroll, loop `FA/FB 00` or `F5`, `FF` finish | |
| 0C retrigger | macro `82` retrigger + wait | |
| EC note cut, DC delayed mute | split length + rest / volume macro | |
| ED note delay | rest before the note | |
| E1/E2 note slide | pitch envelope to target | |
| E5 set pitch | `E6 dtn` | unit check |
| EA legato, E6/E8/E9 quick legato | `E0` slur, transposed note after rest | |
| FC note release, E7 macro release | key-off timing; macro table `80 00` waits for key-on | release-point semantics: measure |
| F5/F6/F7 macro disable/enable/restart | `EB 00` / `EB n` | partial (LOSSY until measured) |
| 10 LFO | `F6 22 xx` (global reg) | |
| 11 feedback, 61 algorithm | `ED B0 xx` | |
| 12-15 op TL | `EE op dd` | carrier TL interacts with volume: verify |
| 16 MULT, 50-55 AM/SL/RR/DT/RS/SSG-EG, 19-1D AR, 56-5F DR/SR | `ED rr ww` per channel | |
| 17 DAC enable, sample notes | `F0` PCM on FM6 / PCM tracks | PCM resampled to MDSDRV rates (LOSSY, measure) |
| 18 extended channel 3 | `EC 8x` FM3 special mode, one track per operator | |
| 20 noise mode | `EA E3`/`E7` on noise track (PSG3 frequency) or fixed noise | |
| 30 envelope hard reset | `ED` writes before key-on | timing risk |
| 60 operator mask | TL max on masked ops | approximation (LOSSY) |
| 62/63 LFO FM/AM depth | `EA` lfo sensitivity | |
| 90-92 sample offset | none | LOSSY |
| EE external command | `F8` comm byte | |
| macros: vol, arp, pitch, pan, ALG, FB, FMS, AMS, per-op TL/AR/DR/MULT/RR/SL/DT/D2R/SSG/AM/RS/KSR | macro table (`16`,`18`,`36-39`/`76-79`,`87`,`88`,`C0-FF` FM register) | macro release points, delay and speed baked into nodes |

## Lossy list (expected; each confirmed or cleared by measurement)

- Notes outside MDSDRV range; F-number table differences (cents per note, measured).
- PCM: rate quantised to MDSDRV steps, 2-3 channel mix, sample offsets 90-92 dropped; Furnace soft-mixed multi-PCM.
- Tick rates other than 60/50 Hz (D9); grooves only via lengths.
- Operator mask 60xx; macro release-point semantics; F5-F7 macro control.
- Song-table limit 255 entries per song; track count 16 (MDSDRV) vs Furnace channels (6 FM + 3 ext FM3 + 4 PSG + PCM).
- Write order inside a frame (not compared, D5).

## Size limits

- ROM: 4 MB without mapper (SSF2 above, Phase 7). Player + driver estimate: tens of KB (U until Phase 0).
- Track positions are signed words relative to `tbase` (V): one song's track data must fit in about +-32 KB of its
  table; long songs rely on pattern subroutines. Confirm the reach in Phase 1 with a large song (Shovel_Knight_Title).
- Song table index is one byte: 255 instruments + envelopes + subroutines + PCM per song (V).
- 68k work RAM ~1 KB (V README); Z80 RAM 8 KB holds the PCM mixer.

## Check tool design (`tools/md-rom-check.ts`)

- Usage: `nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/md-rom-check.ts [--only <name>] [--failed] [--frames N]`
  -> `test-data/md-rom-check.json`. Skips songs whose input hash (song bytes + player.json hash + converter source hash)
  matches a recorded verdict; writes each verdict as it completes.
- Reference: Furnace CLI `-vgmout` of the song (vgm-register-fixture path), split into frames, replayed into a register
  shadow (YM2612 ports 0/1, SN76489 latch + data) -> per-frame state + key events.
- Device: `buildMdRom` -> MAME `genesis` headless with the Phase 0 Lua tap -> same shadow per VINT frame.
- Align frame 0 on the first key-on of each side (boot offset differs); compare N frames (default 900).
- Verdict per song: `stateMatch` % per register class (freq, TL/vol, op params, pan/LFO, PSG tone, PSG vol, noise, DAC),
  key-event diffs, first diff (frame, register, want, got), lossy list from the converter, ROM bytes, error/refused.
- Pass = 100% on every class not covered by the song's lossy list. Negative test: a corrupted song byte must fail
  (`nesRomCheckNegative.test.ts` pattern).
- Disk: ROMs and logs to the session scratchpad, deleted after the verdict is written.

## Downloads needed (owner approval; none done)

| Name | Official URL | Licence | Why |
|---|---|---|---|
| MDSDRV source (pinned commit) | https://github.com/superctr/MDSDRV | zlib | driver (68k + Z80), docs, tick model, RAM layout |
| MDSDRV prebuilt `mdsdrv.bin` (only if a release has it) | https://github.com/superctr/MDSDRV/releases | zlib | avoids non-free asm68k (D1 a) |
| salvador | https://github.com/emmanuel-marty/salvador | zlib | compressor the MDSDRV build uses for the Z80 blob |
| (only if D1 = c) wine | https://www.winehq.org | LGPL-2.1 | runs bundled asm68k.exe on the dev machine |
| Not needed | ctrmml / mdslink (GPL-2.0, D8), SGDK, BlastEm, Genesis Plus GX (non-commercial) | - | MAME + Furnace CLI already installed |

## Open risks (unverified)

- MDSDRV tick granularity may not allow one sequencer tick per VINT at every tempo: per-tick Furnace macros then become
  approximations (Phase 0 measurement decides how much of the effect map can be 1:1).
- Driver may write FM from the Z80 side (queue) and skip redundant writes: frame-state compare (D5) handles it, write-order
  compare would not.
- MAME Lua tap names (`:maincpu`, `:genesis_snd_z80`) and `install_write_tap` behaviour on the 0.286 genesis driver: Phase 0.
- mdsseq.md says it may contain errors; header/pointer details checked against driver source and MAME.

## Phase 0 results (2026-11-20)

Tags: [measured] = observed in a build or MAME run; [source] = read from MDSDRV source (third-party/mdsdrv/src).
Reproduce: `tools/md-phase0/run.sh <scratch-dir>` (driver build + 3 shell ROMs + MAME 0.286 headless + decode).

### Vendor (B1)
- MDSDRV vendored at `fefc7178579c59505f860e292e76af4a1857c6eb` into `third-party/mdsdrv/` (see `UPSTREAM_COMMIT`). Bundled Windows .exe files removed (asm68k non-free, mdslink GPL, salvador, sjasmplus).

### Build (vasm + sjasmplus, no asm68k, no wine, no salvador) [measured]
- `tools/build-mdsdrv.sh <out>` copies `src/` and patches the copy. Port edits, all recorded in the script header:
  1. `mdssub.z80`: ldib/ldiw macro parameter `addr` renamed (sjasmplus 1.24.1 "Unable to finish substitutions" on `m2_pcm1_addr`).
  2. `mdsdrv.inc`: `PACK_Z80 equ 0`. This is an upstream option: the driver then `incbin`s `out/mdssub.bin` uncompressed. **No salvador download needed.**
  3. `.68k/.inc`: asm68k `@local` to vasm `.local`; `inform` commented out; `if def(X)` to `ifd X`; `if def(MML)&(~def(MMLDEF))` to `ifd MML`.
  4. `mdssub.inc`: named macro args `\ch`/`\vol` to `\1`/`\2` (vasm "index register expected").
  5. vasm flags `-spaces -no-opt`.
- Result: `sjasmplus` "Errors: 0, warnings: 0"; mdssub.bin 2714 bytes (sha256 2321168f...). vasmm68k_mot 2.0d: mdsdrv.bin 9594 bytes (sha256 a4f75287...), jump table `6000 0020 6000 0398 6000 011a 6000 0126` = init/update/request/command at +0/+4/+8/+12, then "MDSDRV0.6 230612".
- Byte-identity with an asm68k build is NOT checked (no asm68k). Functional proof is the MAME run below.

### MAME proof: PASS [measured]
- Shell `tools/md-phase0/shell.68k`: vectors, header, TMSS, `mds_init(a0=$FF0000, a1=seq, a2=256 zero bytes)`, `mds_request(d0=1, d1=3)`, VINT on (`$8174`), VINT handler calls `mds_update`. Hand-written sequence: FM1 track (ch $00) + PSG1 track (ch $06), notes $AF $B2 $B6 $BB, each length byte $17 (24 ticks), tempo `F9 dd`.
- Sequence header layout that the driver accepted: `+0 dc.w tbase-bgm`, `+2 tvol`, `+3 tcount`, per track `dc.b chan,0` + `dc.w pos-tbase`; tbase entries `dc.w voice-sdtop`. Song header magic `$10011f00`, version `$0003`.
- Tap `tools/md-phase0/tap.lua` (maincpu 0xA04000-3, 0xC00010-1; genesis_snd_z80 0x4000-3, 0x7F11), decoder `decode.py`. Tempo $7F output:
  ```
  f5  M FM1 block 3 fnum 271 / KEYON ch0 opsF / PSG0 period 127
  f29 M FM1 block 4 fnum 161 / KEYON ch0 opsF / PSG0 period 106
  f53 M FM1 block 4 fnum 203 / KEYON ch0 opsF / PSG0 period 84
  f77 M FM1 block 4 fnum 271 / KEYON ch0 opsF / PSG0 period 63
  ```
- All YM2612 and PSG writes come from the 68k (`M`); the Z80 wrote nothing to the YM/PSG in this song (no PCM). 141 writes in 5 s.
- Intervals are correct (A, C, E, A on both chips). **Absolute octave differs: FM plays A at 55 Hz (block 3 fnum 271), PSG plays A at 881 Hz (period 127), with FM voice transpose byte (+29) = 0.** The upstream example voice uses transpose `$30`. Note-to-pitch mapping per chip is an open Phase 1 item (measure with skill format-pitch-octave; do not set a base constant).

### Tick model: YES, one MDS tick = one Furnace tick at 60 Hz [measured + source]
- [source] mds_update: each VINT `counter += w_tempo+1`; while `counter >= w_gtempo` step one tick. `w_gtempo` = 128 NTSC, 107 PAL. So ticks/frame = (dd+1)/gtempo.
- [measured] 24-tick notes, NTSC: tempo $7F = 24 frames apart (1.0 tick/frame); $3F = 48 frames (0.5); $FF = 12 frames (2.0). Exact, every note.
- Consequence: export with `F9 7F` on NTSC gives 1 tick per frame. 96 ticks = whole note. PAL (gtempo 107) needs `F9 6A`; not measured.

### Work RAM layout (D3) [measured from vasm listing, mdsdrv.lst]
- Track struct TSIZE = $3A (FM and PSG overlays same size). t_note_flag $00, t_counter $09, t_channel_id $0C, t_ins $0E, t_note $10, t_dtn $11, t_pitch $12, t_last_pitch $14, t_trs $16, t_pta $17, t_vol $18, t_type $34, t_fm_tl $36, t_psg_eg_delay $37.
- Work struct: w_gtempo $4A, w_track $4C, 16 tracks, WSIZE = $4C + 16*$3A = $3EC. Per-request word arrays (RCOUNT 4): w_request, w_tempo, w_counter, w_seq_step, w_volume, w_tmask, w_chmask (mdsdrv.inc ~200-260).

### Pitch tables and units [source]
- Pitch word: high byte = semitone (key code), low byte = 1/256 semitone. Both tables linearly interpolate the low byte.
- FM `mds_fm_freq_tab` (mdsdrv.68k:1872), 45 entries indexed by note-table value + t_ins_trs (voice byte +29): 161..304 / 322..608 / 644..1215 / 1288..2044; block = octave, `octave*8` into the A4 high byte. Generated by `tools/frqtab.c` (YM clock 7670454, A440).
- PSG `mds_psg_freq_tab` (mdsdrv.68k:1911): 1710,1614,1524,1438,1357,1281,1209,1141,1077,1017,960,906,855, shifted right by octave. PSG clock 3579545.
- `dtn`: signed byte added to the pitch word, unit 1/256 semitone (mds_pitch_update).
- `pta`: per update step = ((delta>>8)+1, or -1 if negative) * pta / 2, in 1/256 semitone, clamped at the target. In the source a higher value slides faster; the doc says "lower = faster". Conflict; measure in Phase 1.
- Pitch envelope (PEG): $100 = one semitone; nodes are (initial pitch, delta, time) per mdsseq.68k comments. Unit of time not measured.

### Downloads needed
- None for Phase 0. Salvador is not needed (PACK_Z80=0).

### Next step
- Phase 1: pitch mapping per chip (FM transpose vs PSG octave), pta direction, PAL tempo, then the exporter.
