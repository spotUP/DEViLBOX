---
date: 2026-02-27
topic: uade-format-reverse-engineering-progress
tags: [uade, amiga, reverse-engineering, progress, living-document]
status: draft
---

# UADE Format Reverse-Engineering Progress

> **Living document** — updated as work proceeds. Multiple agents can work on formats in parallel.
>
> **Handover/onboarding:** See [`docs/uade-re-handover.md`](uade-re-handover.md) for the full process.

---

## How to Claim a Format

Each format entry has a `Status` field. To claim one for implementation:

1. Change the status from `not-started` → `claimed by <agent-id> YYYY-MM-DD`
2. Work through the pipeline steps (see handover doc)
3. Update status at each milestone: `analyzing` → `wasm-synth` → `parser` → `ui` → `complete`
4. Fill in the "Findings" section as you go

**Status values:**
| Status | Meaning |
|--------|---------|
| `not-started` | Available to claim |
| `claimed by <id> YYYY-MM-DD` | Agent actively working on it |
| `analyzing` | Binary analysis in progress |
| `wasm-synth` | WASM synth being built |
| `parser` | TypeScript parser being written |
| `ui` | UI editor being built |
| `complete` | Fully implemented — no UADE needed |
| `blocked: <reason>` | Stuck, needs help |
| `deferred: <reason>` | Skipped for now (too complex, too few files) |

---

## Coverage Summary (as of 2026-02-27)

From `scripts/uade-audit.ts`:

| Status | Extensions |
|--------|-----------|
| ✅ FULLY_NATIVE (WASM synth) | 39 |
| 🎵 NATIVE_SAMPLER (PCM, no UADE) | 14 |
| 🔍 DETECTION_ONLY (parser, UADE synth) | 16 |
| 🎮 UADE_ONLY (no native parser) | 282 |
| **Total** | **351** |

**Already complete (WASM synths exist):**
SoundMon, SidMon1/2, DigitalMugician, FutureComposer, Fred, TFMX,
HippelCoSo, RobHubbard, OctaMED, DavidWhittaker, Symphonie, HivelyTracker (ahx/hvl excluded from UADE).

---

## Format Priority Table

Sorted by reference file count (from `scripts/count-ref-files.ts`, 2026-02-27).
Only includes UADE_ONLY and DETECTION_ONLY formats (native targets).

