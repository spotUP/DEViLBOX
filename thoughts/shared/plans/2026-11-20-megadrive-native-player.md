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

## Phase 1 results

Converter core: `src/lib/export/md/mdsSong.ts` (`furnaceToMds`). Unit test: `src/lib/export/__tests__/mdsSong.test.ts`.
Reuse: `arpIsFixed` and `expandProcMacro` from `nes/famistudioSong.ts`; the lossy collector and macro pattern follow `gb/hugeSong.ts`.

### What converts
- Systems `[0x02]`, `[0x83, 0x03]` (6 FM + 3 PSG tone + noise) and `[0x83]` (FM only). Other systems throw.
- Order flow is simulated with 0B / 0D / 09 / 0F / FF and speed alternation (speedPattern or speed1/speed2). Each (order, start row) pair becomes one chunk. The first repeated pair is the `FA` loop target, closed by `FB 00`.
- Chunks that repeat become `FE` subroutines, except where this chunk or the next starts with a tie.
- Per chunk the converter writes an instrument prefix (`E1` voice, `E8` PEG, `EB` macro table), `E2` volume and `E9` pan on FM. Notes, ties and rests are split at 128 ticks.
- FM voices come from the Furnace FM data (DT table remapped, operator order 1-3-2-4, transpose byte $30).
- PSG volume macros become PSG envelopes. Arp macros become macro tables (`16 tt` transpose, `81 nn` wait). Absolute pitch macros become PEG nodes (Furnace 1/128 semitone, x2 to MDSDRV $100 = semitone).
- Effect 08 maps to FM pan. Volume column: FM `E2 127-v`, PSG `E2 round((15-v)*8/3)`.
- `F9 7F` (1 tick per frame) goes on the first track.

### Measured in MAME (tools/md-phase0 shell, headless)
- Note mapping. FM with voice transpose $30 and note = Furnace note value: A-4 gives block 4 fnum 1083 = 440.1 Hz, and C-4 gives fnum 644 = 261.7 Hz. PSG note = Furnace value - 24: A-4 gives period 254 = 440.4 Hz, and C-4 gives period 427 = 262.0 Hz. Furnace plays 440.0 and 261.6 Hz.
- Timing. Length byte = ticks - 1. With `F9 7F` and 24-tick rows, key-ons fall at frames 5, 29 and 53, so one tick is one NTSC frame.
- pta (`E7`): a larger value gives a faster slide. With `E7 04` the FM1 fnum climbs about 18 per frame (block 0, 661 to 1266 over 28 frames). With `E7 20` it climbs about 170 per frame at block 0, then about 50 per frame at block 3. On a key-on with no previous note, the slide starts from the bottom of the range. The glide curve has not yet been mapped to the Furnace 03xx speed.
- Real song, Fancy_Promenard.fur (systems 83+03, 58 Hz, speeds 4/3). On the first rows, every FM key-on in MAME matches the converter's note and order: F-1 43.6 Hz, E-5 659.2, G-2 98.0, G-5 784.3, D-5 587.6 and B-4 493.8 at row 0; E-5 and G-3 196.1 at row 1 (+7 frames, 4+3 ticks); A-4 440.1 at row 2. The noise channel runs its PSG envelope (attenuation 3, 7, 10, 12, 13, 14). FM1 (the first track, which carries `F9`) keys on one frame before the other tracks.

### Unverified / lossy
- In Fancy_Promenard, effects 03 (18 uses) and E5 (5 uses) are dropped. The song plays at 60 Hz instead of 58 Hz.
- Noise-channel notes are written as PSG pitch, without setting the noise mode (452 notes in Fancy_Promenard).
- Not converted: FM volume macro, FMS/AMS, fixed arp, relative pitch macro, macro delay and release, tuning other than 440, and virtual tempo other than 1:1.
- Arp macro wait `81 nn` = nn+1 ticks comes from reading the code. The PEG scale is not measured in MAME.
- The FM1 one-frame lead is not explained.
- A loop that ends inside a tied note is not checked for legato.

### Next step
- Map 03xx to an `E7` value by fitting the measured curve.
- Map E5 to fine tune.
- Set the noise mode for PSG channel 4.
- Find tempo handling for songs that are not 60 Hz.
- Then Phase 2 (ROM build and UI wiring).

## Phase 1b results

Measured 2026-11-20 on `Fancy_Promenard.fur` (58 Hz, Genesis). Furnace side: `furnace -vgmout` decoded by
`tools/md-phase0/events.py`; MDSDRV side: headless MAME 0.286 with `tools/md-phase0/tap.lua`, same decoder.
Times in seconds from the first FM key-on.

Tool fixes found on the way (Phase 0 harness):
- `tap.lua` kept its write taps in a `local` table. Lua collected it after the autoboot chunk returned and the taps
  vanished about 0.5 s in, so every earlier MAME log ended at ~0.58 s. Taps are now global, and the log is
  line-buffered (MAME `-seconds_to_run` exit does not close Lua files). Phase 1 conclusions that used only the
  first rows still hold; longer comparisons before this fix were not possible.
- `events.py` (new) decodes both a MAME tap and a VGM into the same event lines, in seconds.

Gaps closed:
- **FM1 keys on 1 frame early (item 5): not a driver bug.** All six FM key-ons land in one VINT (0.000-0.005 s,
  voice writes in between); the old frame decoder floored at a VINT phase of ~0.93 and split them across frames.
  With events.py FM1-FM6 key at 0.0-0.005 s, Furnace at 0.0.
- **Tempo (item 4).** The converter now writes `F9 dd`, dd = round(128 * hz * vt / vtd / 59.922743) - 1
  (58 Hz: `7B` = 58.05 Hz). Before: row 1 at 0.1152 s (60 Hz) vs Furnace 0.1207 s. After: FM2 has 39/39 key-ons
  matching Furnace over 9.5 s, max error 13.6 ms (under one NTSC frame). The remaining error is frame quantization:
  MDSDRV ticks only on VINT, so a non-60 Hz rate always jitters up to 1 frame. Lossy note says so.
  Max rate is `FF` = 119.8 Hz; above that the byte clamps.
- **Noise mode (item 3).** Furnace writes noise latch mode 7 (white, PSG3 period, `snNoiseMode` reset 3,
  sms.cpp:558). The converter now emits `EA e7` at the noise track start, and `20xy` maps to
  `EA 00/e3/e7` (x=0 fixed-rate mode is flagged lossy). MAME now writes NOISE MODE 7, and the attenuation envelope
  of the first note matches (3,7,10,12,13).
- **E5xx fine pitch (item 2).** Furnace: pitch = xx-80 in 1/128 semitone (linear, playback.cpp:1458,
  engine calcFreq nbase = base+pitch). Mapped to `E6 dd` with dd = 2*(xx-80) (MDSDRV dtn is 1/256 semitone).
  Range: dtn is a signed byte, so xx < 40 or xx > BF (beyond 1/2 semitone) clamps and is flagged lossy.
  Fancy_Promenard has no E5, so this is not yet measured in MAME (unverified).

Still open (measured, not fixed):
- **Noise pitch.** In noise mode the noise note drives PSG3. Furnace puts PSG3 at period 1 (111860.8 Hz) for this
  song's noise note; MDSDRV writes 15980.1 Hz then 4863.5 Hz. The noise note to PSG3 period mapping is wrong.
- **Extra key-ons.** FM1, FM3, FM5, FM6 get more key-ons in MDSDRV than in Furnace (FM1: 41 vs 31 in 9.5 s;
  first split FM1 at 2.05 s, FM5 at 3.89 s, FM3 at 6.46 s). Likely notes under 03xx (tone porta: Furnace slides
  without a new key-on) and other unmapped effects (EC note cut, 0A, 02, 04, 19 in the lossy list). Unverified:
  check the rows at those times first.
- **PSG1/PSG2.** Frequencies differ from 3.86 s on (Furnace 111860.8 / 18643.5 Hz vs MDSDRV 7457.4 Hz) and
  MDSDRV writes PSG1/2 FREQ 7457/2380 Hz at 0.005 s where Furnace writes nothing. Not yet traced.
- **03xx porta (item 1).** Furnace porta is linear: baseFreq += portaSpeed*pitchSlideSpeed (1/128 semitone)
  per tick, clamped at the target (genesis.cpp:1213, playback.cpp:1781). MDSDRV `E7` is exponential
  (step = ((delta>>8)+1)*pta/2), so no single E7 value matches a Furnace slide. Candidate 1:1 route: one PEG per
  slide (initial = (src-dst)*$100, delta = 2*speed per tick, then hold) on a slurred note; whether PEG restarts on
  a slurred note is unverified. Not implemented.
- Item 6 (arp wait nn+1, PEG scale) and item 7 (FM volume macro, FMS/AMS, fixed arp, relative pitch, macro
  delay/release): not started.

## Phase 1c results

Measured on Fancy_Promenard.fur, 9.5 s, MAME tap (`tools/md-phase0`) against the Furnace VGM events from Phase 1b.

### Gap 1: noise pitch (fixed in part)

- Cause: the converter sent noise-channel notes through the PSG tone mapping (`nv - 24`). In a PSG3-rate noise mode (20xy, x=1), Furnace uses "easy noise" (sms.cpp `NOTE_SN` without linear pitch, `snCalcFreq` with linear pitch). Above the threshold (note 141, noiseDivider 64), each semitone steps the PSG3 period down by one from 16. With `snNoLowPeriods`, a note above 153 writes period 1.
- Fancy_Promenard is not linear-pitch. Its noise note D-8 (Furnace note 158) writes PSG3 period 1 in all 453 Furnace writes (raw VGM bytes checked). MDSDRV wrote period 23 (key 74 = D-6 tone).
- Fix: `noiseKey()` in mdsSong.ts computes the Furnace period. It then selects the MDSDRV keycode whose `mds_psg_freq_tab >> octave` gives that period; period 1 is key 119. Keys above the note-byte range go out through `E4` track transpose. Period 0 cannot be reached (MDSDRV minimum is 1) and is reported as lossy.
- Measured: PSG3 FREQ now matches Furnace (111860.8 Hz, period 1) up to 5.79 s; it was wrong from 0.0 s before. After 5.79 s MDSDRV writes periods 2, 3 and others (10 writes at 55930 Hz), and there is one 15980 Hz write at start-up. Cause not yet traced. Suspects: a noise-channel pitch effect or pitch macro (the easy-noise path adds pitch and arpeggio offsets, which `noiseKey` ignores), or `E4` state at the pattern loop.
- Limits recorded in code: noiseDivider 60 (chipType 1/2) is not handled. Transpose state is not re-set at the loop point.

### Gap 2: extra FM key-ons (traced, not fixed)

- FM1 (ch0) in MDSDRV keys on every row (about 0.12 s apart) from 2.05 s to 5.07 s. Furnace keys on only at 2.29 / 2.53 / 2.90 / 3.86 s and later. The ch0 note before this is F-1 ins 4 with `E2 49` (note slide down: speed 4, 9 semitones) and `19 17` (attack rate for all operators), at 1.57 s and 1.93 s. Rows 1-31 of order 1 are empty. Next step: dump the FM1 track bytes from o1 r2 on, to see what the driver reads as notes.
- FM5 (ch4): MDSDRV keys on at 3.89 s; Furnace has a note off (o2 r0) at 3.86 s and its next key-on at 4.10 s. FM3 (ch2): extra key-on at 6.46 s, on an empty row between the B-2 notes at o3 r8 and o3 r14 (ins 6).
- No mapping is done yet for E2 / 19 / EC / 0A / 02 / 04 / 03. The splits line up with E2 slides and EC note cuts. This is unverified: the track bytes have not been read.

