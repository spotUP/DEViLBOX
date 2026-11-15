---
date: 2026-11-15
author: spot (planning agent)
status: plan, not implemented
topic: Hardware ROM + in-app check. Every hardware exporter builds a runnable ROM/executable with an open driver and a playing screen; a WASM emulator inside DEViLBOX replays it to verify it
related: thoughts/spot/2026-11-14-overnight-ledger.md ("2026-11-15 owner decisions", "2026-11-15 queued"), src/lib/export/ChipExporter.ts, src/lib/export/dispatchRegCapture.ts, src/lib/export/VGMExporter.ts, tools/neogeo-compose/README.md, docs/FORMAT_STATUS_TRACKER.md
---

# Hardware ROM export + in-app check

## Goal

Owner decision 2026-11-15: each hardware exporter produces a file that boots on the real machine
(cartridge ROM, disk image or executable), plays the song through an **open-source driver**, and
shows a DEViLBOX player screen. A WASM emulator inside DEViLBOX boots the same file and checks that
it plays what the in-app render plays. All platforms are planned here; they are built one at a time,
**Mega Drive XGM2 first**.

Done for a platform = export button produces the file, the in-app check boots it and passes on the
platform's real-song fixtures, the owner hears it on real hardware or a reference desktop emulator.

## What exists today (read for this plan)

- `src/lib/export/ChipExporter.ts`: one entry point for register-log formats `vgm | zsm | sap |
  tiuna | gym | nsf | gbs | spc | s98 | sndh`. NSF/GBS/SPC embed a minimal *register-log replay*
  stub, not an open music driver and no screen. These are audio-rip formats, not ROMs.
- `src/lib/export/dispatchRegCapture.ts`: turns Furnace dispatch register writes into the
  `RegisterWrite` log `VGMExporter.ts` consumes. `VGMExporter.ts` already writes YM2612 (0x52/0x53)
  and SN76489 (0x50) with their clocks: this is the XGM2 input.
- `src/lib/export/ChipExportPanel.tsx` (format buttons at :307), `src/lib/export/nativeExportRouter.ts`
  (native/MCP export routing), `src/lib/export/__tests__/dispatchCaptureVgm.test.ts` (capture-to-VGM test to copy).
- Neo Geo reference path `.fur -> furtool -> nullsound`: `tools/neogeo-compose/` +
  `src/lib/export/neogeo/neoGeoCompose.ts`. DEViLBOX writes the `.fur` and lints it against what
  ngdevkit's `furtool.py` accepts; furtool and the ROM build run **outside** DEViLBOX today.
- WASM in repo that matters here: `game-music-emu-wasm` (GME: NSF/GBS/SPC/KSS/VGM/AY audio
  emulation, CPU + sound chip only, no video), `aylet-wasm` (.ay), `uade-wasm`/`nuade-wasm`,
  `musashi-host` (68k core + `amiga_host.c` / `eagle_runner.c`), `mame-wasm` / `mame-generic-wasm`
  (MAME **sound chips** only), `psgplay` (Atari ST). **No full console emulator (CPU + video +
  sound) is vendored for any platform.**
- Hand-built committed artifacts are guarded by `tools/mame-wasm-staleness.py` (source changed but
  artifact did not = fail). The player templates below reuse that pattern.
- Project licence: GPL-3.0-or-later (`package.json`, `LICENSE`). Every vendored emulator or driver
  must be GPL-3 compatible.
- Memory file `native_export_mcp.md` named in the brief does **not exist** in
  `~/.claude/projects/-Users-spot-Code-DEViLBOX/memory/` (MEMORY.md links it; dangling link).
- Song fixtures for MD: `public/data/songs/furnace/genesis/*.fur` (e.g. `Shovel_Knight_Title.fur`,
  `RaveOfDoom.fur`, `darkstar.fur`), `public/data/songs/vgm/`.

## Core architecture (all platforms)

```
song in DEViLBOX ──► driver data converter (TS, in browser) ──► driver data blob
                                                                   │
prebuilt player template (per platform, built offline from        ▼
 source in repo, committed artifact + layout.json) ───────► ROM assembler (TS): patch blob,
                                                             strings, subsong table, header,
                                                             checksum, padding
                                                                   │
                                                                   ▼
                                    downloadable ROM  +  in-app check (emulator WASM in a worker)
```

