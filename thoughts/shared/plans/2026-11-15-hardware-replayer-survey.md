---
date: 2026-11-15
topic: hardware ROM export, driver/replayer survey per platform
status: research, owner decides
related: thoughts/shared/plans/2026-11-15-hardware-rom-export.md
---

# Hardware replayer survey (2026-11-15)

Method: GitHub API (languages/licence) until the unauthenticated rate limit hit (60/h), then raw LICENSE/README
files and web search. "V" = verified in this session (source named), "U" = UNVERIFIED (from memory or one
secondary source). Many licence fields from the API are blank because the licence is in a README line, not a
LICENSE file; where I read the text it is marked V.

## Summary: recommended driver per platform

| Platform | Driver | Converter / writer | Confidence |
|---|---|---|---|
| Mega Drive | XGM (original) Z80 driver + `xgmtool` (C, SGDK, MIT) fed by Furnace VGM export | xgmtool compiled to WASM; Furnace VGM already exported | medium (see verdict) |
| Mega Drive, tracker-native alternative | MDSDRV (68k+Z80, Zlib) | write MDS (documented `doc/mdsseq.md`) from our C layer; `mdslink` is C++ but GPL-2.0 | medium |
| Neo Geo | nullsound (Z80, LGPL-3.0 V) | furtool.py + nsstool.py are Python (V); no C option found | medium |
| Game Boy | hUGEDriver (RGBDS asm, public domain V) | song data is asm/C source; emit from our layer; `uge2source` C tool U | medium |
| SNES | Terrific Audio Driver (SPC700 asm zlib V) | compiler is Rust (V, MIT); MML in, so write MML | medium, Rust is an owner call |
| NES | FamiStudio sound engine (MIT repo V) or FamiTone2 | FamiStudio exporter is C# (V); FamiTone2 `text2data` C++ U | low |
| ZX Spectrum 128 / AY | Arkos Tracker 3 AKY player | C++ converters (`SongToAky`) U; input `.aks` XML | low |
| Atari 2600 | Furnace's own TIunA export (in tree V, GPL-2+) | C++ in Furnace; emits `export.asm` | medium |
| C64 SID | GoatTracker 2 player (GPL-2.0 V on forks) | C (`gt2reloc`, `sngs`) U | low |
| SMS / Game Gear | PSGlib (Z80, sverx) | U | low |
| PC Engine, MSX | not researched past naming; see sections | U | none |

## Mega Drive replacement for XGM2: verdict

- XGM2 driver is SGDK (MIT, V). Its converter `tools/xgm2tool` is Java (V: only `.classpath`, `.project`,
  `export.jardesc`, `src` in the directory). I found NO C port or C++ rewrite of xgm2tool (web search, one pass;
  absence not proven, U). Format spec is not documented outside the Java source (U).
- The original XGM converter `tools/xgmtool` is C/C++ with a CMake build (V: `CMakeLists.txt`, `inc`, `src`);
  the author says it was first Java and rewritten in C (secondary source, chipmusic.org). Standalone copy:
  andwn/xgm-standalone (U). It takes Mega Drive VGM and writes XGM, which is exactly what Furnace's VGM export
  gives us, so no new converter code. Compile to WASM from its own source.
- Verdict: replace XGM2 with original XGM + xgmtool. Cost: older format (fewer PCM channels, less 68k-friendly
  than XGM2, U on exact numbers). Gain: C source, no Java, no TypeScript port, register-level fidelity to
  whatever Furnace plays (macros and effects are already baked into the VGM).
- Volume bars: neither XGM nor XGM2 is known to expose per-channel volume in a fixed RAM block (U). Fallback that
  needs no driver RAM: the converter step also emits a per-frame level table computed from the VGM register
  log (key-on, TL/volume writes), shipped beside the song. Design option, not verified.
- Real alternative if bars from driver RAM are mandatory: MDSDRV (68k RAM about 1 KB, V from README), at the
  cost of translating Furnace patterns/macros to MDS, which is lossy for FM macros and exotic effects.