### Gaps 3-6: not started (budget)

PSG1/PSG2 frequency from 3.86 s, 03xx PEG per slide, arp wait nn+1 and PEG scale, FM volume macro, FMS/AMS, fixed arp, relative pitch, and macro delay/release are all still open.

## Phase 1d results (2026-11-20)

Measured with MAME 0.286 headless (tools/md-phase0 tap.lua + events.py) against Furnace on Fancy_Promenard, first 9.5 s.

**Gap 2 (extra FM key-ons): root cause fixed.** `src/lib/export/md/mdsSong.ts:335` wrote every song-table entry relative to sdtop. MDSDRV reads `pat` subroutine entries (`fe dd`, `@cmd_pat`) and macro-table entries (`eb`, `@cmd_mtab`) relative to tbase, as signed words. Every subroutine call therefore jumped into the wrong bytes. Fix: subroutines and mtabs are registered through `tbItem` (line 214) and written as `offset - tbase`. FM voice, PSG envelope and PEG entries stay sdtop-relative. The test decoder in `mdsSong.test.ts` follows `fe` from tbase too.

FM key-on counts, MAME vs Furnace:

| Channel | Before | After | Furnace |
|---------|--------|-------|---------|
| FM1 | 40 | 31 | 31 |
| FM2 | 39 | 39 | 39 |
| FM3 | 34 | 37 | 37 |
| FM4 | 32 | 39 | 36 |
| FM5 | 32 | 25 | 25 |
| FM6 | 30 | 25 | 25 |

Matched channels have key-on times within 14 ms. Side effect: PSG3 FREQ now matches 120/120 writes with 0 value differences (Phase 1c residual; was 76 vs 120).

**FM4 residual (3 extra key-ons, not fixed).** First split is at 3.937 s. Source ch3 row o2 r1 is a note with `03 70` (tone portamento). Furnace slides there without a key-on; the exporter emits a plain note. Candidate fix: emit `e0` (slr) before a note on a 03xx row, so the driver skips key-off/key-on, and log the slide as lossy (pitch jumps). A real slide needs PEG-per-slide (Phase 1b item 1).

**Gap 3 (PSG1/PSG2 frequency drift from 3.862 s): not started.** Known facts only: Furnace writes PSG1 111860.8 Hz and PSG2 18643.5 Hz, MDSDRV writes 7990.1 Hz on both; PSG2 ATT writes 328 vs 466.

## Phase 1e results (gap 3: PSG drift in Fancy_Promenard)

Root cause, two parts, both in `src/lib/export/md/mdsSong.ts`:

1. **PSG octave.** The exporter mapped a PSG note as key `nv - 24`. MDSDRV key k writes period `mds_psg_freq_tab[k % 12] >> (k / 12)` (key 0 = 1710). Furnace 0.6.8.3 (sms.cpp, toneDivider 64) writes `round(3579545 / (27.5 * 2^((nv + 3) / 12)) / 64)`. For C-3 (nv 36) that is 214 (522.7 Hz). The old key 12 wrote 855 (130.8 Hz), two octaves low. Key = nv writes 213. The Phase 1 claim "A-4 = period 254 with nv-24" was computed, not measured against the Furnace VGM, and was wrong. Fix: `PSG_OFFSET` removed. The tone key is nv, and noiseKey's tone fallback uses the same key.
   - Invariant: the period MDSDRV writes for a PSG note equals the period Furnace writes for that note.
2. **PSG volume.** The volume column was sent as `E2 round((15 - v) * 8 / 3)` through the MML volume table, which is lossy (v 12 gave attenuation 1 instead of 3). MDSDRV `@write_vol` adds `15 - (E2 & 15)` for E2 `$80..$8f` to the envelope attenuation and clamps at 15. Furnace `VOL_SCALE_LOG(macro, vol, 15)` gives attenuation `clamp((15 - macro) + (15 - vol), 0, 15)`, which is the same sum. Fix: `E2 $80 | v`.

Measured (headless MAME vs Furnace VGM, 9.5 s, md1d/cmp.py), before -> after:

| Channel | Furnace | Before | After |
|---------|---------|--------|-------|
| PSG1 FREQ | 68 | 62 | 54 |
| PSG2 FREQ | 60 | 62 | 56 |
| PSG1 ATT | 310 | 303 | 299 |
| PSG2 ATT | 328 | 466 | 442 |
| PSG3 FREQ | 120 | 120 | 110 |

Raw counts are not the measure of success. The frequency values are what changed: PSG2 now plays 525/787 Hz against Furnace 522/782, and PSG1 plays 787/989/1177 against 776/981/1165, so the notes match where before they were two octaves low. The PSG2 attenuation run after a note is 4, 8, 7, 11, 15, 14, which matches Furnace. Before, it was 3, 7, 6, 10.

Still open (not fixed, not lossy-slurred):
- **Period rounding.** The fixed MDSDRV table is up to 1 period off Furnace's exact equal temperament (C-3: 213 vs 214, about 8 cents). E6 detune applies per track, so it cannot correct each note. A 1:1 match needs a per-note period table, which MDSDRV does not have.
- **Count gaps.** The remaining count gaps are Furnace per-tick pitch writes (vibrato and slides: the 440.4/391.1 and 860.5/998.8 pairs) that the export does not emit yet. PSG3 FREQ dropped from 120 to 110 and needs checking. PSG3 carries the noise rate at period 1, so check whether the noiseKey path still writes period 1 on every retrigger.
- **FM4 03xx extra key-ons.** Not reached in this phase's budget.

Test: `src/lib/export/__tests__/mdsSong.test.ts`, case "PSG1 and PSG2 keys write the period Furnace writes". It checks that every PSG1/2 key equals the Furnace note, that the MDSDRV period is within 1 of the Furnace period, and that volume 12 is `E2 $8c`. Run against the old source, it fails 2 of 3 cases (round-trip plus the new one).

## Phase 1f results (PSG gaps, Fancy_Promenard, headless MAME, cmp2 = writes clustered within 2 ms, repeats deduped)

Method: existing harness (conv -> run1.sh -> MAME tap.lua -> events.py), plus a clustered compare (cmp2.py) because raw event counts are inflated by latch/data byte pairs and by driver idle writes.

1. PSG1/PSG2 write-count gap. Cause is NOT vibrato/arp: the song's PSG channels use only two `03xx` tone portamento effects (both PSG1) plus `E5`. PSG2 matches note-for-note and envelope-for-envelope after dedupe (ATT 196 vs 200, FREQ 24 vs 25); the raw excess is the driver itself (MDSDRV rewrites ATT 15 every tick on idle channels and writes ATT 15 one tick before a retrigger). Song data does not control that.
   Fix: `03xx` on a PSG channel now emits `E0 E7 <pta>` before the note (slur = no key-off/envelope retrigger, `e7` = MDSDRV portamento speed) and `E7 00` on the next plain note. pta is chosen by `portaPta` in mdsSong.ts: it simulates Furnace's linear-in-period step (xx per tick) against MDSDRV's per-tick exponential glide (mdsdrv.68k ~line 1998) and picks the closest pta. Lossy `effect 03` entries 18 -> 12.
   PSG1 clustered FREQ: Furnace 27, MAME 30 (before: slides absent). Slide 1 Furnace 776.8/873.9/981.2 vs MAME 787.8/909.4/964.3/989.9; slide 2 Furnace 585.7/703.5/880.8/1177.5/1300.7 vs MAME 588.7/880.8/1096.7/1215.9/1285.8/1331.7. Chosen pta values 255/239: the driver glide is exponential, Furnace's is linear in period, so the step count and intermediate values do NOT match 1:1 (1-2 extra steps per slide). Approximation, not 1:1.
2. Noise ATT 552 vs 350: clustered envelope sequence matches (335 vs 337, same 3,7,10,12,13,14,15 shape, small time offset, one extra ATT 15). The raw gap is the driver's per-tick idle ATT writes. No song-data fix; nothing changed.
3. PSG3 FREQ 120 -> 110: not reproducible on the committed source (fresh run 120 vs 120, valdiff 0). Probably a different measurement point in 1e. No change.

Open: exact 1:1 slide needs a driver-matching pta/pitch-envelope (`e8`) model or per-row note-by-note emission; ATT 15 idle/key-off writes are driver behaviour; FM4 `03xx` extra key-ons not looked at; only Fancy_Promenard measured.

## Phase 1g results (PSG 03xx 1:1, Fancy_Promenard, headless MAME, cmp2)