Key choice: **the export never runs a compiler**. Each platform has one player program (screen +
driver + joypad), compiled offline from source in the repo into a template binary with a reserved
data slot. Export = fill the slot. That keeps export in the browser (no server, no toolchain in
WASM). Only the **data converter** has to run in the browser; where the upstream converter is not
JS/C, it is ported to TypeScript with byte-exact golden tests against the upstream tool.

In-app check, two levels:
1. **Register check (the gate):** the emulator core logs sound-chip writes per video frame; the
   check compares them, frame by frame, with the DEViLBOX dispatch capture of the same song binned
   to frames (key-on/off, frequency, volume per channel). This is in memory, no WAV files (memory:
   no WAV testing), and it does not depend on two different FM cores matching sample for sample.
2. **Level check (secondary):** per-frame RMS per channel from the emulator audio vs the in-app
   render, correlation threshold. Catches silent DAC/PCM and wrong master volume.
Plus a **boot check:** the screen shows the song name (read back from VRAM/framebuffer text slot).

## Per-platform table

Licences checked 2026-11-15 with `gh api repos/<repo>` (SPDX) and licence-file heads. UNVERIFIED =
not confirmed from a licence file or repo file.

| Platform | Driver (licence, upstream) | Song source in DEViLBOX | Conversion path | ROM build toolchain | Emulator for in-app check | Playing screen |
|---|---|---|---|---|---|---|
| **Mega Drive** | XGM2 in SGDK (MIT, github.com/Stephane-D/SGDK, `tools/xgm2tool` is Java). Alternatives: Echo (Zlib, github.com/sikthehedgehog/Echo), MDSDRV (Zlib, github.com/superctr/MDSDRV) | Furnace Genesis `.fur` / any song on YM2612+SN76489 via dispatch capture; `.vgm` loads | dispatch capture -> `VGMExporter` VGM -> VGM->XGM2 (TS port of xgm2tool) | SGDK (m68k-elf-gcc + Java rescomp): offline only -> prebuilt template; export in browser | clownmdemu (AGPL-3.0, github.com/clownacy/clownmdemu, portable C core; WASM build of the core UNVERIFIED). Not vendored. Excluded: Genesis Plus GX and PicoDrive (non-commercial licences, GPL-incompatible). BlastEm GPL-3 UNVERIFIED (not on GitHub) | SGDK C, VDP tiles, 320x224 |
| **SMS / Game Gear** | PSGlib (BSD-3-Clause, github.com/sverx/PSGlib) | Furnace SMS/GG `.fur`, SN76489 capture | capture -> VGM -> PSGlib `vgm2psg` (C; compile to WASM or port to TS) | devkitSMS (SDCC) offline -> template | Gearsystem (GPL-3.0, github.com/drhelius/Gearsystem; WASM build UNVERIFIED). Not vendored. GME VGM = audio-only fallback (vendored) | devkitSMS C, 256x192 (GG 160x144 viewport) |
| **Game Boy** | hUGEDriver (github.com/SuperDisk/hUGEDriver; no licence file at repo root; licence UNVERIFIED, believed public domain) | Furnace Game Boy `.fur` | `.fur` -> hUGETracker `.uge` data (new TS converter; no upstream converter from .fur, UNVERIFIED) | RGBDS (MIT UNVERIFIED) or GBDK offline -> template | SameBoy (Expat/MIT per LICENSE, github.com/LIJI32/SameBoy) or Gearboy (GPL-3.0). Not vendored. GME GBS = audio-only fallback | RGBDS asm or GBDK C, 160x144, 4 shades |
| **NES** | FamiStudio sound engine (MIT, github.com/BleuBleu/FamiStudio) | Furnace NES `.fur` (2A03, expansions later) | `.fur` -> FamiStudio text/asm export format (new TS writer); FamiStudio's own exporter is C# (not in browser) | ca65 (cc65, zlib UNVERIFIED) offline -> template (NROM/UNROM) | Mesen2 (GPL-3.0, repo **archived** 2026) or another NES core UNVERIFIED; 8bitworkshop (GPL-3.0) ships browser NES/VCS emulators to evaluate. GME NSF = audio-only fallback | ca65 asm, 256x240 |
| **SNES** | Terrific Audio Driver (github.com/undisbeliever/terrific-audio-driver; LICENSE.md is mixed, exact licence UNVERIFIED) or SNESMOD (github.com/mukunda-/snesmod; licence UNVERIFIED, IT input) | Furnace SNES `.fur`; IT songs for SNESMOD | `.fur` -> TAD MML+samples (TS writer) / IT -> SNESMOD `smconv` (C; WASM) | ca65 or wla-65816 offline -> template | ares (ISC per LICENSE head, UNVERIFIED) / bsnes (GPL-3, UNVERIFIED). Snes9x excluded (non-commercial). GME SPC = audio-only fallback (vendored) | 65816 asm, 256x224 |
| **Atari 2600** | TIATracker player (repo URL UNVERIFIED: `Kylearan/tiatracker` 404) | Furnace TIA `.fur` | `.fur` -> TIATracker data (TS writer) | dasm offline -> template (4K/F8) | Stella (GPL-2.0, github.com/stella-emu/stella; GPL-2-only vs GPL-3 compatibility UNVERIFIED) or Javatari via 8bitworkshop (licence UNVERIFIED). Not vendored | 6502 asm racing the beam, see Player screen |
| **AY machines** (ZX Spectrum 128 / CPC / MSX) | Arkos Tracker 3 players (licence MIT UNVERIFIED, repo URL UNVERIFIED) | Furnace AY `.fur`, `.ay` / PT3 imports | `.fur` -> Arkos AKG/AKM data (TS writer, against Arkos's documented format) | sjasmplus / rasm offline -> template (.tap / .dsk / .rom) | Not vendored. `aylet-wasm` (vendored) and GME KSS/AY = audio-only fallback; full-machine core (Fuse GPL, CPCEC, openMSX) UNVERIFIED | Z80 asm, 256x192 (ZX attribute clash) |
| **Commander X16** | zsmkit (MIT, github.com/mooinglemur/zsmkit) | Furnace OPM+VERA `.fur`; `ZSMExporter.ts` exists | capture -> `ZSMExporter` ZSM (exists) | ca65 offline -> template `.PRG` (needs zsmkit + ROM in emulator) | x16-emulator (BSD-2-Clause, github.com/X16Community/x16-emulator; official web build exists UNVERIFIED; needs X16 ROM, licence of rom repo UNVERIFIED) | 65C02 asm/cc65 C, VERA 320x240 |
| **GBA / DS** | Maxmod (github.com/devkitPro/maxmod; licence ISC UNVERIFIED, no root licence file) | MOD/XM/S3M/IT songs (sample trackers) | module -> `mmutil` soundbank (C; compile to WASM) | devkitARM offline -> template | mGBA (MPL-2.0, github.com/mgba-emu/mgba; WASM port UNVERIFIED). DS: melonDS GPL-3 UNVERIFIED. Not vendored | C, GBA 240x160 / DS 256x192 x2 |
| **Neo Geo** | nullsound in ngdevkit (LGPL-3.0, github.com/dciabrin/ngdevkit) | Neo Geo `.fur` (YM2610 ext. FM), `neoGeoCompose.ts` | `.fur` -> `furtool.py` (Python; run in Pyodide, port to TS, or keep offline) -> nullsound data | ngdevkit (m68k gcc + sdcc) offline -> template | geolith (BSD-3-Clause, github.com/libretro/geolith-libretro) or MAME (GPL-2+); BIOS: open BIOS shipped by ngdevkit UNVERIFIED. Not vendored | C, fix layer + sprites, 320x224 |
| **Amiga** | Original EaglePlayer per format, run by UADE's `score.s` on bare metal (UADE 3.05: GPL-2 UAE parts + LGPL; per-player licences vary, most freeware without a licence: UNVERIFIED) | Every UADE format DEViLBOX loads (demo system allow-list: 164 keep / 7 drop of 171 players) | module verbatim + its eagleplayer hunk; arena sizes from `uade_stage.py` logic | vasm + vlink offline -> template exe = demo system's `uade_glue.s` + `score.s` (`UADE_NATIVE`) + screen; at export append player + module, write `uade_sizes` equates into a data hunk | vAmigaWeb (GPL-3.0, github.com/vAmigaWeb/vAmigaWeb) + AROS Kickstart replacement. Not vendored. UADE WASM (vendored) runs score in UAE, not an AmigaDOS exe: usable as audio reference, not as boot check | 68k asm, OCS lowres 320x256 PAL |

### Amiga detail (from /Users/spot/Code/UpRough/Up_Rough_Demo_System, read-only)

- `amiga/uade_glue.s` runs UADE's own sound core `score.s` on bare metal: "UADE's 68k emulator is
  redundant here: the replayers ARE Amiga code." score.s is `include`d at the bottom of the glue;
  the demo owns display, DMACON/INTENA and VBI `$6c`; score owns CIA vectors `$68`/`$78` (saved and
  restored); score's play loop runs as a coroutine once per VBlank.
- `amiga/vendor/uade-3.05/amigasrc/score/score.s`: every port edit is `ifd UADE_NATIVE` with a
  `*--- PORT:` comment so the upstream `-Fbin` build stays md5 `7876cd5b22aa1be827990ce3dbc5cfc5`
  (enforced by `tests/the_uade_score_port_edits_are_all_marked_test.py`).
- `tools/uade_stage.py` stages `current.uademod`, `current.uadeplayer` and `uade_sizes.i`.
  `UADE_MODULE_BYTES` and `UADE_RELOC_BYTES` are exact (file size; hunk sizes summed like
  `relocator.s`). `UADE_POOL_BYTES` / `UADE_ANY_BYTES` are **measured on device** by
  `amiga/uade_probe.s` high-water marks. For DEViLBOX this means the arena sizes must come from a
  probe run: the in-app emulator (or UADE WASM running the same score) can publish the same marks.
- `docs/superpowers/plans/2026-09-21-uade-musicdisk-engine.md`: target A1200/68020 `onefile`;
  `contplayer` (score.s:447) switches player + module at runtime, one arena sized as the max over
  the set: this is the subsong/next-song mechanism for the player screen.
- Lift path: copy (not link) glue + score port + stage logic into `hwplayer/amiga/` with
  attribution; the TS ROM assembler re-implements `uade_stage.py`'s exact-size math.

## Player screen

### Decided by the owner (2026-11-15)

- **One player program per native platform**, shared by every song format on that platform (not
  one per format). Same look on all platforms, scaled to each machine's limits.
- **Visualizer:** one volume bar per channel; bar height from the channel volume/envelope read
  from **driver state**.
- **Branding:** a small DEViLBOX logo in a corner only.
- **Controls:** play/pause, next/previous subsong on the joypad (keyboard/joystick where the
  machine has no pad).
- **Info:** song name, author, elapsed `MM:SS`, subsong number (`Song 2/5`), chip/platform name,
  and a scrolling text line built from the song comments/message.

### Shared layout spec (structure only; look is open, see decisions below)

Logical regions, mapped to each machine's tile grid: header (logo corner + platform/chip name),
info block (song name, author), status line (`Song n/m`, `MM:SS`, play/pause state), bar field
(N channel bars), scroller line. All text upper-case ASCII 0x20-0x5F from one 8x8 font; strings are
truncated to the platform's column count at export (ROM assembler, not on the machine).

### What each platform can render and what fits

| Platform | Resolution / colours | Sprite / tile budget | Fits | Cut or reduced |
|---|---|---|---|---|
| Mega Drive | 320x224, 61 of 512 (4 palettes x 16) | 80 sprites (20/line), 2 tile planes, ~1400 tiles free | all items, 10 bars (6 FM + 4 PSG), scroller on plane | nothing |
| SMS | 256x192, 32 of 64 | 64 sprites (8/line), 448 tiles | all, 4 bars | logo smaller |
| Game Gear | 160x144 viewport, 32 of 4096 | as SMS | 4 bars, name/author/status, scroller | author and platform name share one line; logo minimal |
| Game Boy (DMG) | 160x144, 4 shades | 40 sprites (10/line), 384 tiles shared BG/OBJ, 20x18 text cells | 4 bars, name, status, scroller (20 columns) | author on alternating line with name or dropped; logo as 2x2 tiles; bars as tiles not sprites |
| NES | 256x240 (~224 visible), 25 of 54 | 64 sprites (8/line), 256 BG tiles in CHR | all, 5 bars (+expansion channels) | colour per 16x16 attribute area limits bar colours |
| SNES | 256x224, 256 of 32768 | 128 sprites, 4 BG layers | all, 8 bars | nothing |
| Atari 2600 | 160x192 NTSC, 128 colours, no frame buffer | 2 players (8 px), 2 missiles, ball, 40-bit playfield per line; 128 bytes RAM shared with driver; CPU races the beam | logo, 2 bars (2 TIA channels), `MM:SS`, `Song n/m` via 6-digit kernel | **scroller dropped**, name/author as one short line or dropped (text kernel costs ROM + cycles), platform name dropped |
| ZX Spectrum 128 | 256x192, 15 colours, 8x8 attribute clash | no sprites, 6 KB bitmap | all, 3 bars (+ noise), scroller | colour per 8x8 cell only |
| CPC | 320x200 mode 1, 4 of 27 | no sprites | all, 3 bars | 4 colours |
| MSX1 | 256x192, 15 colours (TMS9918) | 32 sprites (4/line), 768 name cells | all, 3 bars | colour per 8x1 pattern line |
| Commander X16 | 640x480 / 320x240, 256 of 4096 | 128 sprites, 2 layers | all, 8 FM + 16 PSG + PCM bars | nothing (bars may group the 16 PSG voices) |
| GBA | 240x160, 15-bit | 128 sprites, 4 BG | all, bars per Maxmod channel (up to 32; grouped) | nothing |
| DS | 2 x 256x192 | per screen as GBA | info top, bars bottom | nothing |
| Neo Geo | 320x224, 4096 of 65536 | 381 sprites (96/line), fix layer 40x32 text | all, 13 bars (4 FM, 3 SSG, 6 ADPCM-A grouped, ADPCM-B) | nothing |
| Amiga OCS | 320x256 PAL lowres, 32 of 4096 | 8 sprites, copper, blitter | all, 4 bars | nothing; must not touch audio interrupts (score owns CIA) |

### How the visualizer gets its data, per driver

Most sound chips are write-only (YM2612, SN76489, AY, TIA, Paula AUDxVOL), so bars cannot read
the chip. Each player reads the driver's own state, at a fixed address the template's
`layout.json` records:

| Driver | Source for bar height | Status |
|---|---|---|
| XGM2 | Z80 RAM channel state of the XGM2 driver (per-channel volume / key state) via 68k bus request, or the 68k-side XGM2 API if it exposes levels | exact offsets UNVERIFIED, read SGDK `src/snd/xgm2` in phase 3 |
| PSGlib | PSGlib attenuation shadow variables (it keeps per-channel volume in RAM for fades) | UNVERIFIED |
| hUGEDriver | per-channel note/volume state in driver RAM | UNVERIFIED |
| FamiStudio engine | `famistudio_chn_volume_track` style per-channel arrays | names UNVERIFIED |
| Terrific / SNESMOD | SPC700 RAM, read by the S-CPU through APU ports (needs a driver-side report or port protocol) | UNVERIFIED; may need a small driver patch |
| TIATracker | player RAM volume vars (AUDV0/1 shadow) | UNVERIFIED |
| Arkos AKG | player keeps per-channel volume before writing AY regs | UNVERIFIED |
| zsmkit | zsmkit exposes channel state / the player shadows VERA PSG + YM writes | UNVERIFIED |
| Maxmod | `mmGetChannel...`/module channel structs in RAM | UNVERIFIED |
| nullsound | per-channel state in Z80 RAM, reached through the 68k-Z80 command port | UNVERIFIED |
| EaglePlayer (Amiga) | no common API; options: DeliTracker `EP_Voices`/`DTP_Volume` hooks where a player has them, else a PORT'd score shim that shadows AUDxVOL writes (players write custom regs directly) | open, see decisions |

### Code sharing

One player source per CPU family where the platforms allow it:
- **68k:** Mega Drive (SGDK C), Neo Geo (ngdevkit C), Amiga (asm, score coroutine). Shared C module
  for text formatting (`MM:SS`, `Song n/m`, truncation, scroller state) between MD and Neo Geo.
- **Z80:** SMS/GG (devkitSMS C), ZX/CPC/MSX (asm). Shared asm for timer/scroller logic.
- **6502 family:** NES, 2600, X16. Shared ca65 macros for timer and subsong state; 2600 is its own
  kernel.
- **SM83:** Game Boy alone. **65816:** SNES alone. **ARM:** GBA/DS share C.
- **One source of truth for assets and layout:** a TS build tool (`tools/hwplayer/assets.ts`)
  converts the DEViLBOX logo, the 8x8 font and the layout grid into each platform's tile format.
  Players never hand-draw the logo.

### Player-screen design decisions left open for the owner

1. Layout per screen class (wide 320 px, square 256 px, small 160 px, 2600): where logo, info,
   bars and scroller sit.
2. Palette / theme: DEViLBOX app colours mapped per machine vs one fixed retro palette.
3. Font: one 8x8 DEViLBOX font everywhere vs each machine's native-looking font.
4. Logo art at small sizes (GB 16x16, 2600 8 px wide player graphic).
5. Bar style: solid vs segmented (LED), peak hold or not, decay speed, colour by channel type.
6. Scroller speed and what it shows when the song has no comment (nothing / title + author repeat).
7. Joypad mapping per machine (which button is play/pause, which is next/previous), and the 2600
   mapping (joystick left/right + fire).
8. Grouping rule when channels exceed the bar budget (X16, GBA, Neo Geo ADPCM-A).
9. PAL/NTSC: one ROM that detects, or a choice at export.

## Mega Drive XGM: phases

Owner decision 2026-11-15: the original SGDK XGM Z80 driver plus SGDK's C `xgmtool` (VGM to XGM),
built to WASM with Emscripten. XGM2 is dropped (its tool is Java). No converter or player is ever
ported to TypeScript. No in-app emulator and no in-app check. All build commands run through
`~/.claude/bin/buildq`. Tests at 2 workers, `nice -n 19`, affected files only.

### P0: vendor and licences (started 2026-11-15)
- Vendored under `third-party/sgdk-xgm/` (uncommitted until the owner approves): `LICENSE`,
  `SOURCE.txt`, `tools/xgmtool/` (CMakeLists, inc, src), `src/snd/drv_xgm.s80`. Upstream is
  Stephane-D/SGDK at commit 2a8ddf55046c2f6a58b0586da13d1f6d87b8db50.
- Licence: the repo-wide `license.txt` is MIT (GitHub API reports MIT too). The xgmtool and driver
  files carry no licence header of their own, so MIT applies by the repo licence; this is a
  reading of the repo, not a separate grant. `lz77.c/.h` in xgmtool are from hwzip, public domain.
  The exported ROM must carry the MIT notice for the driver.
- The driver source needs the sjasm assembler (`tools/sjasm` in SGDK, own LICENSE.txt, not yet
  read) to produce the Z80 binary. Decide in P3 whether to vendor sjasm or commit the assembled
  binary; read sjasm's licence first.
- Accept: licence notice added to the project's third-party notice list, no build yet.

### P1: build xgmtool to WASM
- New `xgmtool-wasm/` (CMakeLists or `build.sh` like other `*-wasm/` dirs) compiling the vendored C
  with Emscripten as a callable module (VGM bytes in, XGM bytes out; no file system beyond the
  in-memory one). Output `public/xgmtool/xgmtool.wasm` plus loader.
- Native check first: the upstream CMake builds `xgmtool` on the host (see report: UNVERIFIED until
  buildq returns). Use the native binary only as the golden generator.
- Test `src/lib/export/xgm/__tests__/xgmtoolWasm.test.ts`: WASM output byte-identical to the
  native binary on the golden VGMs. Add a staleness guard (same pattern as
  `tools/mame-wasm-staleness.py`) so edits to the vendored source without a new artifact fail.
- Accept: byte-exact against native on all goldens; type-check clean.

### P2: VGM input that xgmtool accepts
- Input is our existing VGM export (`src/lib/export/VGMExporter.ts`, `dispatchRegCapture.ts`).
  YM2612 and SN76489 only, DAC data as the form xgmtool reads, loop point set, frame-aligned waits.
- Test `src/lib/export/__tests__/vgmForXgm.test.ts`: the three genesis `.fur` fixtures export to
  VGM and convert with the P1 module without warnings.
- Accept: three fixtures convert; goldens committed beside the test.

### P3: player template ROM
- New `hwplayer/megadrive/` (SGDK C): initialises the XGM driver, plays the XGM blob, joypad
  controls, and the player screen exactly as specified in
  `thoughts/shared/plans/2026-11-15-hardware-player-ui-design.md`, section "Owner answers
  2026-11-15" (title, author, timer, subsong, scroller, bars).
- Bars: a per-frame level table computed at export time from the VGM register log (volume
  registers only), stored as a data slot in the ROM; the screen reads one row per frame.
  The converter that builds this table is C or Rust built to WASM, not TypeScript.
- Fixed data slots (XGM blob, strings, level table, subsong table) described by `layout.json`.
  Artifacts `public/hwplayer/megadrive/player.bin` + `layout.json`; staleness guard as in P1.
- Accept: template with a hand-placed XGM blob boots in an external emulator (owner check).

### P4: ROM assembler
- New `src/lib/export/hwrom/megaDriveRom.ts` (byte placement only, no audio logic): template, XGM
  blobs per subsong, strings, level tables, subsong table, header fields, checksum at 0x18E, pad to
  power of two. Shared `romLayout.ts` reads `layout.json`.
- Test: checksum, size, slot overflow error, string truncation, subsong count.
- Accept: tests pass; oversize songs fail with a clear message, never a corrupt ROM.

### P5: wiring and acceptance
- `ChipExporter.ts` format `md-rom`; `ChipExportPanel.tsx` "Mega Drive ROM"; MCP `export_native`
  (or `export_hardware_rom`) returns the ROM; format tracker key `hwrom-megadrive`.
- Batch conversion over the genesis `.fur` set, resumable, verdicts in
  `test-data/hwrom-megadrive-check.json` (conversion and size only).
- Owner human test: ROM in an external emulator (BlastEm) or flash cart. PASS = boots, screen shows
  name, author, timer, bars, audio matches DEViLBOX playback by ear.

**XGM phase count: 6 (P0 to P5).**

## Order after Mega Drive (proposal, owner decides)

Neo Geo (driver path already in use) -> SMS/GG (shares SN76489 + Z80 work) -> Game Boy -> NES ->
X16 (ZSM exists) -> Amiga -> SNES -> AY machines -> GBA/DS -> Atari 2600.

## Open decisions for the owner

1. **XGM2 converter in the browser:** (a, recommended) port xgm2tool to TS with byte-exact goldens:
   no server, small, but must follow upstream changes; (b) compile the jar to JS (TeaVM/CheerpJ):
   no port work, large download, toolchain risk; (c) server endpoint with a JVM: easiest, breaks
   "runs in browser" and needs the server up.
2. **Player template build:** (a, recommended) prebuilt artifact committed with a staleness guard
   (mame-wasm pattern): export needs no toolchain; artifacts in git; (b) CI builds templates into
   the release: no binaries in git, local dev needs CI artifacts; (c) compile at export on a
   server: per-song code changes possible, needs server toolchains for 11 platforms.
3. **Mega Drive emulator:** (a, recommended) clownmdemu, AGPL-3.0, portable C: compatible with
   GPL-3 but AGPL source-offer duty on the hosted site; (b) BlastEm, GPL-3 (UNVERIFIED), accurate,
   not on GitHub, WASM port effort unknown; (c) MAME megadrive driver in WASM: GPL-2+, huge build.
4. **Pass criterion:** (a, recommended) register frames + level correlation + boot text: robust
   across FM cores; (b) level only: simpler, misses wrong notes at equal loudness; (c) sample
   compare: fails on core differences, conflicts with no-WAV testing.
5. **When the check fails:** (a, recommended) download still allowed with a visible warning and the
   first mismatch; (b) download blocked.
6. **Amiga EaglePlayer redistribution:** (a, recommended) ship only players whose licence allows it,
   others need the user's own UADE players dir: legally clean, fewer formats; (b) ship all 164 kept
   players as the demo system does: every format, licence risk; (c) Amiga export only for formats
   with an open-source replayer.
7. **Amiga in-app check:** (a, recommended) vAmigaWeb + AROS Kickstart: fully open, AROS
   compatibility with the score harness UNVERIFIED; (b) user-supplied Kickstart: best compatibility,
   extra setup; (c) no in-app boot check, UADE WASM audio reference + owner check on Amiberry.
8. **Amiga visualizer source:** (a, recommended) PORT'd score shim shadowing AUDxVOL writes (score
   already intercepts the player environment, edits gated `ifd UADE_NATIVE`); (b) bars only for
   players with DeliTracker voice hooks; (c) bars from Paula DMA sample peek.