## Mega Drive / Genesis (YM2612 + SN76489)

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM channel state | Repo |
|---|---|---|---|---|---|---|
| XGM (orig) | Z80 asm (SGDK) | xgmtool C/C++ (V tree) | MIT (SGDK license.txt, V) | FM, PSG, 4-ch PCM U | not known U | github.com/Stephane-D/SGDK |
| XGM2 | Z80 asm (SGDK) | xgm2tool Java (V) | MIT V | FM, PSG, PCM | not known U | same |
| Echo | Z80 asm + 68k C API (repo lang C V) | mdtools (dmf2esf, mml2esf, midi2esf, echo2vgm dirs V); lang U | Zlib V (README + LICENSE text); mdtools U | FM, PSG, PCM (EWF) | in Z80 RAM, layout U | github.com/sikthehedgehog/Echo, /mdtools |
| MDSDRV | 68k asm + Z80 asm (C 30 KB + asm 25 KB V) | `mdslink` in ctrmml: C++ U, GPL-2.0 V | Zlib V (API); ctrmml GPL-2.0 V | FM, PSG, 2-3 ch PCM, FM3 special mode V | about 1 KB 68k RAM V | github.com/superctr/MDSDRV, /ctrmml |
| GEMS | Sega proprietary Z80 | closed | none known, U | FM, PSG, PCM | U | not on GitHub, not evaluated |
| vgm-player drivers (generic Z80 VGM stream) | various | none needed | varies U | all | no | not evaluated |
| Furnace upstream ROM export | none for Mega Drive: `src/engine/export` has only Amiga validation, TIunA, ZSM, SAP-R, iPod, GRUB (V, read from the vendored tree) | - | GPL-2+ V | - | - | tildearrow/furnace |
| DefleMask ROM export | closed driver U | closed | no | - | - | not evaluated |

Notes: Echo's ESF is a headerless command stream (V, segaretro.org) with specs in `doc/esf.txt`, `eif.txt`,
`ewf.txt` (V), simple enough to write from the C/WASM layer. Echo is Z80-only so the 68k stays free for the UI.
Echo needs Furnace instrument translation (EIF), so it loses macro behaviour like MDSDRV does.

RECOMMENDATION: XGM (original) + xgmtool via Furnace VGM; Echo second (simplest hand-written format); MDSDRV
only if driver-RAM volume bars outweigh fidelity. Check GPL-2.0 of ctrmml before shipping `mdslink` in the app.

## Neo Geo (YM2610)

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM state | Repo |
|---|---|---|---|---|---|---|
| nullsound | Z80 asm (SDCC) | `furtool.py`, `nsstool.py`, `vromtool.py`, `adpcmtool.py` all Python (V, ngdevkit/tools) | LGPL-3.0 (ngdevkit README badge, V) | FM, SSG, ADPCM-A/B (partial effects U) | U | github.com/dciabrin/ngdevkit |

No non-Python converter exists in ngdevkit (V directory listing). Options: Pyodide (planned), or reimplement the
NSS stream writer in C from `nsstool.py` (format documentation U).
RECOMMENDATION: nullsound; keep the converter as Pyodide, since rewriting nsstool.py by hand costs more than it saves.

## Game Boy

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM state | Repo |
|---|---|---|---|---|---|---|
| hUGEDriver | RGBDS asm (repo: asm 121 KB, C 73 KB V) | hUGETracker (Pascal V) exports asm/C song data; `uge2source` C U | public domain (README line, V) | 4 DMG channels | driver RAM variables U | github.com/SuperDisk/hUGEDriver |
| GBT Player | asm + C (V) | `mod2gbt` U | MIT V | 4 ch, MOD-based | U | github.com/AntonioND/gbt-player |
| Carillon | not found by name (U) | - | - | - | - | - |

RECOMMENDATION: hUGEDriver, because the song descriptor is plain asm/C data we can emit; Furnace wave and
duty macros map lossily to hUGE instruments.

## SNES

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM state | Repo |
|---|---|---|---|---|---|---|
| Terrific Audio Driver | SPC700 asm | Rust compiler + GUI (V, Rust 2.4 MB) | driver zlib, compiler MIT, emu ISC (V, LICENSE.md) | 8 ch BRR, echo, ADSR/GAIN | U | github.com/undisbeliever/terrific-audio-driver |
| SNESMOD | asm | C++ `smconv` + Go (V languages); input IT/S3M/XM U | none shown by API (U) | BRR | U | github.com/mukunda-/snesmod |
| SNES GSS | not checked (U) | | | | | |