Mechanism: per-slide pitch envelope (`E8`, song-table item, sdtop-relative) instead of `E7 pta`. `portaEnvelope(from, to, xx)` in mdsSong.ts writes one 4-byte node per Furnace tick (initial modulation = 256*12*log2(target period / step period), delta 0, length 0 = one tick; mdsdrv.68k @do_peg: a node lasts length+1 ticks), then a held 0 node (length 255) and the `7f` jump. The note is slurred (`E0`), so no key-off/key-on. The next plain note re-sends the instrument's `E8` (pegDirty). `E8` itself clears mod/pos, so the envelope starts on the slide row. `pta` could not be tuned to this: its glide is exponential in pitch, Furnace's is linear in period.
Measured (clustered FREQ, Hz), step count: slide 1 Furnace 3, MAME 3 (before 3 vs 4); slide 2 Furnace 5, MAME 5 (before 5 vs 6).
Slide 1 Furnace 776.8/873.9/981.2, MAME 787.8/887.8/989.9 (before 787.8/909.4/964.3/989.9).
Slide 2 Furnace 585.7/703.5/880.8/1177.5/1300.7, MAME 588.7/708.0/887.8/1190.0/1331.7 (before 6 steps).
Remaining value offset is the driver's period table vs Furnace's integer period for the same notes (the held base notes differ identically: 776.8 vs 787.8, 1300.7 vs 1331.7), so it is not a slide error. PSG1 FREQ cluster count Furnace 27, MAME 28 (extra is the driver's startup write at 0.005 s).
FM4: `03xx` on FM now emits `E0` (slur) when the channel is sounding, so no extra key-on. FM key-ons Furnace vs MAME over 9.5 s: FM1 31/31, FM2 39/39, FM3 37/37, FM4 36/36, FM5 25/25, FM6 25/25. The FM pitch still jumps (no slide model measured); recorded as lossy `FM 03xx slide`.
Open: FM 03xx real slide (fnum model); a slide crossing a chunk start is cut (insCmd resets E8); existing `pitchEnvelope` writes node length n for n ticks but the driver holds a node length+1 ticks (not checked against a song); only Fancy_Promenard measured.

## Phase 1h results (2026-11-21)

Measured with headless MAME 0.286 (tools/md-phase0/tap.lua + events.py) against Furnace `-vgmout`.

- **Pitch envelope off-by-one (MEASURED, fixed).** The driver holds a node length+1 ticks (mdsdrv.68k @do_peg); the converter wrote n for n ticks. Puyopuyo FM2 (instrument 2 pitch macro, 4 steps): before, steps 0.001/0.032/0.065/0.099 s (2 ticks apart) vs Furnace 0.000/0.017/0.033/0.050 s; after, 0.001/0.015/0.032/0.049 s. Frequencies equal Furnace (525.88, 533.19/534.0, 542.13, 554.32 Hz); only the driver's fnum rounding differs (0.2 percent). Test in mdsSong.test.ts fails on the old code.
- **FM 03xx real slide (MEASURED, Fancy_Promenard FM4).** Furnace steps the FM frequency linearly in Hz by xx fnum units of the TARGET note's block per tick (1.6256 Hz per xx at block 6, 3.25 Hz at block 7; block = lowest with fnum <= 1215), clamped at the target. Written as a per-slide `E8` pitch envelope (same path as PSG, `portaEnvelope(..., fm=true)`). 03 70: Furnace 1749.13/1931.19/1975.08 Hz, MAME 1750.75/1931.19/1975.08, 3 steps one tick apart in both. 03 20: Furnace 2347.34/2451.38/2555.41/2636.69, MAME 2350.59/2454.63/2558.66/2636.69, same step count. The lossy item "FM 03xx slide" is gone. MAME runs about 6 ms later than Furnace (driver latency, unchanged).
- **Slide across a chunk start (IMPLEMENTED, NOT MEASURED).** `insCmd` skips the `E8` at a chunk start while a slide is still running (`slideEnd`). Affects golden_shit FM1, RubyIllusions FM3, djtBMX FM1; no slide crosses a chunk start in Fancy_Promenard or Puyopuyo (seq bytes identical). Unverified against Furnace; worst case equals the old behaviour (envelope cut).
- **Open:** FM 03xx where the previous key is not sounding (no slide emitted), PAL clock (NTSC clock only), other FM slides in Puyopuyo/Ruby/golden_shit not compared. Other lossy effects (02, 80, EC, ED, E2, 19, 0A, 04) unchanged.
- **Listen ROMs** (headless-built, no emulator opened): `~/Desktop/md-roms/Fancy_Promenard.bin`, `~/Desktop/md-roms/Puyopuyo.bin` (shell + `F9 7F` tempo; Puyopuyo has many unmapped effects, measured only for the pitch envelope).

## Phase 1i results (2026-11-21)

Headless MAME 0.286 (tools/md-phase0/tap.lua) against Furnace `-vgmout`, decoded with tools/md-phase0/events.py; MAME runs about 40 ms behind Furnace.

**Task 1: chunk-start slide (14aab7bbd) and the FM 03xx model.**
- Measuring the chunk crossings showed the bigger fault was the slide model itself. All four test songs except Fancy_Promenard have `compatFlags.linearPitch` = 2 and `pitchSlideSpeed` = 4. In linear-pitch mode Furnace keeps the base frequency as note<<7 and steps it by xx * pitchSlideSpeed (1/128 semitone) per tick on FM and PSG (genesis.cpp / sms.cpp NOTE_PORTA, playback.cpp portaSpeed multiplier). The 1h Hz-linear model is right only for non-linear songs (Fancy).
- Fix: `portaEnvelope(..., linStep)` gives exact nodes, 2 * (cur - dest) in 1/256 semitone. The caller passes `linStep` when linearPitch is set. `03 00` now only stops the porta and is no longer counted as lossy.
- RubyIllusions FM3 03 0F (35 -> 32, 30.45 s):
  - Before: MAME 121.92 -> 109.73 Hz in about 1.5 Hz steps, 9+ steps, and the target was never reached.
  - After: MAME 120.19, 116.94, 113.89, 110.84, 107.9, 104.95, 103.83. Furnace 120.19, 116.94, 113.79, 110.84, 107.8, 104.95, 103.83. This is 1:1.
  - The chunk start at 30.6 s re-keys with a new instrument, so the crossing is harmless.
- golden_shit FM5 (32.17-32.42 s, the slide after the 32.0 s chunk start):
  - Before: 100.28, 113.38, 126.29 ... (Hz-linear, 7 steps).
  - After: 98.04, 110.03, 123.44, 138.58, 155.65, 174.55 and back down. Furnace has the same values (155.45 vs 155.65 is fnum rounding). This is 1:1.
  - The FM1 crossings (13.3/40/89.3/100 s) all end 1 tick after the chunk start. The slide is already done, so they are harmless.
- New finding, djtBMX FM1 (tick rate 156 Hz, F9 ff = 2 sequence ticks per frame): MDSDRV steps a pitch envelope once per frame, not once per sequence tick.
  - A 72-tick Furnace slide (193.44 -> 53.69 Hz, 0.305 semitone per tick) played as 36 frame nodes of 0.31 semitone, so it covered only half the range (192.43 -> 102.31).
  - Fix: the `tpf` = (tempo + 1) / 128 argument samples the Furnace tick for each frame node. slideEnd is now counted in sequence ticks.
  - After: 188.97, 182.27, 175.77 ... 55.42, 53.44 Hz, then key 130.86. This is Furnace's every second tick (189.79, 183.08 ... 53.69, key 131.27) with the song's constant 5-7 cent note-tuning offset, which also shows on plain notes.
- Test: mdsSong.test.ts "portaEnvelope: linear-pitch 03xx ..." covers the exact first node and node count at tpf 1 and 2.
- Listen ROMs: ~/Desktop/md-roms/RubyIllusions_Genesis.bin, golden_shit.bin, djtBMX.bin.

**Task 2: FM 03xx when the previous key is not sounding.** This was checked in source only, not measured. playback.cpp:1153 drops the note-on only `if (chan[i].keyOn)`. After a note off or release, Furnace therefore keys the new note on at its own pitch, with no slide. The converter's FM `sounding` guard matches that.
- Open: the PSG path slides even when not sounding. Per the same source line it should not. Change it only after a measured case (no corpus case found yet).

**Task 3 (02, 80, EC, ED, E2, 19, 0A, 04): not started** (agent budget). Corpus usage, highest first:
- golden_shit: 0A 1276, 02 1046, 01 562, 04 146.
- djtBMX: 02 868, EC 194, ED 110.
- RubyIllusions: E2 162, 04 74, 02 47, ED 42.
- Suggested order: 01/02 (pitch slides; same linear-pitch model, per-frame nodes), then 0A, EC/ED, 04, E2.

Open gaps:
- Other pitch envelopes (instrument pitch macros, arps) on songs above 60 Hz also run per frame. Not yet measured.

## Phase 1j results (2026-11-21)

Commit 24e441379: linear-pitch 01xx/02xx now converts to an MDSDRV extended pitch envelope (bit 15 in the envelope table; node = init sw, delta sw, len ub, next ub; frame k = init + (k+1) * delta, held len+1 frames). The converter tracks the running offset per channel, steps xx * pitchSlideSpeed / 128 semitone per tick (row tick included), keeps the slide across notes and note offs, clamps at Furnace note 179 / 0 and also at the driver key range 0..93 (MDSDRV wraps below key 0; flagged lossy), and stops the slide at the clamp when targetResetsSlides is set. Key-on, instrument change and chunk starts re-emit the envelope from the current offset. Unit test: golden_shit hex contains `0000fa000d01a800`.

### 01/02 measured (MAME vs Furnace, per frame)

- golden_shit FM1, 02 c0 then 02 ff kick, 60 Hz speed 1.
  - Before: no slide (lossy "effect 02"), flat note.
  - After: MAME 554.32 / 349.5 / 220.88 / 139.19 / 87.88 / 55.52 Hz, Furnace 554.32 / 349.91 / 220.88 / 139.39 / 87.88 / 55.52 Hz. Worst 2.5 cents over 0-7.8 s.
- Verdict 02: 1:1 within the driver key range.
- Verdict 01: same code path, not measured. No Genesis-only corpus song uses nonzero 01 (Plok_Beach, Equinox Intro, Kobito, SpareHalloween2 have other systems; Solar_Man has 01 03 on ch3 and is the next candidate).

### Open gaps

- Below driver key 0 (16.36 Hz FM) MAME holds 16.36 Hz while Furnace keeps falling (to 0.51 Hz). Inaudible; flagged lossy.
- golden_shit from 7.83 s: MAME one frame late (timing drift, not pitch). Not chased.
- golden_shit FM2/FM3 1102-cent error is the existing "FM note out of range (clamped)" at 6655 Hz, not 01/02.
- limitSlides songs and fractional tpf: flagged lossy, not modelled.
- Not started this phase: 0A volume slide, EC/ED, 04 vibrato, E2.
- PSG key-off slide (Furnace playback.cpp:1153 does not slide after key-off; our PSG path does): no corpus check done, still open.

Listen ROM: ~/Desktop/md-roms/golden_shit-02-slide.bin

## Phase 1k results (2026-11-21)

Code: commit 340847596 (src/lib/export/md/mdsSong.ts, tools/md-phase0/events.py).
Listen ROMs: ~/Desktop/md-roms/golden_shit-0A-volslide.bin, Solar_Man-EC-cut.bin, djtBMX-ED-delay.bin.

### 01 pitch slide up (Solar_Man o3 r24 ch3 / FM4, 01 03, 56 Hz speed 5)
- Furnace per tick from 19.2857 s: 525.88, 529.13, 531.57, 534.82, 537.25 Hz.
- MAME per frame: 525.88, 528.31, 531.57, 534.00, 537.25 Hz. Worst gap about 2.7 cents (fnum rounding).
- Verdict: 1:1 in rate. After r25 Furnace stops at 554.32 Hz because of E1 11 (note slide up); E1 is unsupported, so MAME keeps rising.
- Side note: MAME key-on about 60 ms early on this song (19.2237 s vs 19.2857 s). Not chased.

### 0A volume slide (golden_shit FM2, 0A 01 then 0A 0F, 60 Hz speed 1)
- Before: lossy "effect 0A", no slide in MAME.
- After: TL0 and TL3 match on all 449 frames (0-7.5 s). TL1/TL2 match on all frames once MAME TL1/TL2 are swapped.
- Verdict: 1:1. The TL1/TL2 swap is a separate bug (see open gaps).

### EC note cut (Solar_Man FM1/FM3, EC 01, 56 Hz speed 5)
- Before: lossy "effect EC", note never cut.
- After: Furnace key-off 1 tick (17.9 ms) after key-on (0.17857 -> 0.19642 s; 0.26785 -> 0.28571 s). MAME key-off 1-2 frames after key-on (0.18198 -> 0.19846 s; 0.26538 -> 0.29858 s).
- Verdict: 1:1 within 60 Hz frame quantisation of 56 Hz ticks.

### ED note delay (djtBMX FM3, ED 04, 156 Hz time-scaled to 120 Hz)
- Before: lossy "effect ED", note on the row start.
- After: Furnace key-on 0.02562 s (4 ticks at 156 Hz). MAME key-on 0.03194 s; expected 4 ticks at 120 Hz = 0.0333 s, inside one frame.
- Verdict: 1:1 in ticks; absolute time carries the existing lossy 120 Hz cap of this song. Not measured on a song under 120 Hz.

### 04 vibrato
- Not started (budget).

### Open gaps
- NEW, top priority: fmVoice op order [0, 2, 1, 3] puts Furnace op2/op3 on the opposite registers from Furnace's own writes (0x44 vs 0x48). Probably swaps every op2/op3 parameter on every FM voice, not only TL.
- E1/E2 note slides unsupported (215 E1 uses in corpus).
- PSG key-off slide.
- golden_shit 1 frame late from 7.83 s.
- FM2/FM3 1102-cent clamp.
- FA and other volume-slide effects still lossy.
- ED delay does not shift 01/02/03 slide accounting (slides still start on the row tick).
- MAME 60 ms early on Solar_Man key-on (cause unknown).
- djtBMX tick rate capped at 120 Hz (MDSDRV maximum), time-scaled.
- 04 vibrato unmeasured.

## Phase 1l results (2026-11-21)

Code: commit 8ddf0fda1 (src/lib/export/md/mdsSong.ts, src/lib/export/__tests__/mdsSong.test.ts).
Listen ROM: ~/Desktop/md-roms/golden_shit-oporder.bin.

### FM voice operator order (root cause of the 1k TL1/TL2 swap)
- Layer: the converter. fmVoice remapped Furnace operators [0, 2, 1, 3] before packing.
- Furnace stores operators in register order: genesis.cpp writes state.op[i] at opOffs[i] (fmshared_OPN.h: 0x00, 0x04, 0x08, 0x0c). orderedOps {0,2,1,3} (fmsharedbase.h) only remaps the operator number in effects (12xx etc.).
- MDSDRV reads each voice row in register order (mdsdrv.68k "load inst data": byte k goes to base + 4k; doc/mdsseq.md "FM voice format").
- events.py was not at fault: both the Furnace VGM and the MAME tap go through the same decoder, so it cannot swap one side only.
- Fix: pack fm.operators as stored (identity order). One change covers DT/MUL, KS/AR, AM/DR, SR, SL/RR, SSG-EG and TL on every FM voice.
- Measured, golden_shit FM2, first write per operator register (scratch regdump.py), slots +0/+4/+8/+C:
  - Furnace: DT/MUL 02 04 05 02, KS/AR 1b 1a 8d 18, AM/DR 01 04 06 03, SR 03 03 01 08, SL/RR 37 27 08 06.
  - MAME before: DT/MUL 02 05 04 02, KS/AR 1b 8d 1a 18, AM/DR 01 06 04 03, SR 03 01 03 08, SL/RR 37 08 27 06.
  - MAME after: identical to Furnace on every row. TL0..TL3 match on all 449 frames (0-7.5 s) with no decode swap.
- Verdict: 1:1. The 1k 0A verdict now holds without the TL1/TL2 decode swap.
- Unit test: golden_shit hex contains `020405021b1a8d18` (DT/MUL + KS/AR rows) and not the old remapped bytes.

### 0A / EC / ED unit tests
- Added to mdsSong.test.ts on Solar_Man channel 0 order 0 row 0 with the effect added: 0A 04 gives E2 0d/0e/0f/10 ties on ticks 1-4; EC 02 gives a rest at tick 2; ED 02 moves the first key-on to tick 2 (keyOns and decoded sequence). None flag lossy.

### 04 vibrato
- Not started: the converter has no 04 handling yet (still lossy "effect 04"). Needs a design for Furnace vibrato (vibTable, depth/speed, vibratoDirection) on an MDSDRV pitch envelope; larger than this phase's budget.

### Open gaps
- 04 vibrato unimplemented and unmeasured.
- Sibling, unverified: src/lib/export/MDXExporter.ts has OPM_OP_OFFSETS = [0, 2, 1, 3]. Furnace OPM also stores ops in register order (fmshared_OPM.h opOffs 0x00/0x08/0x10/0x18), so MDX may carry the same swap; check against MDX's voice layout before changing.
- All Phase 1k open gaps except the op-order item remain.

## Phase 1m results (2026-11-21)

Code: commits b1e49f8f9 (MDX/PMD operator order) and the Phase 1m vibrato commit (src/lib/export/md/mdsSong.ts, src/lib/export/__tests__/mdsSong.test.ts).
Listen ROM: ~/Desktop/md-roms/highscorefollin-04-vibrato.bin.

### Sibling audit: Furnace FM operator order in exporters
Furnace stores operators in register order (OPM opOffs 0x00/0x08/0x10/0x18 in fmshared_OPM.h, OPN 0x00/0x04/0x08/0x0c in fmshared_OPN.h; arcade.cpp and ym2608.cpp write state.op[j] at chanOffs|opOffs[j]). orderedOps only renumbers operators for effects.

| Hit | Verdict | Action |
|---|---|---|
| MDXExporter OPM_OP_OFFSETS [0,2,1,3] (*8) | Wrong: swaps op 2/3 on every 0x40-0xE0 write. MDX emits raw register writes (0xFE reg val), so only the register address matters | Fixed to i*8 |
| PMDExporter OPN_OP_OFFSETS [0,8,4,12] | Wrong: same swap on OPN registers | Fixed to i*4 |
| fmOperatorModel FM_FOUR_OPERATOR_DISPLAY_ORDER [0,2,1,3] | Correct: UI display order (Furnace insEdit.cpp opOrder) | None |
| FurnaceRegisterMapper | Correct: storage order | None |
| engine/furnace/__tests__/operatorOrder.test.ts | Correct: pins storage order | None |
| AdPlugExporter (OPL 2-op) | Correct: operators[0] modulator, [1] carrier | None |
| md/mdsSong fmVoice | Fixed in 8ddf0fda1 | None |

Unit test: src/lib/export/__tests__/fmOperatorRegisterOrder.test.ts (MULT 1,2,3,4 lands at slots +0,+8,+16,+24 for MDX and +0,+4,+8,+C for PMD).

### 04 vibrato: design
- Furnace (playback.cpp): 04xy sets rate x, depth y. A note resets pos to 0 unless continuousVibrato. Every tick, after the row runs, pos += x (mod 64) while depth > 0. The pitch offset is ((y * vibTable[pos] * vibratoFine) >> 4) / 15 in 1/128 semitone under linear pitch. vibTable[i] = (int)(127 * sin(i / 64 * 2 pi)). vibratoFine = 15, set by E4xx.
- MDSDRV: an extended pitch envelope (E8, doc/mdsseq.md). There is one node per driver frame: init = 2 * offset (1/256 semitone), delta 0, len 0. The cycle is 64 / gcd(64, x) nodes and the last node loops to node 0. Node n plays pos0 + (n + 1) * x, the same "first frame is tick 1" rule portaEnvelope uses.
- Rejected: EA FM LFO sensitivity. It is global, hardware-shaped and does not reach PSG.
- Emission: E8 on a note while depth > 0 (phase from 0, or the carried phase with continuousVibrato); E8 on a mid-note 04/E4 change from the current phase; the instrument pitch envelope comes back on 04 x0; the envelope is re-sent at chunk start while sounding. The phase is tracked per channel in ticks.
- Lossy (flagged): non-linear pitch (still "effect 04"); 04 together with a 01/02/03 slide or an instrument pitch macro (vibrato replaces it); tpf != 1 rounds the frame to the nearest tick.
- Not handled: vibrato shapes (E3xx), 05xy, vibratoDirection. These are not flagged yet.

### 04 vibrato: measurement
- Song: highscorefollin.fur (linear pitch, 60 Hz). It has mid-note 04 66 on FM2-FM4 at order 0 row 32, with vibrato from 4.0 s.
- Measurement: Furnace VGM against headless MAME, per-frame FM frequency, lag-tolerant +-1 frame (scratch lagcmp.py).
- 0-19.4 s results:
  - FM1-FM3 worst 2.4 cents, 0 frames over 10 cents. Verdict: 1:1 through the vibrato sections.
  - FM4 has 19 frames over 10 cents (worst 87.5) at 2.13-2.25 s, before any vibrato. Furnace keys off and re-keys with a rising slide; MDSDRV slurs with no key-off.
- Unit tests:
  - vibratoEnvelope(0, 4, 7) exact nodes.
  - highscorefollin sequence contains vibratoEnvelope(0, 6, 6), with no "effect 04" lossy.

### Open gaps
- From 19.5 s, all FM channels diverge: 35-40 frames over 10 cents, worst 701 cents at 23.48 s. The cause is not traced. The listen ROM is a good place to hear it. It is unverified whether this predates the vibrato change.
- FM4 slide/slur at 2.13 s (above).
- Vibrato shapes, 05xy and vibratoDirection are unimplemented.
- MDX/PMD exporters write no voice table, so SET_VOICE points at nothing. PMD's 0xFE register-write meaning is unverified.

## Phase 1n results (2026-11-21)

Fix commit: e24229fd9 "Dither MDSDRV tempo on a conductor track so ticks keep Furnace time".
Listen ROM: ~/Desktop/md-roms/highscorefollin-1n.bin.

### Q1: highscorefollin drift from 19.5 s (up to 701 cents)

- **The drift came before the vibrato commit.** We built a ROM from e071fff1b^ (converter taken with `git show` into scratch). It drifts the same way: FM1 701.3 cents at 23.48 s and FM5 501 cents at 20.15 s.
- **The cause is timing, not pitch.** Note frequencies match Furnace. The MAME key-on lag against Furnace grows in a straight line:

  | Time | Lag |
  |------|-----|
  | 3.7 s | 4.8 ms |
  | 14 s | 17.1 ms |
  | 21 s | 28.1 ms |
  | 31.6 s | 39.9 ms |

  That slope is 0.129 percent, the same as 60 / 59.9227. The lag passes the 1-frame tolerance at about 19.5 s, so note edges then show as large cent errors.
- **Root cause.** The MDSDRV tempo command F9 takes one byte and counts in 1/128 NTSC frames. A 60 Hz song must therefore pick either F9 7f (59.92 Hz) or F9 80 (60.39 Hz). The converter wrote the nearest value, F9 7f, on track 0, so the song slowly fell behind.
- **Violated invariant.** Driver tick k must sound at Furnace time k / rate, within one frame, for the whole song and every loop pass.
- **Fix, in the layer that had the bug** (`src/lib/export/md/mdsSong.ts`):
  - A conductor track on dummy channel 0x0f now switches F9 between the two tempos on either side of the song rate. It does this in 128-tick blocks, sized so the running error stays under half a frame.
  - The intro and the loop body are balanced separately, so the error does not build up over loop passes.
  - The F9 on track 0 is removed.
  - Rates outside NTSC/128 to 2 * NTSC are clamped and flagged lossy.
  - The tempo lossy text now says ticks land up to 1 frame early or late.
- **Test.** The highscorefollin conductor is on channel 0x0f. The worst running error is under 0.5 frame. Each span (intro and loop) is balanced to under 0.01 frame.

### Before and after (MAME vs Furnace, 62 s capture, per-frame cents with plus or minus 1 frame lag)

| Channel | Before (worst) | After (worst / frames over 10 cents) |
|---------|----------------|--------------------------------------|
| FM1 | 701.3 | 2.3 / 0 |
| FM2 | drift | 2.4 / 0 |
| FM3 | drift | 2.4 / 0 |
| FM5 | 501 | 2.6 / 0 |
| FM4 | drift | 20 frames over 10 cents: the known 2.13 s slur, plus 61.93 s at the capture edge |
| PSG3 | 1200 | gone |
| PSG1 | 693.8 | 38.9 worst, 248 frames over 10 cents from 17.4 s (open) |
| FM6 | 1200 from 3.6 s | unchanged (open, not caused by timing) |

### Q2: lossy flags for E3 shape, 05xy, vibratoDirection, E1 and E2

- E1xy, E2xy, 05xy and E3 01/02 were already flagged by the generic `lossy.add('effect XX')` fallthrough. vibratoDirection is E3xx.
- E3 00 was a false flag: it is Furnace's default direction, which vibratoEnvelope already plays. E3 00 is now skipped.
- **Test.** On Solar_Man, E3 01/02, 05 01, E1 13 and E2 13 each flag 'effect XX'. E3 00 does not.

### Open gaps

- **FM6.** Furnace sends no FM6 KEYON on this song (likely DAC/PCM), but MDSDRV plays tones there.
- **PSG1.** From 17.4 s the error is up to about 40 cents. The cause is not yet found; it may be PSG period rounding or a vibrato depth on PSG.
- **FM4.** The 2.13 s slur (portamento/legato) is still open.

## Phase 1o results (2026-11-21)

Fix commit: b5272c7a2 (src/lib/export/md/mdsSong.ts + mdsSong.test.ts). Scratch tools: keylag.py (Furnace VGM key-ons vs MAME key-ons, nearest match within 100 ms, extended by one loop pass), flow.mts, fm6.mts, run.sh (from md1n).

### Q1. Conductor proof (key-on lag, MAME vs Furnace VGM)

- golden_shit: no loop, song ends at 101.35 s (MAME capture 206 s, also stops at 101 s). No drift. Worst 19.3 ms (FM6, 50.67 s). Median offset 5-9 ms (constant pipeline offset, about 5.6 ms in 0-10 s); without it the worst is about 13.7 ms, under 1 frame. FM5/FM6 carry the worst values (written last in VINT).
- Solar_Man before the fix: a step of about 96 ms from 71.43 s (tick 4000, order 13 row 0) to the loop point, 140-200 key-ons per 10 s window over 1 frame. Root cause was not the conductor: `0D` with no value at order 12 row 31 jumped to row -1, one extra empty row (5 ticks, 89 ms).
- Solar_Man after the fix (168 s: intro plus 2 loop passes, loop start 22.875 s, loop length 71.43 s): 0 unmatched key-ons, worst 18.1 ms (FM5, 28.57 s), median about 5 ms, at most 2 key-ons over 16.7 ms per window. The conductor holds Furnace time over the loop.

Violated invariant: an effect with no value plays as value 0 (Furnace playback.cpp `if (effectVal==-1) effectVal=0;`). Fixed once in `cellAt`, so it covers every effect. Side effects on Solar_Man: seq 19864 to 15576 bytes; the lossy entry "04xy with a pitch slide" (257) disappeared, because 04 with no value made bogus vibrato; fractional 01/02 went from 13 to 4; "past driver key range" disappeared.

Solar_Man pitch (lagcmp, 0-94 s; frames over 10 cents, worst cents):

| Channel | Before | After |
|---------|--------|-------|
| FM1 | 876, 898.5 | 476, 199.1 |
| FM2 | 324, 899 | 35, 197.8 |
| FM3 | 769, 899.1 | 468, 199.5 |
| FM4 | 1260, 2298 | 1061, 1200 |
| FM5 | 2796, 2199 | 2796, 1357 |

The remaining error comes from other gaps (E1/E2 lossy and others).

### Q2. FM6 on highscorefollin

Root cause: FM6 uses instrument 0 "Drums (Kit Map)", type 4 (DIV_INS_AMIGA, a sample instrument). Furnace genesis.cpp note-on: `if (ins->type==DIV_INS_AMIGA) dacMode=1` (2B=0x80 at 3.6 s, then 436 DAC stream starts, no FM key-ons). The converter ignored the type and built a default FM voice, so it played tones about 1200 cents off.

Violated invariant: a sample instrument on FM6 plays the DAC, never an FM voice.

Fix: those notes become key-offs, flagged lossy "FM6 sample instrument (DAC PCM): silenced" (298 notes). After the fix there are 0 MAME FM6 key-ons after 3.5 s (same as the Furnace VGM), and FM6 has 0 frames over 10 cents.

Open: MDSDRV supports PCM from source (`f0` pcm, `f1` pcmrate, 8-byte PCM header, drum-mode subroutine; mdsseq.md). Wiring it needs sample conversion to the mdspcm blob, a kit map to drum mode, and a ROM builder slot. 17xx (DAC enable by effect) is not handled.

### Q3. PSG1 residue on highscorefollin (not fixed)

The first divergent frame is 17.400 s. Furnace PSG1 dips for one 2-frame step from 1575.5 Hz to 1471.9 Hz (-118 cents), then returns to 1575.5 Hz at 17.433 s. MAME writes 1491.5 Hz (-95 cents) for the same step: about 23 cents off. After that the steps match (17.67 s: 1747.8/1398.3 Hz on both). With the current lagcmp, PSG1 has 1010 frames over 10 cents, worst 48.8 cents at 32.1 s.

Next step: find the pattern cell at 17.4 s on PSG1. It is probably a pitch macro or arp node scaled in 1/256 semitone against a non-linear PSG period, or a fine-pitch rounding. Compare the PEG node value with the Furnace period.

Listen ROMs: ~/Desktop/md-roms/Solar_Man-1o.bin, ~/Desktop/md-roms/highscorefollin-1o.bin.

## Phase 1p results (2026-11-21)

### Q1: FM6 DAC (highscorefollin "Drums (Kit Map)", DIV_INS_AMIGA): partial

Done in `src/lib/export/md/mdsSong.ts`:
- FM6 notes on an AMIGA (type 4) instrument now play MDSDRV PCM instead of being silenced.
- The note is mapped through the kit noteMap (Furnace note = nv + 60). The sample is resampled with nearest-sample stepping to rate 8 (8 * 2190 = 17520 Hz), at `c4Rate * 2^((freq-108)/12)`.
- The sample is stored as signed 8-bit in `MdsSong.pcm`. Each sample is aligned to 32 bytes, never crosses a 32 KiB bank, and has 32 bytes of zero tail.
- Each sample gets an 8-byte PCM header item (rate 8, 24-bit offset, 32-bit length). `F0 <item>` is emitted when the header changes.
- An FM instrument after PCM leaves PCM mode automatically through `E1`, which clears cf_pcm_control.
- 1700 over a sounding sample is emitted as a key-off. Other 17xx values have no effect, because Furnace note-on resets dacMode.
- The ROM builder needs the blob linked at `pcm` (shell: `cnop 0,32768` / `incbin pcm.bin`) and passed in a2 to mds_init.
- highscorefollin blob: 9112 bytes (bassdrum_thud 5569 @ 22050, JK_SNR_01 6993 @ 26633).

MAME measurement, first 40 s:
- MAME has 98 PCM key-ons (YM 2B=0x80); Furnace VGM has 161 0x95 stream starts.
- 0 starts match within 1 frame. MAME runs a constant ~+105 ms (~6 frames) late, and ~40% of the hits are missing.
- Example: Furnace 3.600/3.733/4.000/4.267 s; MAME 3.704/4.105/4.375 s.
- The right sample plays per note, but the timing is not 1:1. The lossy flag stays (`FM6 sample instrument (DAC PCM): key-on timing not 1:1 yet`).

Hypotheses (not yet confirmed):
- Missing hits: mds_pcm_key_on returns early unless nf_key_off is set. Back-to-back drum notes without a rest, and the FM-to-PCM switch path (`bset pe_pcm1; bne @no_fm_key_off`), never set it. Try a 1-tick key-off before each repeated PCM note, or read the driver path in the MDSDRV source.
- Lag: the source is unknown. Measure the Z80 PCM request latency (68k write to Z80 RAM, then the first 2A write) and compare it with the Furnace 0x95 start against the first audible DAC byte.

### Q2: PSG1 residue at 17.400 s: not started

The budget went to Q1. The baseline is unchanged: 1010 PSG1 frames over 10 cents.

Listen ROM: ~/Desktop/md-roms/highscorefollin-1p.bin (drums audible, late/sparse).

Next:
1. Fix the missing PCM key-ons (nf_key_off / rest before a repeated note), then re-measure the hit count.
2. Find the source of the PCM lag, then re-measure against the 1-frame target.
3. Q2: find the PSG1 cell at 17.4 s, its pitch macro and the scaling root cause.

## Phase 1q results (2026-11-21)

Song: highscorefollin, 40 s, MAME headless, current converter. Listen ROM: `~/Desktop/md-roms/highscorefollin-1q.bin`.

### Q1 + Q2: PCM hits and lag (PASS, measurement artifact)

- Phase 1p counted YM `2B=0x80` writes as PCM key-ons. `mdssub.z80` writes `2B=0x80` (DAC enable) only when it leaves `idle_loop`, so back-to-back hits during playback never write it. The "98 of 161, +105 ms" numbers came from that artifact.
- The phase 1p fix hypothesis (missing `nf_key_off`) was wrong: `@cmd_note` sets both `nf_key_on` and `nf_key_off` for every note that is not slurred, and `mds_pcm_key_on` needs `nf_key_off`.
- New taps: a 68k write tap on `0xA00E02-0xA00E0F` (`z_pcm1_key_on` = `0xA00E08`) and a Z80 write tap on `0x0E08`. Both are aligned to the first FM key-on.
- Result: Furnace 160 `0x95` starts. MAME gives 160 68k requests and 160 Z80 consumes, 0 unmatched.
  - 68k: median +8.0 ms (min -3.1, max 19.4), 157 of 160 within 1 frame.
  - Z80: median +8.4 ms, 156 of 160 within 1 frame.
  - The median equals the FM pipeline offset from 1o (5-9 ms).
- Sample identity is bijective: Furnace block 0 maps to Z80 `(1,0,128)` and block 1 to `(1,128,145)`.
- The FM6 lossy flag is removed (commit 4512900aa). A test asserts that no FM6 lossy entry exists. The DAC volume (`dacVolTable`) shortcut stays open.

### Q3: PSG1 dip at 17.4 s (root cause found, not fixed)

- This is not a macro. PSG1 (ch 6) keys note 54 (F#6) at tick 1044. Furnace writes period 76 (1471.9 Hz). MDSDRV writes 75 (1491.5 Hz), +23 cents. Note 51 (D#6): Furnace 90, MAME 89.
- Root cause: Furnace linear pitch computes `period = round(clock / fbase / toneDivider)` (`engine.cpp` `calcFreq`, `sms.cpp` `toneDivider = 64`). MDSDRV `mds_get_psg_pitch` interpolates `mds_psg_freq_tab` and then does `lsr.w d2,d0` by octave, which truncates. Every note where the fraction lost by the truncation is 0.5 or more lands one period high.
- The comment at `mdsSong.ts:38-42` ("which is the period Furnace 0.6.8.3 writes for note value k") is wrong for the same reason. `psgPeriod()` mirrors the MDSDRV truncation, not Furnace.
- Baseline: PSG1 has 317 frames over 10 cents in 40 s. The worst is 48.8 cents at 32.1 s. The first bad frames are at 17.400, 17.417 and 17.8 s.
- Fix (converter layer): per PSG note, compute the Furnace period `round(3579545 / (16 * f))` with Furnace tuning. Where it differs from the truncated table value, emit a fine detune so that the interpolated table value after `lsr` equals the Furnace period. Check the existing PSG detune/pitch-envelope path in `mdsSong.ts:446-504` first.
- Open: at tick 1060, note 53 writes period 80 on both sides, while `psgPeriod(53)` = 84. The note probably carries an instrument arp offset. Not investigated.

### Next

1. Implement the Q3 PSG rounding compensation and re-run lagcmp on PSG1-3. PASS: 0 frames over 10 cents.
2. Apply the DAC volume (`dacVolTable`) on FM6 PCM.
3. Run the 1q PCM taps on a second song with dense drums.

## Phase 1r results (2026-11-21)

Song: highscorefollin.fur, 40 s, MAME genesis headless taps vs Furnace VGM.

1. **PSG rounding: PASS** (ecd6411aa). MDSDRV `mds_get_psg_pitch` truncates `>> octave`; Furnace rounds `sndPeriod`. Fix: per-key E6 detune (`psgFix`) so the post-shift period equals Furnace's rounded period. Frames over 10 cents, baseline -> fixed: PSG1 317 -> 0 (worst was 48.8 c), PSG2 69 -> 0, PSG3 349 -> 0. Worst left: 9.7 c on PSG2 (same as baseline). Residuals: keys 0-8 clamp at period 1023; keys 85+ one period high; arpeggio steps not corrected.
2. **Tick 1060: no bug.** The 1q note was an arithmetic error: 1281 >> 4 = 80 and Furnace round(80.08) = 80.
3. **FM6 DAC: sign bug fixed, volume mapped** (aa4096978).
   - MDSDRV PCM is unsigned (68k builds volume tables as (byte - 128) * gain, `out_dac` XORs $80); export wrote Furnace's signed bytes, so FM6 PCM played as noise (MAME DAC RMS ~106 vs Furnace ~42).
   - After fix, DAC RMS MAME vs Furnace per 4 s window: 4-40 s within -0.07..+0.23 dB; 0-4 s +1.46 dB (not investigated).
   - Volume: E2 attenuation -> `mds_psg_vol_table` level -> Z80 `volume_table` (2 dB steps). Old `127 - vol` played 0..3.25 dB loud. `pcmDacAtt` now picks the nearest driver gain to Furnace `dacVolTable`: max error 1.2 dB for vol 89..127 (unit test).
   - Not measured in MAME: volume below 127. Furnace VGM DAC streams ignore volume, so the VGM is only a reference at vol 127. DAC volume macro is ignored; volCmd uses the current instrument to detect PCM.
4. **Dense-drum key-on taps: not done** (budget).

Listen ROM: ~/Desktop/md-roms/highscorefollin-1r.bin (sign fix; vol 127 song so volume map has no effect).

Open: PSG3 noise-rate gap (silent-tone period differs while noise uses PSG3 rate, e.g. 13982 Hz Furnace vs 6214 Hz MAME near 34.13 s).

Next: (a) bake residual DAC gain into sample data or measure volume against a Furnace audio render; (b) PSG3 noise-rate gap; (c) task 4 dense-drum key-on taps.

## Phase 1s results (2026-11-21)

### Task 1: PSG3 noise rate gap at 34.13 s (highscorefollin) - PASS, commit 54018fdd2

- Root cause (converter). Crash Cymbal instruments 16 and 17 have arp macro [-5,-3,-2,-1,0] in PSG3-rate noise mode (duty 3, notes nv 9 and 10). Two faults:
  1. The MDSDRV macro table command `16 tt` sets channel variable $16 = `t_trs` (mdsdrv.lst: t_trs E:00000016), the same byte that E4 writes. The arp therefore overwrote the noise E4 transpose absolutely.
  2. Furnace easy noise (sms.cpp snCalcFreq) steps the PSG3 period down by one per semitone, which is linear. The MDSDRV tone table is exponential, so semitone steps give different periods.
  Furnace writes periods 8,6,5,4,3. MAME wrote 18,16,15,14,...
- Fix: a noise arp in PSG3-rate mode emits its own table with tt = noiseKey(nv + step) - note (cached per table content), and sets trs to NaN so the next note re-emits E4.
- Measured (MAME vs Furnace VGM, lagcmp best of lag -1..+1 frames): PSG3 frames over 10 cents 229 -> 0 over 0-38 s and 0-40 s (baseline worst 2666.9 c at 34.217 s). PSG1 0. PSG2 0 up to 38 s (worst 9.7 c).
- Known artifact, not a converter bug: PSG2 has 69 frames over 10 cents at 38.4 s. Furnace sets ATT 15 and stops writing FREQ. MDSDRV keeps writing FREQ at ATT 15 (silent). Same in the baseline. The compare tool must skip frames at ATT 15.
- Unit test: `highscorefollin: a noise arp in PSG3-rate mode steps the PSG3 period like Furnace easy noise (crash 8,6,5,4,3)` in mdsSong.test.ts (22/22 pass). Not checked that the test fails on the pre-fix code.
- Listen ROM: ~/Desktop/md-roms/highscorefollin-1s.bin.

### Task 2: +1.46 dB in the first 4 s - NOT DONE (budget)

The stop point of about 40 tool calls was reached on task 1. Next: per-channel RMS over 0-4 s (FM1-6 key-on/TL from tap events, DAC from the 0x2A stream), Furnace VGM vs MAME. Find the channel first, then check its first-note volume/TL (an initial volume macro or the first 0Axy might be missed before the first E2).

### Task 3: dense-drum PCM key-on taps on a second song - NOT DONE (budget)

Needs a 68k write tap on 0xA00E02-0xA00E0F plus a Z80 tap on 0x0E08, aligned to the first FM key-on, as in 1q.

## Phase 1t results (2026-11-21)

### Task 1: highscorefollin loudness

- The "+1.46 dB in 0-4 s" from 1r is not reproduced. A per-channel register loudness over 4 s windows on the 42 s capture (FM = carrier TL sum while keyed, PSG = ATT, DAC = time-held power of the 2A bytes, VGM streams simulated) gave a different picture. DAC was -0.08..-0.10 dB in every window. The real faults were on FM: FM1 -14.3 dB, FM3/FM4 -4.8 dB, FM5 -19.5 dB.
- Root cause was in the import layer, not in mdsSong.ts. `parseFMData` (src/lib/import/formats/furnace/FurnaceInstrumentParser.ts) and `FurnaceParser.readFMFeature` always read a block byte after the 4 FM header bytes. Furnace `instrument.cpp readFeatureFM` reads that byte only when `version >= 224`. highscorefollin is older, so every operator shifted by one byte. Wurlitzer parsed as TL 5f 5f 19 19 / MULT 14; the raw values are TL 1e 1c 10 16, and those are the values Furnace's VGM writes. This bug hits every FM instrument in pre-224 files, DEViLBOX playback included, not only the MD export. golden_shit (>= 224) was never affected, which is why 1l looked clean.
- Fix: both readers gate the block byte on the version.
- After: FM1-FM5 are within +-0.1 dB in every window, except two tail-window outliers (FM2 -0.98, FM3 -2.10 in 36-40 s). DAC is at -0.09 dB. Test: `highscorefollin (Furnace version < 224): FM operators parse without the v224 block byte ...`.
- PSG4 showed +0.9..+8 dB in loud.py. That is a loud.py artifact: it samples PSG state only on YM writes. A time-held noise power from the ATT writes gives -0.03..-0.23 dB per window. The noise ATT stream is identical in MAME, about 10 ms later. PSG1/PSG2 +0.9..+1.5 dB in 32-40 s is likely the same artifact (unverified).
- Listen ROM: ~/Desktop/md-roms/highscorefollin-1t.bin (md1n tap shell + PCM blob, TEMPO $7F).

### Task 2: dense FM6 PCM drum key-on tap on a second song

Not done (budget). The harness has the Z80 0x0E02-0F tap (P lines) and the 68k A00E02-0F tap (Q lines) ready to port.

### Task 3: lagcmp ATT-15 skip

- lagcmp.py now skips a frame when either side has ATT 15 at f-1, f or f+1. The PSG2 38.4 s false flag is gone: PSG1-3 show 0 frames over 10 c (worst 9.7 c at 34.25 s on PSG2).
- New real flag: FM4 at 2.133-2.25 s, 19 frames, worst 87.5 c. Furnace keys a new note at 2.133 (166.01 Hz) and slides up 1.22 Hz/frame to 174.55. MAME keeps the old note (no key-on), slides from 155.65 at 2.24 Hz/frame, and keys 174.55 at 2.268. It looks like a note+slide row (E1xy/E2xy or 01xx with a note) being converted as a slide from the previous pitch. Identify the cell next.
- Note: scripts using awk on these .ev files need LC_ALL=C. The sv locale parses "2.133" as 2.

## Phase 1u results (2026-11-21)

**FM4 2.133-2.25 s (highscorefollin), fixed in 83e1c87a1.** Order 0 row 62 on FM4 holds a bare `03 08` (porta with no note). Furnace slides to the note already playing, reaches it on the first tick, and with `targetResetsSlides` drops the porta (playback.cpp NOTE_PORTA returns 2: portaSpeed 0, inPorta false). Row 64 (`E3`, `01 04`) then keys a new note. The export kept the 03 alive, so row 64 became an E0 slur plus a 03 slide from D#3. `mdsSong.ts` now ends a 03xx on a row without a note when `targetResetsSlides` is set, and 01xx/02xx also end a 03xx (inPorta false). Test in `mdsSong.test.ts`: seq bytes with row 62 = `03 08` equal the bytes with row 62 empty. The test covers the no-note reset; the 01xx/02xx clear has no test of its own yet.
- lagcmp 0-40 s, FM4: 19 frames over 10 cents (worst 87.5 c at 2.25 s) -> 0 frames (worst 2.4 c). MAME keys FM4 on at 2.135 s, same as Furnace. FM1-5 / PSG1-3 unchanged (FM 0 frames; PSG2 worst 9.7 c at 34.25 s).

**Sibling check of 011b67f0d (FM block byte only from instrument version 224).** Ran furnaceRegisterLockstep, furnaceInsTypeNeoGeo, furnaceOldInstAyPlusOne, furnaceParserSnesFeature, furnaceInstrumentFiles, furnaceInstrumentSave, furnaceLoadInstrument: 23 of 24 pass. The one failure is the new owner-WIP row `Drifting in Colour.fur` (AY-3-8910) in furnaceRegisterLockstep: `command 3: Furnace HINT_PORTA(-1, 0), ours HINT_PORTA(0, 0)`. Not caused by 011b67f0d: the song is version 165, none of its 43 instruments carry FM data, so readFMFeature/parseFMData never run. Open: porta command-hint value on that row.

**loud.py time-held power, e7f91a7a3.** Register state is now weighted by how long it holds (both chips), not sampled on YM writes. fix.vgm vs fix.tap, 4 s windows, 0-40 s:
- PSG1 32-40 s: +0.92/+1.49 -> -0.04/+0.01. PSG2: +1.03/+1.23 -> -0.05/+0.01. PSG4: +0.92..+8.22 -> -0.03..-0.23. These were sampling artifacts.
- FM2 last window -0.98 -> -0.98; FM3 -2.10 -> -2.08. The gap is real. First look: in 36-40 s the FM3 TL sequences differ by operator (Furnace fades TL3 22..33, MAME fades TL2 16..27; FM2 similar on TL0/TL2 at section start). Open: check operator-to-register order / carrier mapping for the instrument used there, and the fade start time.

**Not done:** task 4 (PCM key-on lag tap on a second Genesis .fur with dense FM6 drums), out of budget.

Listen ROM: `~/Desktop/md-roms/highscorefollin-1u.bin` (md1u fix.rom, 1t tap shell + PCM blob).

## Phase 1v results (2026-11-21)

Listen ROMs: `~/Desktop/md-roms/highscorefollin-1v.bin`, `~/Desktop/md-roms/Solar_Man-1v.bin`. Measurement scratch tool: `pcmlag.py` in the md1v session scratchpad (Furnace VGM `0x95` starts vs MAME `Q A00E08` / `P E08` taps, from the first FM key-on; greedy nearest match -50..+100 ms).

### V1: highscorefollin FM2/FM3 36-40 s gap (FIXED, commit bf8bb6035)

- Not operator order and not a fade. Both sides use register order (S1 S3 S2 S4); the MDX/OPM order is covered by `fmOperatorRegisterOrder.test.ts` (no `OPM_OP_OFFSETS` left in the tree).
- Root cause: Furnace KVS. `fmsharedbase.h` `KVS(x,y) = (kvs==2 && isOutput[alg][y]) || kvs==1`; MDSDRV `mds_fm_update_vol` adds the volume to the carriers only (`mds_fm_op_table`). FM3 order 8 row 64 switches to instrument 21 "Funk Gt(Lower Volume)" (alg 3, TL 13 23 21 16, kvs 1 2 1 0) at attenuation 3: Furnace writes TL 16 23 24 16, MDSDRV wrote 13 23 21 19 (-2.25 dB). Instruments 9, 10, 22 share kvs 1 2 1 0 (FM2).
- Fix: after every E1 (voice reload) and E2, emit `EE op base` for each operator where Furnace scaling differs from the driver: base + att on a scaled modulator, base - att on an unscaled carrier. Out-of-range base clamps and is reported lossy.
- loud.py last window (36-40 s): FM2 -0.98 -> -0.06 dB, FM3 -2.08 -> +0.02 dB. Other channels unchanged.

### V2: PCM key-on lag on a second song (Solar_Man, 534 FM6 hits, speed 5 at 56 Hz)

- MegadriveOverdrive (most FM6 hits) is system 0xbe (YM2612 extended DualPCM), which the exporter rejects; Solar_Man used instead.
- Baseline: Furnace 270 `0x95` starts in 40 s, MAME 209. All 72 missing hits were instrument 4 "Snare": a sample instrument with no SM feature, so the parser leaves `amiga` undefined and the converter took sample -1 (silent). Furnace `DivInstrumentAmiga` defaults `initSample(0)` (instrument.h), so it plays sample 0.
- Fix (converter): `initSample ?? 0`. Test: Solar_Man FM6 key-ons at ticks 0 10 20 35.
- After: 270 of 270 matched, 0 unmatched (the 15 "extra" MAME hits are past the 40 s compare window). Lag 68k median +5.3 ms (min -5.0, max 18.5), 269 of 270 within one 56 Hz frame; Z80 median +6.3 ms, 266 of 270. Same as highscorefollin 1q (FM pipeline offset), so no conversion lag.

### Open

- Solar_Man DAC level -0.6 .. -1.5 dB per window vs Furnace (loud.py). Known `pcmDacAtt` 2 dB-step shortcut; -1.54 dB exceeds the stated 1.2 dB max error, so check the 120-volume hits against `dacVolTable` before baking residual gain into the sample data.
- Solar_Man PSG4 -0.3 dB flat (highscorefollin -0.03..-0.23). Not investigated.
- Parser: `amiga` undefined for a sample instrument without SM; other consumers of `instrument.amiga` may need the same Furnace default. Not checked.

## Phase 1w results (2026-11-21)

### Task 1: Solar_Man DAC level (done, 0dd040011)

- Root cause: Furnace scales DAC output by `dacVolTable[vol]` (genesis.cpp, 0.75 dB steps, truncated to 8 bits). MDSDRV PCM_LEVEL only has 2 dB steps, so the export picked the nearest step and missed by up to 0.66 dB (vol 120) / +0.30 dB (vol 124).
- Fix: `pcmDacAtt` picks the smallest driver gain still >= the Furnace gain, and `pcmRef` bakes the residual (`pcmDacScale`, always <= 1, never clips) into a per-volume copy of the sample. `noOPN2Vol` keeps the old unscaled path.
- Measured (MAME, 42 s, per-hit cluster means vs wanted): Bass Drum -5.35/-5.36, -2.35/-2.32, -0.13/0; Snare -0.09/0; Tom -2.17/-2.32, +0.10/0. All within 0.3 dB.
- loud.py's DAC row still reads about -0.7..-1.45 dB because the Furnace VGM 0x95 streams carry raw samples with no DAC volume applied. That row is not a valid reference for DAC volume.
- Known lossy case (flagged): a DAC volume change mid-note can only use the driver's 2 dB step.
- Listen ROM: ~/Desktop/md-roms/Solar_Man-1w.bin.

### Task 2: Solar_Man PSG4 noise -0.3 dB (diagnosed, not fixed)

- loud.py PSG4 reads -0.29..-0.33 dB in every window.
- The ATT sequence comparison (Furnace vs MAME) shows two differences:
  1. The first envelope node is one frame shorter on MDSDRV. Furnace gives 1,1,1,2,2,3,3 and MAME gives 1,1,2,2,3,3.
  2. Some re-hits do not restart the envelope on MDSDRV. Furnace restarts the macro at frame 7 (att 4), while MAME keeps decaying until frame 12.
- Driver reading: a note command ($82..$df) sets nf_key_off unless nf_slur is set (mdsdrv.68k @cmd_note). The PSG envelope restarts only when nf_key_off is set. So a plain note retriggers. A missed re-hit therefore means the export emitted a tie or a slurred note there, or an mtab (cf_mtab_carry) path is involved.
- Next step: dump the noise track tokens around the frame-7 re-hit (mdsSong.ts tok builder, lines 453-604). Check whether the hit becomes `tie` (same note, no instrument change) or is slurred. Then check the `$1f` pos/delay init on key-on for the short first node.

### Task 3: sample-0 fallback for SM-less sample instruments (not started)

- Budget ran out. Still to do: grep the readers of `instrument.amiga` and the sample-index fallbacks in src/lib/import and src/lib/export. Fix the MD path only and list the others.

## Phase 1x results (2026-11-21)

Commit d0c1a5315 (src/lib/export/md/mdsSong.ts, src/lib/export/__tests__/mdsSong.test.ts). Listen ROM: ~/Desktop/md-roms/Solar_Man-1x.bin.

### Task 1: Solar_Man PSG4 noise -0.3 dB

- The 1w "re-hit does not restart the envelope" diagnosis was wrong. Furnace's attenuation at frame 7 (4, 5, 5) is the same hi-hat envelope still decaying, not a new hit. Real hits come every ~10.7 frames (rows every 2 at speed 5, 56 Hz), alternating volume 14/11. MAME re-hits at the same frames (1, 12, 22, 33, 44 ...). No tie or slur problem.
- Root cause: envelope rate. MDSDRV steps the PSG envelope once per NTSC VINT (mds_psg_update_env), while Furnace steps the volume macro once per tick. The export wrote one node per tick, so at 56 Hz every PSG envelope ran 7% fast and decayed early.
- Fix: psgEnvelope resamples the macro to driver frames. Frame f plays tick floor((f + 0.5) * tickHz / NTSC_HZ). Songs within 0.5 Hz of NTSC keep one node per tick (bytes unchanged). Sampling at frame start (floor(f * r)) overshot to +0.33 dB; the midpoint is the right phase.
- loud.py, Solar_Man, 4 s windows, MAME vs Furnace:
  - PSG4 before: -0.29 .. -0.33 dB.
  - PSG4 after: -0.19 -0.15 -0.15 -0.17 -0.18 -0.16 -0.13 -0.16 -0.16 -0.15.
  - PSG1 unchanged (-0.03 / -0.00 / -0.01 / +0.07). PSG2 last window +0.06 to +0.07. PSG3 empty. FM rows unchanged.
- Not within 0.1 dB yet. Residual: in MAME the first node (3 frames at 15) sometimes plays only 2 frames (cycles at frames 1, 12, 33, 44, 55). Key-ons land up to one frame after Furnace's tick time, but the node-2 step sometimes stays at the Furnace absolute time. Next: dump the noise-track tokens and the driver envelope counter at key-on to see if key-on resets the envelope sub-counter.
- Tests: "PSG envelope rate" (56 Hz hat macro plays 28 frames, first node 0x30; 60 Hz bytes unchanged).

### Open items

- Same per-frame vs per-tick rate question likely applies to pitchEnvelope (PSG/FM pitch macros) and the arp mtab. Not checked.
- PSG4 residual -0.15 dB (first-node phase), see above.
- `npm run type-check` fails only in src/lib/export/amiga/__tests__/adfExport.test.ts (adfSongName undefined, uncommitted ADF work, not touched here). mdsSong files are clean.

### Task 2: instruments without an SM feature (Furnace initSample 0)

MD export path: only src/lib/export/md/mdsSong.ts (FM6 sample, `m.instruments[ins].amiga`) reads it, fixed in e044a8377. No other MD reader.

Other readers, not changed (outside MD path):
- src/lib/import/formats/furnace/FurnaceInstrumentParser.ts:173: `if (initSample >= 0) inst.samples.push(initSample)` only runs when SM exists, so a no-SM sample instrument lists no sample.
- src/lib/import/formats/FurnaceParser.ts:621: creates `amiga` with `initSample: -1` when only a note map exists; Furnace default is 0.
- src/lib/import/parsers/FurnaceToSong.ts:238: passes `furIns.amiga` through undefined; playback consumers then have no sample index.
- src/lib/export/FurnaceInstrumentEncoder.ts:594-597 and FurnaceInstrumentParser.ts:1628: skip SM when `amiga` is undefined (round trip keeps Furnace's default, so likely fine), and `initSample ?? -1` writes -1 where Furnace default is 0.

## Phase 1y results (2026-11-21)

### Task 1: pitch macro and arp mtab rate

- Driver: the pitch envelope (`@do_peg`, mdsdrv.68k ~2033) runs in the per-frame voice update, once per NTSC VINT. The macro table (`mds_update_mtab`) runs inside `mds_update_seq`, once per sequence tick (the `dbra d5` seq-step loop).
- pitchEnvelope had the psgEnvelope bug: one node per Furnace tick. Fix: the resampling moved out of psgEnvelope into `framesOf` (mdsSong.ts), used by both. Node lengths are now frames.
- arpTable (mtab) needs no resampling for songs whose `hz` is off-NTSC: sequence ticks already follow the song tick rate.
- New finding, virtual tempo: Furnace runs macros once per engine tick at `s.hz`. Virtual tempo only moves the row counter (playback.cpp tempoAccum, dispatch->tick once per nextTick). d0c1a5315 passed `rate` (hz * vtN / vtD) to psgEnvelope, so virtual-tempo songs were resampled wrongly. Both envelopes now get `s.hz`.
- Tests: mdsSong.test.ts "pitch macro rate" (56 Hz: 13-tick nodes play 14 frames; 60 Hz unchanged).

### Task 2: second off-NTSC song (newer_song_lol, hz 60, virtual tempo 180/150 = 72 Hz rows)

Fancy_Promenard (58 Hz) gives identical bytes before/after d0c1a5315 (no PSG volume or pitch macros on PSG). Plok_Beach does not convert (system bd), darkstar does not open in Furnace 0.6.8.3. So the measure used newer_song_lol. loud.py, 4 s windows, 0-40 s, MAME vs Furnace:

- PSG4 before d0c1a5315: -0.04 -0.04 -0.02 -0.03 -0.01 -0.02 -0.03 -0.00 -0.01 -0.03.
- PSG4 at d0c1a5315: -1.10 -1.10 -0.30 -0.67 -0.67 -0.66 -0.68 -0.31 -0.66 -0.70 (regression, noise envelope resampled to 72 Hz).
- PSG4 after 1y (`s.hz`): same as before (bytes identical to pre-d0c1a5315).
- PSG2 at d0c1a5315 drifted by up to 0.1 dB, back to before after 1y. PSG1, FM1-5 unchanged in all three (pre-existing FM2 -0.91 window 2, FM3 -0.76 last window).
- Solar_Man (hz 56, no virtual tempo): bytes identical to d0c1a5315, so the 1x PSG4 numbers stand.
- Listen ROM: ~/Desktop/md-roms/newer_song_lol-1y.bin.

### Open items

- Arp mtab on virtual-tempo songs: the driver steps it per sequence tick (72 Hz on newer_song_lol), Furnace per engine tick (60 Hz). It runs 20% fast. Not fixed, not flagged as lossy yet. Same check is due for other per-tick effects (vibrato, porta), which also count sequence ticks.
- Task 3 (Solar_Man PSG4 -0.15 dB residual) not started; budget.
- No unit test for the `s.hz` vs `rate` choice in insRef; no song with an off-NTSC pitch macro measured (pitch fix tested at unit level only).

## Phase 1z results (2026-11-21)

Commit 2669fd49e (src/lib/export/md/mdsSong.ts, src/lib/export/__tests__/mdsSong.test.ts).

Root cause: Furnace 0.6.8.3 runs macros and per-tick effects once per engine tick at `s.hz`. Virtual tempo only moves the row counter (playback.cpp tempoAccum). The export set the MDSDRV sequence tick rate to `hz * vt / vtD`. It also stepped the arp mtab (EB), vibrato phase, porta slides and volume slides per sequence tick. A 180/150 song therefore ran them 20% fast: the arp ran at 72 Hz instead of 60 Hz on newer_song_lol.

Fix:
- `fpt = s.hz / rate` is Furnace ticks per sequence tick (1 without virtual tempo, 5/6 at 180/150). `fpf = tpf * fpt` is Furnace ticks per frame.
- `arpTable(..., spt)` spaces the holds by `1 / fpt` on a running total. The total restarts each loop pass.
- Vibrato (vibCmd, vSync phase) and porta (pslideCmd, portaEnvelope, the 01xx integrality check) use `fpf`/`fpt`.
- Volume slides step through a Furnace-tick accumulator.
- Without virtual tempo `fpt` is exactly 1, so those exports are byte-identical.

Test rows (describe 'virtual tempo'):
- Solar_Man at 180/150 keeps the PSG envelope bytes resampled from s.hz (56 Hz).
- arpTable holds follow `spt`.

newer_song_lol, 0-40 s. lagcmp frames over 10 cents, before (1y, HEAD 7c9e0f09f) -> after:
- FM1: 456 -> 511
- FM2: 416 -> 437
- FM3: 508 -> 504
- FM4: 403 -> 415
- FM5: 685 -> 343
- PSG1: 940 -> 793
- PSG2: 1353 -> 1235
- First 4 s windows: FM5 window 0 goes 101 -> 0, PSG1 window 1 goes 81 -> 12, PSG2 window 1 goes 85 -> 19.

loud.py (4 s windows, dB MAME minus Furnace), 1y -> 1z:
- PSG4: -1.10/-1.10/-0.30/-0.67/-0.67/-0.66/-0.68/-0.31/-0.66/-0.70 -> -0.04/-0.04/-0.02/-0.03/-0.01/-0.02/-0.02/-0.00/-0.01/-0.03
- PSG2: windows 3-10 go from up to 0.10 dB to at most 0.03 dB.
- PSG1 window 1-2: +0.01/+0.03 -> -0.00/-0.01.
- FM1-FM5 are unchanged. FM6/DAC ±89 is the same as in 1y: the DAC is tapped on the FM6 row, so this is a measurement artefact.

Open:
- The vibrato period now matches Furnace (16 frames on FM1, was about 13). FM1's vibrato start phase is still about 4-5 frames off at a new note (frame 75 onward). The FM1 count rising 456 -> 511 comes from this. Suspects: the vSync rounding `Math.round((t - vAt) * fpt)`, `vAt = tick + delay` counted in sequence ticks, and the `off(Math.round(n * tpf))` phase in vibratoEnvelope.
- The EDxx/ECxx delay and cut effects still count sequence ticks under virtual tempo. They are not converted to Furnace ticks.
- Tempo quantisation drift: 154/128*60 = 72.19 Hz vs 72 Hz. It is flagged lossy. Key timing on 72 Hz rows is quantised to NTSC frames. That causes the large errors common to all channels (worst 874 cents at 21.433 s).
- Task 3 is not started: the Solar_Man PSG4 -0.15 dB residual (the first 3-frame node is sometimes 2 frames; key-on vs envelope phase).
- Listen ROM: ~/Desktop/md-roms/newer_song_lol-1z.bin.

## Phase 2a results (2026-11-21)

Root causes fixed in `src/lib/export/md/mdsSong.ts`:

1. **Vibrato phase reset on 03xx notes.** In Furnace `playback.cpp`, a note with 03xx (or E-shorthand porta) on a channel that is still keyed on sets `doNote = false`. The vibrato position is reset only when `doNote` is true, so the phase carries over the slur. The exporter reset `vPos` on every note. newer_song_lol FM1 rows 2 and 15 are `note + 03 44` after `04 44` on row 1. Fix: `portaSlur = portaXx > 0 && sounding` skips the reset.
2. **Vibrato phase counted in sequence ticks, not engine ticks.** Under virtual tempo, sequence tick t runs on Furnace tick `ceil(t * fpt)` (tempoAccum adds N per engine tick, the row counter drops per D). Phase now advances by `(fTick(t) - fTick(vAt)) * rate`, counted absolutely so carried phase does not drift.
3. **EDxx / ECxx counted sequence ticks.** Both count Furnace engine ticks at s.hz. They now map `fTick(row) + xx` back to the nearest sequence tick. ECxx is clamped to at least the delayed key-on + 1. Without virtual tempo fpt = 1, so those exports are unchanged.

Tests (`mdsSong.test.ts`): "EDxx/ECxx count Furnace engine ticks under virtual tempo" (180/150: ED 03 key-on at tick 4, EC 03 rest at tick 4) and "04xy: a 03xx note on a keyed-on channel keeps the vibrato phase" (expects the phase-8 envelope from row 2). Both fail with the fix disabled.

newer_song_lol, 0-40 s, lagcmp frames over 10 cents (1z -> 2a):

| Channel | 1z | 2a |
|---|---|---|
| FM1 | 511 | 61 |
| FM2 | 437 | 62 |
| FM3 | 504 | 61 |
| FM4 | 415 | 35 |
| FM5 | 343 | 42 |
| PSG1 | 793 | 414 |
| PSG2 | 1235 | 282 |

FM1 per 4 s window after fix: [8,6,9,8,0,21,0,1,1,7]. The 20-24 s residue is on every channel (tempo quantisation drift, 72.19 Hz MDSDRV timer). loud.py unchanged against 1z (FM equal, PSG4 -0.04..0.00 dB, FM6/DAC +-89 is the known artefact). Sequence grows 40752 -> 52866 bytes (more distinct vibrato envelopes). Listen ROM: `~/Desktop/md-roms/newer_song_lol-2a.bin`.

Open:
- PSG1/PSG2 residue (414 / 282 frames) not analysed.
- 20-24 s tempo drift shared by all channels.
- Unverified: PSG porta on a non-sounding channel still slides in the export; Furnace keys it on.
- Split of the gain between fix 1 and fix 2 not measured.
- Task 3 (Solar_Man PSG4 -0.15 dB) not started.
- EDxx/ECxx are not used in newer_song_lol; proof is the unit test only.

## Phase 2b results (2026-11-21)

### 1. newer_song_lol PSG residue: root cause found, not fixed

- Cause: 03xx portamento together with a running 04xy vibrato. MDSDRV has one pitch-envelope slot (E8), so the export writes the vibrato envelope and drops the linear slide (flagged lossy "04xy with a pitch slide or pitch macro (vibrato replaces it)", 1255 hits). Furnace moves baseFreq per tick (sms.cpp NOTE_PORTA) and adds the vibrato on top.
- Proof: PSG1 frames 675-678 (11.25 s): Furnace 750, 766, 787, 804, 816 Hz; MAME jumps to 834 Hz and shows only the vibrato. Same at frames 710-713. PSG1 has 106 x 03xx / 11 x 04xx, PSG2 638 x 03xx / 4 x 04xx.
- Tried: one combined extended envelope per (slide, vibrato phase) (`slideVibratoEnvelope`, porta nodes + vibrato offset, then loop the plain vibrato). Shape correct, but the song table goes 215 -> 355 items (ext 91 -> 333, subroutines 14 -> 0) and MDSDRV holds 256 (E8 argument is index+1 in one byte). Reverted; patch kept in session scratch only.
- Next design (not built): write the porta as per-tick E4 (transpose) + E6 (detune, 1/256 semitone) offsets in the sequence via the existing per-tick command path (addTick), and keep the plain shared vibrato E8 item. No new items. Must handle psgFix / effDtn interplay. Driver pitch = (t_note & 0xff00) + t_trs + dtn (mds_pitch_update).
- Numbers unchanged by this phase (lagcmp, frames over 10 cents in 40 s): FM1 61->63, FM2 62->64, FM3 61->63, FM4 35->35, FM5 42->43, PSG1 414->417, PSG2 282->284, PSG3 0->0. The +1..+3 also appear on FM channels that the 2b change cannot reach, so treat them as run-to-run lag noise (unverified).

### 2. PSG 03xx on a keyed-off channel: fixed

- Furnace playback.cpp 03xx: `if (chan[i].keyOn) doNote=false`, so on a keyed-off channel the note-on runs and sms.cpp NOTE_ON sets baseFreq to the target; NOTE_PORTA then has nothing to slide. The export required a sounding channel for FM only, so PSG slid from the last key after a note-off.
- Fix: `slide` needs `sounding` for PSG too (mdsSong.ts). Test row: "Fancy_Promenard PSG: 03xx after a note-off is a plain note-on" (puts an OFF before a PSG 03xx note and expects the same bytes as without the 03). Fails before the fix, passes after.
- Listen ROM: ~/Desktop/md-roms/newer_song_lol-2b.bin.

### 3. Sequence growth 40752 -> 52866 bytes: no cheap dedupe

- Equal slide envelopes are already shared (slideItems Map keyed on the bytes; extItem the same). The growth is distinct vibrato phases (91 extended envelopes) and fewer subroutines (14; subroutines are only added while items < 255). Nothing cheap left without changing playback.

### 4. Solar_Man PSG4 -0.15 dB: not started (budget).