9. **Neo Geo converter:** (a, recommended) run `furtool.py` under Pyodide in a worker: upstream
   tool unchanged, ~10 MB download; (b) port furtool to TS; (c) keep it offline (owner runs it).
10. **Neo Geo BIOS for the check:** (a, recommended) an open BIOS if ngdevkit ships one (UNVERIFIED);
    (b) user-supplied BIOS.
11. **Game Boy driver input:** (a, recommended) `.fur` -> `.uge` converter for hUGEDriver: open
    driver as decided, converter is new work; (b) keep the GBS register-log stub inside a ROM: no
    converter, but not an open music driver.
12. **SNES driver:** (a, recommended) Terrific Audio Driver for `.fur` songs (licence UNVERIFIED);
    (b) SNESMOD for IT songs: upstream converter, IT-only.
13. **AY target machine:** (a, recommended) ZX Spectrum 128 `.tap` first, CPC/MSX after; (b) all
    three at once; (c) MSX ROM first (cartridge like the others).
14. **2600 player:** (a, recommended) TIATracker player with a cut-down screen; (b) register-log
    player (no driver, 2600 RAM/ROM too small for long songs).
15. **Missing memory file:** `native_export_mcp.md` is linked from MEMORY.md but absent: recreate
    from `src/lib/export/nativeExportRouter.ts` or drop the link.