Rust compiles to WASM from its own source; that fits the "own source" rule but not "C/C++" — owner call.
Furnace route: Furnace SNES sample + pattern data to TAD MML.
RECOMMENDATION: Terrific Audio Driver, pending the Rust decision.

## NES

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM state | Repo |
|---|---|---|---|---|---|---|
| FamiStudio sound engine | 6502 asm (ca65, asm6, nesasm, sdas) V | C# exporter (V repo is C# 4.1 MB) | MIT (repo, V) | 2A03, VRC6/VRC7/FDS/MMC5/N163/S5B U | U | github.com/BleuBleu/FamiStudio |
| FamiTone2/5 | 6502 asm | `text2data`, `nsf2data` C++ U | forks show NOASSERTION; original terms U | 2A03 | U | nesdoug/famitone2d etc. |
| GGSound | 6502 asm (V) | U | Unlicense (V) | 2A03 | U | github.com/gradualgames/ggsound |

RECOMMENDATION: FamiStudio sound engine if its binary format is documented enough to write from C (U); else FamiTone2.

## ZX Spectrum 128 / AY

| Driver | Driver lang | Converter lang | Licence V? | Chips | RAM state | Repo |
|---|---|---|---|---|---|---|
| Arkos Tracker 3 players (AKY/AKG/AKM) | Z80 asm | SongToAky etc. C++ U | U | AY-3-8910 | U | Julien Nevo / Arkos Tracker (repo not located) |
| Vortex Tracker PT3 | Z80 asm (many copies) | PT3 binary is documented U | U | AY | U | not located |

RECOMMENDATION: AKY player (register-stream style, high fidelity to Furnace AY output). All details U.

## Atari 2600

- Furnace itself ships a TIunA exporter (`src/engine/export/tiuna.cpp`, 612-line area pushes `export.asm`, V),
  GPL-2+ (V header). Whether the 6502 player routine is included beyond the data is U. TIATracker (player
  asm, GPL-3.0 on chunkypixel fork V, GPL-2.0 on others V) is the player TIunA targets (U).
- GPL on the player means shipped ROMs carry GPL source obligations. Flag for the owner.

RECOMMENDATION: use Furnace's TIunA export plus the TIATracker player, after reading the player licence terms.

## C64 SID

GoatTracker 2 (C, GPL-2.0, V on forks). Players are 6502 asm built by `gt2reloc` (U). Furnace has no PSID export
(V: not in exporter list), so a register-dump player is the fidelity alternative. RECOMMENDATION: GoatTracker 2 player, U.

## PC Engine, MSX, SMS / Game Gear (names only, all U)

- SMS/GG: PSGlib (sverx, Z80, SN76489). 
- MSX: no candidate verified.
- PC Engine: no candidate verified.

## Open items (not done in this survey)

- GitHub API limit hit after about 25 calls; raw files were used afterwards. Not checked: xgmtool licence file, Echo
  mdtools licences, PT3/AT3 licences, FamiTone2 original licence, SNES GSS, Carillon, PSGlib, MSX/PCE drivers.
- No driver was checked for per-channel RAM layout (column 6 is U throughout except MDSDRV).
- Nothing downloaded; no scratch to delete.

## Furnace's own export targets (checked 2026-11-15, vendored master, engine 258)

Furnace ships no native player code. Its ROM exporters (`src/engine/export/`) emit data for drivers that live outside Furnace:

- `tiuna.cpp`: Atari 2600 TIA, writes `export.asm` data for the external TIunA driver.
- `zsm.cpp`: Commander X16 ZSM stream, played on the machine by an external player (ZSMKit or similar).
- `sapr.cpp`: Atari 8-bit SAP-R, a raw POKEY register dump per frame, played by the standard SAP player stub.
- `grub.cpp`, `ipod.cpp`: GRUB `play` beeper tune and iPod beeper format; novelty targets.
- `amigaValidation.cpp`: register log for Amiga verification, not a player.

DEViLBOX already lists ZSM and TIunA in `src/hooks/dialogs/useExportDialog.ts`. Use: for the 2600 and Atari 8-bit rows, take the Furnace exporter as the converter and vendor the matching external driver (licence check first) instead of writing a new one. SAP-R is a register dump, so it is large and has no editability; it is a fallback for Atari 8-bit only.