| Rank | Format | Ext(s) | Ref Files | Player Size | Current Status |
|------|--------|--------|-----------|-------------|----------------|
| 1 | [SonixMusicDriver](#1-sonixmusicdriver) | smus, snx, tiny | 8817 | 16.1 KB (large) | `not-started` |
| 2 | [MusiclineEditor](#2-musiclineeditor) | ml | 818 | 88.8 KB (very large) | `not-started` |
| 3 | [DelitrackerCustom](#3-delitrackerCustom) | cus, cust, custom | 749 | (generic) | `deferred: format-specific custom players, not one format` |
| 4 | [ArtOfNoise](#4-artofnoise) | aon, aon4, aon8 | 212 | 8.5 KB (medium) | `complete` |
| 5 | [RichardJoseph](#5-richardjoseph) | rjp, rj | 154 | 5.5 KB (medium) | `not-started` |
| 6 | [HisMastersNoise](#6-hismastersnoise) | hn, mtp2, thn, arp | 104 | — | `not-started` |
| 7 | [JochenHippel](#7-jochenhippel) | hip, mcmd, sog | 64 | 3.2 KB (small) | `deferred: TFMX-ST macro-synth` |
| 8 | [JasonPage](#8-jasonpage) | jpn, jpnd, jp | 64 | 13.1 KB (medium) | `not-started` |
| 9 | [DaveLowe](#9-davelowe) | dl, dl_deli, dln | 46 | 2.8 KB (small) | `not-started` |
| 10 | [BenDaglish](#10-bendaglish) | bd, bds | 45 | 2.8 KB (small) | `not-started` |
| 11 | [ManiacsOfNoise](#11-maniacsofnoise) | mon | 29 | 1.3 KB (small) | `deferred: macro-synth` |
| 12 | [WallyBeben](#12-wallybeben) | wb | 24 | 2.9 KB (small) | `not-started` |
| 13 | [JasonBrooke](#13-jasonbrooke) | jcb, jcbo, jb | 18 | — | `not-started` |
| 14 | [JeroenTel](#14-jeroentel) | jt, mon_old | 9 | 3.4 KB (small) | `not-started` |
| 15 | [MarkCooksey](#15-markcooksey) | mc, mcr, mco | 9 | 4.3 KB (medium) | `not-started` |

> **Note:** Delitracker Custom (#3) is deferred — it's a container format where each song
> uses its own custom player. Not a single format to implement.

---

## Per-Format Deep Dives

---

### 1. SonixMusicDriver

| Field | Value |
|-------|-------|
| Extensions | `smus`, `snx`, `tiny` |
| Reference files | 8817 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/SonixMusicDriver` (16.1 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** IFF-based music format used in many AMOS and professional Amiga games.
Uses the IFF SMUS (Simple Music Score) standard + custom extensions.

**Binary analysis findings:**
_(Fill in after running binary-inspector.ts)_

**Instrument structure:**
_(Fill in after binary analysis)_

**WASM synth notes:**
_(Fill in after analysis)_

**Reference sources:**
- `Reference Code/uade-3.05/players/SonixMusicDriver` (disassemble for data structures)
- IFF SMUS specification (public domain)

**Implementation steps:**
- [ ] Binary analysis: `npx tsx scripts/binary-inspector.ts "Reference Music/IFF-SMUS/..."  --all`
- [ ] Instrument struct layout mapped
- [ ] TypeScript parser written (extends UADEParser or new SonixParser.ts)
- [ ] WASM synth built (`sonix-wasm/`)
- [ ] AudioWorklet written
- [ ] TypeScript engine class (`SonixSynth.ts`)
- [ ] UI controls (`SonixControls.tsx`)
- [ ] Wired up in ToneEngine + InstrumentFactory
- [ ] Parser tests pass
- [ ] Manual verification: real instrument names show, sound plays

---

### 2. MusiclineEditor

| Field | Value |
|-------|-------|
| Extensions | `ml` |
| Reference files | 818 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/MusiclineEditor` (88.8 KB — very large!) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Amiga tracker format used in many games. Very large eagleplayer suggests
complex wavetable synthesis or extensive instrument data tables.

**Binary analysis findings:**
_(Fill in)_

**Notes:** Player is 88.8 KB which is unusually large. Likely has built-in wavetable data.
May be complex to reimplement. Consider analyzing the player binary first to understand scope.

**Reference sources:**
- `Reference Code/uade-3.05/players/MusiclineEditor`
- Search for Musicline Editor / Musicline Editor III documentation

**Implementation steps:**
- [ ] Binary analysis on both the player binary AND a reference music file
- [ ] Determine if built-in wavetable is extractable from player binary
- [ ] Instrument struct layout
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 3. DelitrackerCustom

| Field | Value |
|-------|-------|
| Extensions | `cus`, `cust`, `custom` |
| Reference files | 749 |
| **Status** | `deferred: each file uses its own embedded custom player, not a single format` |
| Claimed by | — |

**What it is:** Delitracker "custom" format — the player binary is embedded IN the file itself.
Each `.cus` file is a standalone 68k executable containing both song data and replay routine.
There is no single format to implement; each song has a unique player.

**Notes:** Could potentially be handled by running the 68k executable in a sandboxed emulator,
but this is much more complex than a standard format implementation. Defer indefinitely.

---

### 4. ArtOfNoise

| Field | Value |
|-------|-------|
| Extensions | `aon`, `aon4`, `aon8` |
| Reference files | 212 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/ArtOfNoise-4V` (8.5 KB) |
| **Status** | `complete` |
| Claimed by | Claude Sonnet 4.6 (2026-02-27) |

**What it is:** Art Of Noise tracker by Bastian Spiegel (Twice/Lego). IFF-like chunk-based format
supporting 4-voice (AON4) and 8-voice (AON8) variants. Instruments are PCM samples stored
in WAVE chunk, with loop points and envelope data. Full pattern/sequence data parsed.

**Format reference:** `docs/formats/ArtOfNoise.md` — comprehensive chunk-by-chunk spec.

**Implementation:**
- `src/lib/import/formats/ArtOfNoiseParser.ts` — full parser (NostalgicPlayer reference)
- Wired up in `src/lib/import/parseModuleToSong.ts` (`prefs.artOfNoise === 'native'`)
- PCM instruments extracted via `createSamplerInstrument()` (uses existing Sampler engine)
- 7 tests passing (`src/lib/import/__tests__/ArtOfNoiseParser.test.ts`)

**Implementation steps:**
- [x] Binary analysis — full chunk map documented in `docs/formats/ArtOfNoise.md`
- [x] Format spec — AON4/AON8, 16 chunk types, instrument struct (32 bytes), WLEN/WAVE
- [x] TypeScript parser with period table (NostalgicPlayer reference)
- [x] Sampler instruments (no custom WASM synth needed — PCM playback via Sampler)
- [x] Tests + verified with Twice/ composer reference files

---

### 5. RichardJoseph

| Field | Value |
|-------|-------|
| Extensions | `rjp` (detect_format_by_content), `rj` |
| Reference files | 154 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/RichardJoseph_Player` (5.5 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Richard Joseph's Amiga music format. Used in many Sensible Software games
(Sensible Soccer, Cannon Fodder, etc.). One of the most iconic Amiga composers.
The `rjp` variant uses content-based detection (magic bytes).

**Notes:** `rjp` already has a PARTIAL native parser (`RJPParser`) in parseModuleToSong.ts
behind the `prefs.rjp === 'native'` flag. Investigate what it already does before starting.

**Binary analysis findings:**
_(Fill in)_

**First steps:**
1. Read `src/lib/import/formats/RJPParser.ts` — understand what's already there
2. Check what SynthType it returns (UADESynth or something custom?)
3. Binary analysis on `Reference Music/Richard Joseph/` files

**Reference sources:**
- `Reference Code/uade-3.05/players/RichardJoseph_Player` + `RichardJoseph`
- Existing `RJPParser.ts`

**Implementation steps:**
- [ ] Read existing RJPParser.ts and understand current state
- [ ] Binary analysis
- [ ] Complete instrument struct parsing if partial
- [ ] WASM synth (or confirm PCM sampler is sufficient)
- [ ] Tests + manual verification

---

### 6. HisMastersNoise

| Field | Value |
|-------|-------|
| Extensions | `hn`, `mtp2`, `thn`, `arp` |
| Reference files | 104 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/MajorTom` |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** "His Master's Noise" / MajorTom format. Used in various Amiga games and demos.
The `mtp2` prefix suggests MajorTom Pro 2; `arp` suggests arpeggio-based synthesis.

**Binary analysis findings:**
_(Fill in)_

**Reference sources:**
- `Reference Code/uade-3.05/players/MajorTom`

**Implementation steps:**
- [ ] Binary analysis
- [ ] Understand synthesizer architecture (arpeggio-based?)
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 7. JochenHippel

| Field | Value |
|-------|-------|
| Extensions | `hip`, `mcmd`, `sog`, `hip7` (7-voice), `s7g` |
| Reference files | 64 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/JochenHippel` (3.2 KB) |
| **Status** | `deferred: TFMX macro-synth (requires TFMX-ST engine)` |
| Claimed by | Claude Sonnet 4.6 (2026-02-27) |

**What it is:** Self-contained compiled 68k binary containing a TFMX-ST macro-synth replayer
and embedded song data. Each `.hip` file has a 3-instruction dispatch table at offset 0,
followed by 68k replayer code, followed by an embedded TFMX-ST block (`TFMX\0` magic).

**Format reference:** `docs/formats/JochenHippel.md` — comprehensive binary layout analysis.

**Key findings:**
- Magic: `60 02 60 xx 48 E7 FF FE` at offsets 0-7 (BRA.B + BRA.B + MOVEM.L)
- Embedded TFMX-ST block at ~0x900–0xA00 (scan for `TFMX\0` after replayer code)
- 62/63 files: single TFMX block (single song); 1 file has 3 COSO+TFMX pairs (3 subsongs)
- PCM waveform data stored after TFMX block (8-bit signed Amiga PCM)
- Instrument names are AmigaOS device paths (not human-readable)
- HippelCoSo (`.hipc`) is FULLY NATIVE. This format uses different TFMX-ST synthesis.

**Why deferred:** Synthesis requires TFMX-ST macro interpreter (interprets per-tick
macro bytecode to control Paula hardware). UADE's embedded 68k replayer handles this correctly.

**Future path:** Share a TFMX-ST engine with JochenHippelST (`.sog`). PCM extraction
possible once TFMX header is parsed for sample count; use existing Sampler engine.

---

### 8. JasonPage

| Field | Value |
|-------|-------|
| Extensions | `jpn`, `jpnd`, `jp` |
| Reference files | 64 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/JasonPage` (13.1 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Jason Page's Amiga music format. Used in Gremlin Graphics games
(Zool, Harlequin, etc.). Medium-sized player suggests moderate complexity.

**Binary analysis findings:**
_(Fill in)_

**Reference sources:**
- `Reference Code/uade-3.05/players/JasonPage`

**Implementation steps:**
- [ ] Binary analysis on a jpn file
- [ ] Map instrument struct layout
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 9. DaveLowe

| Field | Value |
|-------|-------|
| Extensions | `dl`, `dl_deli`, `dln` |
| Reference files | 46 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/DaveLowe` (2.8 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Dave Lowe's Amiga format. Small player size suggests a relatively simple
synthesis architecture. Used in Silkworm, SWIV, Speedball, etc.

**Notes:** `dl_deli` is the Delitracker variant; `dln` is a newer format.
The `DaveLoweNew` eagleplayer has the same 2.8 KB size suggesting similar architecture.

**Reference sources:**
- `Reference Code/uade-3.05/players/DaveLowe`
- `Reference Code/uade-3.05/players/DaveLowe_Deli`
- `Reference Code/uade-3.05/players/DaveLoweNew`

**Implementation steps:**
- [ ] Binary analysis on a dl file
- [ ] Map instrument struct layout
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 10. BenDaglish

| Field | Value |
|-------|-------|
| Extensions | `bd`, `bds` |
| Reference files | 45 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/BenDaglish` (2.8 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Ben Daglish's format. Small player — simple synthesis.
Used in classic games like Gauntlet, Leatherneck, Cybernoid 2 (Spectrum ports).
`bds` = SID-based variant (BenDaglish-SID, uses C64 SID-style synthesis).

**Notes:** The plain `bd` and `bds` variants have different synthesis architectures.
Start with `bd` (simpler). `bds` may need SID-style oscillators.

**Reference sources:**
- `Reference Code/uade-3.05/players/BenDaglish`
- `Reference Code/uade-3.05/players/BenDaglish-SID`

**Implementation steps:**
- [ ] Binary analysis on a bd file
- [ ] Separate bd vs bds architecture
- [ ] TypeScript parser + WASM synth (bd first)
- [ ] Tests + manual verification

---

### 11. ManiacsOfNoise

| Field | Value |
|-------|-------|
| Extensions | `mon` |
| Reference files | 29 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/ManiacsOfNoise` (1.3 KB) |
| **Status** | `deferred: compiled-binary/macro-synth — see docs/formats/ManiacsOfNoise.md` |
| Claimed by | claude-sonnet-4-6 2026-02-27 |

**What it is:** Each `.mon` file is a self-contained 68k binary with the replayer compiled in.
The UADE player (1.3 KB) is just a tiny shim that calls into the embedded replayer.
Two sub-types exist: **macro-synth** (Jeroen Tel, tiny 7-8KB files using 68k code macros as
instruments) and **PCM-sampler** (Charles Deenen / Reyn Ouwehand, 40-200KB files with embedded PCM).

**Why deferred:** The "instruments" are 68k machine code macro routines that write directly to
Amiga Paula hardware registers. Static parsing requires a 68k disassembler to extract synthesis
parameters. No fixed binary layout. See full analysis in `docs/formats/ManiacsOfNoise.md`.

**Binary analysis findings (2026-02-27):**
- Header: 3× JSR (d16,PC) at bytes 0x00/0x04/0x08 = init/play/stop entry points
- Credits text at offset 0x000C (ASCII, variable length)
- Load address = 0x7000 (computed from LEA→table cross-reference in flimbos quest.mon)
- Waveform table at A5 (runtime workspace); 13 entries in flimbos quest.mon
- ALL "waveform" pointers → 68k macro code blocks (NOT PCM data)
- PCM audio data starts ~0x08000 for large files; ≈85KB of audio in flimbos quest.mon

**Reference sources:**
- `docs/formats/ManiacsOfNoise.md` — full technical analysis
- `Reference Code/uade-3.05/amigasrc/players/mon/mon` — UADE player shim binary
- `Reference Code/uade-3.05/players/ManiacsOfNoise`

**Implementation steps:**
- [x] Binary analysis on mon files (gyroscope.mon, flimbos quest.mon, chinese chess)
- [x] Traced init routine, LEA instructions, waveform pointer table
- [x] Identified macro-synth vs PCM-sampler sub-types
- [ ] DETECTION ONLY parser: extract credits text, return UADESynth instruments
- [ ] Future: 68k macro disassembler for PCM offset extraction (low priority)

---

### 12. WallyBeben

| Field | Value |
|-------|-------|
| Extensions | `wb` |
| Reference files | 24 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/WallyBeben` (2.9 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Wally Beben's format. Small player suggests simple architecture.
Known for Xenon, Lotus Esprit soundtracks.

**Reference sources:**
- `Reference Code/uade-3.05/players/WallyBeben`

**Implementation steps:**
- [ ] Binary analysis on a wb file
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 13. JasonBrooke

| Field | Value |
|-------|-------|
| Extensions | `jcb`, `jcbo`, `jb` |
| Reference files | 18 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/JasonBrooke` |
| **Status** | `not-started` |
| Claimed by | — |

**Reference sources:**
- `Reference Code/uade-3.05/players/JasonBrooke`

**Implementation steps:**
- [ ] Binary analysis
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

### 14. JeroenTel

| Field | Value |
|-------|-------|
| Extensions | `jt`, `mon_old` |
| Reference files | 9 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/JeroenTel` (3.4 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Jeroen Tel's Amiga format. The composer of Cybernoid, Myth, Turbo Outrun
soundtracks. Small player suggests simple synthesis architecture.
`mon_old` = old Maniacs of Noise format (same player).

**Notes:** 9 reference files is relatively few. Prioritize after formats 1-11 which have
more files. But the player is small (3.4 KB) so implementation should be quick.

**Reference sources:**
- `Reference Code/uade-3.05/players/JeroenTel`

**Implementation steps:**
- [ ] Binary analysis: `npx tsx scripts/binary-inspector.ts "Reference Music/Jeroen Tel/..."  --all`
- [ ] Map instrument struct layout from player disassembly
- [ ] TypeScript parser
- [ ] WASM synth + AudioWorklet
- [ ] TypeScript engine + synth class
- [ ] UI controls
- [ ] Wire up in ToneEngine + InstrumentFactory
- [ ] Parser tests
- [ ] Manual verification

---

### 15. MarkCooksey

| Field | Value |
|-------|-------|
| Extensions | `mc`, `mcr`, `mco` |
| Reference files | 9 |
| Eagleplayer binary | `Reference Code/uade-3.05/players/Mark_Cooksey` (4.3 KB) |
| **Status** | `not-started` |
| Claimed by | — |

**What it is:** Mark Cooksey's Amiga format. Known for Cauldron, Mask, many Ocean games.
`mco` = Mark Cooksey Old (different variant, separate player).

**Reference sources:**
- `Reference Code/uade-3.05/players/Mark_Cooksey`
- `Reference Code/uade-3.05/players/Mark_Cooksey_Old`

**Implementation steps:**
- [ ] Binary analysis: `npx tsx scripts/binary-inspector.ts "Reference Music/Mark Cooksey/..." --all`
- [ ] Separate mc/mcr vs mco architecture
- [ ] TypeScript parser + WASM synth
- [ ] Tests + manual verification

---

## Additional UADE_ONLY Formats (lower priority)

These have fewer reference files but are still worth implementing eventually.

| Format | Extensions | Ref Files | Player Size | Status |
|--------|-----------|-----------|-------------|--------|
| SpecialFX (Special-FX) | jd, doda | 31 | — | `not-started` |
| Laxity | powt, pt | — | — | `not-started` |
| JochenHippel-7V | hip7, s7g | — | — | `not-started` |
| JochenHippel-CoSo-ST | hst | — | — | `not-started` |
| PaulShields | ps | 14 | — | `not-started` |
| PaulSummers | snk | 4 | — | `not-started` |
| DynamicSynthesizer | dns | — | — | `not-started` |
| GlueMon | glue, gm | 17 | — | `not-started` |
| EMS | ems, emsv6 | — | — | `not-started` |
| InStereo | is, is20 | 6 | — | `not-started` |
| ImagesMusicSystem | ims | 13 | — | `not-started` |
| KrisHatlelid | kh | 18 | — | `not-started` |
| JesperOlsen | jo | 38 | — | `not-started` |
| Desire | dsr | — | — | `not-started` |
| FredGray | gray | 4 | — | `not-started` |

---

## Format Documentation

Individual format docs live in `docs/formats/`. Each covers binary layout, instrument
struct offsets, synth type, and implementation notes.

Key docs for DETECTION_ONLY formats currently being analyzed:

| Format | Doc |
|--------|-----|
| Ben Daglish | [`docs/formats/BenDaglish.md`](formats/BenDaglish.md) |
| Sound Factory | [`docs/formats/SoundFactory.md`](formats/SoundFactory.md) |
| Synthesis / InStereo 1.0 | [`docs/formats/Synthesis.md`](formats/Synthesis.md) |
| InStereo 2.0 | [`docs/formats/InStereo2.md`](formats/InStereo2.md) |
| Digital Sound Studio | [`docs/formats/DigitalSoundStudio.md`](formats/DigitalSoundStudio.md) |
| Actionamics | [`docs/formats/Actionamics.md`](formats/Actionamics.md) |
| Quartet | [`docs/formats/Quartet.md`](formats/Quartet.md) |
| ZoundMon | [`docs/formats/ZoundMon.md`](formats/ZoundMon.md) |
| Art Of Noise | [`docs/formats/ArtOfNoise.md`](formats/ArtOfNoise.md) |
| Jochen Hippel | [`docs/formats/JochenHippel.md`](formats/JochenHippel.md) |
| Maniacs Of Noise | [`docs/formats/ManiacsOfNoise.md`](formats/ManiacsOfNoise.md) |

**New:** `docs/formats/Replayers/` — original Amiga assembly replayer source code,
organized by format. Use as primary reference when the UADE eagleplayer binary
is the only available reference. Contains replayers for: SoundFactory, Synthesis,
InStereo, DigitalSoundStudio, DigitalMugician, FredEditor, FutureComposer,
GameMusicCreator, JamCracker, MED, Oktalyzer, PumaTracker, Quartet, SIDMon,
SidMonII, SonicArranger, SoundFX, SoundMon, Synthesis, TFMX, ZoundMon, and others.

---

## Reference Implementation Checklist

When implementing any new format, use these as templates:

| What | Where |
|------|-------|
| Simplest synth template | `src/engine/hively/HivelySynth.ts` |
| Simplest worklet template | `public/hively/Hively.worklet.js` |
| C API contract | `soundmon-wasm/include/format_synth_api.h` |
| Simplest controls template | `src/components/instruments/controls/SoundMonControls.tsx` |
| Complex controls template | `src/components/instruments/controls/OctaMEDControls.tsx` |
| Reference parser | `src/lib/import/formats/SoundMonParser.ts` |
| Wiring example | `src/engine/ToneEngine.ts` → search `WASM_SYNTH_TYPES` |
| Factory example | `src/engine/InstrumentFactory.ts` → search `SoundMonSynth` |
| Editor routing | `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` |

---

## Analysis Tools

```bash
# Run binary analysis on a format file
npx tsx scripts/binary-inspector.ts "Reference Music/<Format>/<file>" --all

# Get eagleplayer info for a format
npx tsx scripts/eagleplayer-info.ts --ext <ext>
npx tsx scripts/eagleplayer-info.ts <PlayerName>

# Regenerate audit table
npx tsx scripts/uade-audit.ts

# Regenerate file count rankings
npx tsx scripts/count-ref-files.ts
```