## Not covered / UNVERIFIED summary

Driver licences without a root licence file (hUGEDriver, SNESMOD, Maxmod, Terrific's mixed
LICENSE.md, TIATracker and Arkos repos not found), WASM builds of clownmdemu, Gearsystem, SameBoy,
mGBA, x16-emulator, driver-state addresses for every visualizer, Stella GPL-2-only compatibility,
ngdevkit open BIOS, AROS with score.

## Owner answers 2026-11-15 (override the recommendations above)

1. Converter: **no TypeScript port, ever.** Build the converter's own source to WASM. If xgm2tool is C (SGDK 2.x tools; UNVERIFIED), compile it with emscripten. If it is Java only, come back to the owner, do not port.
2. Templates: prebuilt per-platform player template committed, with a staleness guard (as recommended).
3. Emulator: **no in-app emulators.** Users test the ROM in their own emulator or on hardware. Drop Phase 5 (clownmdemu WASM) and Phase 6 (in-app check). Decisions 3, 4, 5 and 7 are void.
4. Checks: no in-app boot/register check. Verification lives in our own test suite (byte-exact converter goldens, template staleness guard) plus the owner's external-emulator test.
This replaces the earlier "Hardware ROM + in-app check" decision: it is now "Hardware ROM, checked in external emulators".

## Owner answers 2026-11-15 (after the replayer survey)

- Mega Drive driver: original SGDK XGM Z80 driver + C xgmtool (MIT), built to WASM, fed by the existing VGM export. XGM2 dropped (xgm2tool is Java). Bars come from a per-frame level table computed from the VGM register log. Phases P0-P4 resume on this basis. xgmtool licence file still to confirm.
- SNES driver: Terrific Audio Driver (driver zlib, compiler MIT, Rust compiler built to WASM).
- Player UI choices are in 2026-11-15-hardware-player-ui-design.md, "Owner answers 2026-11-15".
- Survey: 2026-11-15-hardware-replayer-survey.md.
- Owner 2026-11-15: Rust converters are fine. C/C++ converters will not exist for every platform, so cuts are accepted: take the best open driver per platform whatever its converter language, as long as it builds to WASM (C/C++/Rust native; Python via Pyodide). Java stays rejected.
- Decision 6 (Amiga EaglePlayer redistribution): ship all UADE players inside exported Amiga executables.
- Decision 8 (Amiga bar source): shadow every AUDxVOL write in the UADE score shim to a RAM table the screen reads.
- Decision 9 (Neo Geo): upstream furtool/nsstool/vromtool (Python) run unchanged through Pyodide. Owner answer was "its fine".
- Decision 10 (Neo Geo BIOS): void, no in-app emulator.
- Decision 11 (Game Boy): emit hUGEDriver song asm/C from our song model; assemble with RGBDS built to WASM. Two ROMs: DMG and GBC.
- Decision 13 (AY): Arkos Tracker 3 AKY player, ZX Spectrum 128 first; CPC and MSX reuse it later. Arkos licence still to verify.
- Decision 14 (Atari 2600): Furnace TIunA export + TIATracker player, GPL; exported ROM ships with GPL notice and source pointer.

## Order (owner, 2026-11-15)

Major platforms first, niche last. Niche covers ZSM/X16, GRUB, iPod and SAP-R-only targets.
