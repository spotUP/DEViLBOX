---
date: 2026-03-07
topic: format-capabilities
tags: [editable-formats, exportable-formats, format-constraints]
status: final
---

# DEViLBOX Format Capabilities Research

## Overview
This document maps DEViLBOX's support for different tracker/chip formats across three dimensions:
1. **Editability** — whether a format has a pattern editor
2. **Exportability** — whether the format can be exported to its native format
3. **WASM Engine Classification** — replay-only vs editable formats

---

## 1. EDITABLE FORMATS (Pattern Editors)

DEViLBOX has **7 editor modes** defined in `src/types/tracker.ts:495`:

```typescript
export type EditorMode = 'classic' | 'furnace' | 'hively' | 'musicline' | 'goattracker' | 'klystrack' | 'jamcracker';
```

### Editor Mode Routing (`src/pixi/views/PixiTrackerView.tsx`)

| EditorMode | Component | Formats | Editable |
|-----------|-----------|---------|----------|
| `classic` | `PixiPatternEditor` | MOD, XM, IT, S3M, OKT, MED, DIGI, DBM, FC | YES |
| `furnace` | `PixiFurnaceView` | Furnace native files (.fur) | YES |
| `hively` | `PixiHivelyView` | HVL, AHX | YES |
| `klystrack` | `PixiKlysView` | KT (Klystrack) | YES |
| `musicline` | MusicLine editor | MusicLine (.mld) | YES |
| `goattracker` | `PixiGTUltraView` | GT2, SID (via GoatTracker) | YES |
| `jamcracker` | `PixiJamCrackerView` | JamCracker (.jam, .jc) | YES |

**Total editable formats: 7 editor modes, covering 15+ formats**

### Format Editor Dispatch (`src/stores/useFormatStore.ts:129-180`)

The `applyEditorMode()` method switches editor based on loaded data:
- `song.furnaceNative` → 'furnace' mode
- `song.hivelyNative` → 'hively' mode
- `song.klysNative` → 'klystrack' mode
- `song.channelTrackTables` → 'musicline' mode
- `song.jamCrackerFileData` → 'jamcracker' mode
- `song.goatTrackerData || song.c64SidFileData` → 'goattracker' mode
- Otherwise → 'classic' mode

---

## 2. WASM-ONLY REPLAY ENGINES (suppressNotes: true)

These formats have **no pattern editor** — they are playback-only WASM engines that suppress the note trigger callback (`suppressNotes: true` in `NativeEngineRouting.ts:84-317`).

### Complete List of Replay-Only Formats

| Format | Engine | File Field | Load Method | Pause Support | Notes |
|--------|--------|-----------|-------------|---------------|-------|
| KT | Klystrack | `klysFileData` | `loadSong` | true | NOTE: Also has editable mode! |
| JamCracker | JamCracker | `jamCrackerFileData` | `loadTune` | false | Also editable |
| FuturePlayer | FuturePlayer | `futurePlayerFileData` | `loadTune` | true | Replay-only |
| PreTracker | PreTracker | `preTrackerFileData` | `loadTune` | false | Replay-only |
| MusicAssembler | MusicAssembler | `maFileData` | `loadTune` | false | Replay-only |
| Hippel | Hippel | `hippelFileData` | `loadTune` | false | Replay-only |
| Sonix | Sonix | `sonixFileData` | `loadTune` | false | Replay-only |
| Pxtone | Pxtone | `pxtoneFileData` | `loadTune` | false | Replay-only |
| Organya | Organya | `organyaFileData` | `loadTune` | false | Replay-only |
| Eupmini | Eupmini | `eupFileData` | `loadTune` | false | Replay-only |
| Ixalance | Ixalance | `ixsFileData` | `loadTune` | false | Replay-only |
| Cpsycle | Cpsycle | `psycleFileData` | `loadTune` | false | Replay-only |
| Sc68 | Sc68 | `sc68FileData` | `loadTune` | false | Replay-only (68k music files) |
| Zxtune | Zxtune | `zxtuneFileData` | `loadTune` | false | Replay-only (multi-format) |
| MusicLine | MusicLine | `musiclineFileData` | `loadSong` | false | NOTE: Also has editable mode! |

**Key insight:** Klystrack and JamCracker have BOTH editable modes AND replay-only WASM engines. This allows fallback playback when the native format isn't fully editable.

---

## 3. EXPORTABLE FORMATS

### Export Infrastructure

Located in `src/lib/export/`:
- **Main export dialog:** `PixiExportDialog.tsx` (lines 68-78 show 9 export modes)
- **Export registry:** `exporters.ts` (DeViLBOX native formats)

### Export Modes Available (`PixiExportDialog.tsx:54`)

```typescript
type ExportMode = 'song' | 'sfx' | 'instrument' | 'audio' | 'midi' | 'xm' | 'mod' | 'chip' | 'nano';
```

### Exportable Formats by Category

#### Native DEViLBOX Formats
- **.dbx** — Song export (JSON with all patterns, instruments, sequences)
- **.sfx.json** — SFX/pattern export (single pattern + instrument)
- **.dbi** — Instrument export (single instrument)
- **.dbn** — Nano Binary (compressed binary format)

#### Audio Export
- **.wav** — Rendered audio

#### Tracker Formats
- **.xm** — FastTracker 2 Module (via `XMExporter.ts`)
- **.mod** — ProTracker MOD (via `MODExporter.ts`)

#### Chip/Hardware Formats
Located in `src/lib/export/`:

| Format | File Extension | Exporter | Loop Support | Supported |
|--------|---|----------|---|---|
| VGM | `.vgm` | `VGMExporter` | Custom loop point | YES |
| GYM | `.gym` | `GYMExporter` | None | YES |
| NSF | `.nsf` | `NSFExporter` | Auto | YES |
| GBS | `.gbs` | `GBSExporter` | Auto | YES |
| SPC | `.spc` | `SPCExporter` | None | YES |
| ZSM | `.zsm` | `ZSMExporter` | None | YES |
| SAP | `.sap` | `SAPExporter` | Auto | YES |
| S98 | `.s98` | `S98Exporter` | None | YES |
| MDX | `.mdx` | `MDXExporter` | None | YES |
| SNDH | `.sndh` | `SNDHExporter` | None | YES |
| PMD | `.pmd` | `PMDExporter` | None | YES |
| AdPlug | `.adl` | `AdPlugExporter` | None | YES |
| TIAUna | `.tiuna` | `TIunAExporter` | None | YES |

#### MIDI Export
- **.mid** — MIDI output

#### Format-Specific Exporters
- **Klystrack:** `KlysExporter.ts`
- **Hively:** `HivelyExporter.ts`
- **FuturePlayer:** `FuturePlayerExporter.ts`
- **JamCracker:** `JamCrackerExporter.ts`
- **MusicLine:** `MusicLineExporter.ts`

#### Furnace Export
- **FurnaceExporter:** Exports to native Furnace format

---

## 4. FORMAT CONSTRAINTS

File: `src/lib/import/formatConstraints.ts:46-80`

Defines maximum capabilities for each format (channel count, note range, effect columns, max instruments, pattern rows).

### Editable Format Constraints Summary

| Format | Max Channels | Max Notes | Max Effects | Max Instruments | Max Pattern Rows |
|--------|---|---|---|---|---|
| XM | 32 | 96 | 2 | 128 | 256 |
| MOD | 32 | 96 | 1 | 31 | 64 |
| IT | 64 | 96 | 2 | 99 | 200 |
| S3M | 32 | 96 | 1 | 99 | 64 |
| HVL | 4 | 96 | 2 | 63 | 64 |
| AHX | 4 | 96 | 2 | 63 | 64 |
| OKT | 8 | 96 | 1 | 36 | 128 |
| MED | 16 | 96 | 2 | 63 | 64 |
| DIGI | 8 | 96 | 1 | 31 | 64 |
| DBM | 128 | 96 | 2 | 128 | 64 |
| FC | 4 | 96 | 2 | 10 | 64 |

### Chip Format Constraints (Reference)

| Format | Max Channels | Notes | Max Instruments |
|--------|---|---|---|
| NES (NSF) | 5 | 2A03 + expansion | 8 |
| Game Boy (GBS) | 4 | Fixed (2 pulse + wave + noise) | 4 |
| SNES (SPC) | 8 | Fixed SPC700 voices | 64 |
| Genesis (GYM) | 6 | YM2612 (6 FM) | — |
| Atari ST (SNDH) | 4 | 3×YM2149 + timer | 16 |
| Atari 800 (SAP) | 4 | POKEY | 4 |

---

## 5. FURNACE CHIP TYPES (Alternatives for Non-Editable Formats)

DEViLBOX supports **90+ Furnace chip types** for composition. These can serve as "target platforms" when converting from non-editable formats.

### Furnace Chips by Category

**FM Synthesis (10 types):**
- FurnaceOPN (YM2612 — Sega Genesis)
- FurnaceOPM (Yamaha OPM — arcade)
- FurnaceOPL (OPL3 — AdLib)
- FurnaceOPLL (Yamaha OPLL — MSX)
- FurnaceOPNA (YM2608 — PC-98)
- FurnaceOPNB (YM2610 — Neo Geo)
- FurnaceOPL4, FurnaceY8950, FurnaceOPZ, FurnaceESFM

**Console PSG (8 types):**
- FurnaceNES (2A03)
- FurnaceGB (Game Boy)
- FurnacePSG (TI SN76489 — Master System)
- FurnacePCE (PC Engine)
- FurnaceSNES (SNES SPC700)
- FurnaceVB, FurnaceLynx, FurnaceSWAN

**NES Expansions (5 types):**
- FurnaceVRC6, FurnaceVRC7, FurnaceN163, FurnaceFDS, FurnaceMMC5

**Computer Chips (6 types):**
- FurnaceC64, FurnaceSID6581, FurnaceSID8580
- FurnaceAY (AY-3-8910 — ZX Spectrum, MSX)
- FurnaceVIC, FurnaceSAA

**Arcade PCM (10 types):**
- FurnaceSEGAPCM, FurnaceQSOUND, FurnaceES5506, FurnaceRF5C68, etc.

**Wavetable (3 types):**
- FurnaceSCC (Konami SCC — MSX)
- FurnaceX1_010, FurnaceBUBBLE

**Other (15+ types):**
- FurnaceTIA (Atari 2600)
- FurnacePOKEY (Atari POKEY)
- FurnaceAY8930 (Enhanced AY — Microchip)
- FurnaceNAMCO (Namco WSG)
- FurnacePCSPKR (PC Speaker)
- FurnaceZXBEEPER (ZX Spectrum beeper)
- And 9 more...

### Key Furnace Chip Mapping for Format Conversion

For formats like **Atari ST (SNDH)** which is replay-only:
- Native chip: YM2149 (3-voice PSG + timer)
- Furnace equivalents: **FurnaceAY** (best match, same AY-3-8910 family)
- Alternative: **FurnaceOPNA** (has AY-3-8910 as part of YM2608)

For **ZX Spectrum** formats:
- Native: AY-3-8910
- Furnace match: **FurnaceAY** or **FurnaceAY8930** (enhanced version)

For **MSX** formats:
- Native: AY-3-8910 + optional SCC
- Furnace: **FurnaceAY** + **FurnaceSCC** (wavetable expansion)

---

## 6. NATIVE FORMAT SUPPORT BY EDITOR

### Furnace Native (.fur)
- **Editor:** PixiFurnaceView (hardware UI blit)
- **Exportable:** Yes (via FurnaceExporter)
- **File field:** `furnaceNative` in store
- **Constraints:** Per-chip (defined in Furnace source)

### Hively (HVL/AHX)
- **Editor:** PixiHivelyView (pattern grid)
- **Exportable:** Yes (via HivelyExporter)
- **File field:** `hivelyNative`, `hivelyFileData`
- **Constraints:** 4 channels, 63 instruments max

### Klystrack (KT)
- **Editor:** PixiKlysView (hardware UI)
- **Exportable:** Yes (via KlysExporter)
- **File field:** `klysNative`, `klysFileData`
- **Native playback:** Also has WASM replay-only path

### GoatTracker (SID)
- **Editor:** PixiGTUltraView (hardware UI blit)
- **Exportable:** Not directly (uses C64SIDEngine for playback)
- **File field:** `goatTrackerData`
- **Notes:** SID subsongs extracted and available in store

### MusicLine (.mld)
- **Editor:** Dedicated MusicLine editor (channel track tables)
- **Exportable:** Yes (via MusicLineExporter)
- **File field:** `musiclineFileData`, `channelTrackTables`
- **Native playback:** WASM replay-only path available

### JamCracker (.jam, .jc)
- **Editor:** PixiJamCrackerView
- **Exportable:** Yes (via JamCrackerExporter)
- **File field:** `jamCrackerFileData`
- **Native playback:** Also has WASM replay-only path

---

## 7. FORMAT CAPABILITIES MATRIX

| Format | Editable | Exportable | Constraint Validation | WASM Replay | Notes |
|--------|---|---|---|---|---|
| MOD | YES | YES | Yes | No | Classic tracker |
| XM | YES | YES | Yes | No | Classic tracker |
| IT | YES | YES | Yes | No | Impulse Tracker |
| S3M | YES | YES | Yes | No | Scream Tracker |
| OKT | YES | YES | Yes | No | Oktalyzer |
| MED | YES | YES | Yes | No | MAME Tracker |
| FC | YES | YES | Yes | No | Future Composer |
| HVL | YES | YES | Yes | No | Hively (Amiga) |
| AHX | YES | YES | Yes | No | AHX (Amiga) |
| FUR | YES | YES | Yes | Yes | Furnace native |
| KT | YES | YES | Yes | YES | Klystrack (dual mode) |
| GTU | YES | No | Yes | YES | GoatTracker (SID) |
| MLD | YES | YES | Yes | YES | MusicLine (dual mode) |
| JAM | YES | YES | Yes | YES | JamCracker (dual mode) |
| PT | NO | NO | No | Yes | PreTracker replay-only |
| MA | NO | NO | No | Yes | Music-Assembler replay-only |
| HIP | NO | NO | No | Yes | Hippel replay-only |
| SONIX | NO | NO | No | Yes | Sonix replay-only |
| PXT | NO | NO | No | Yes | Pxtone replay-only |
| ORG | NO | NO | No | Yes | Organya replay-only |
| EUP | NO | NO | No | Yes | Eupmini replay-only |
| IXS | NO | NO | No | Yes | Ixalance replay-only |
| PSY | NO | NO | No | Yes | Psycle replay-only |
| SC68 | NO | NO | No | Yes | Sc68 (68k) replay-only |
| ZXVTUNE | NO | NO | No | Yes | Zxtune multi-format |
| HES | NO | YES (via Furnace) | No | No | PC Engine (file dump) |
| KSS | NO | YES (via Furnace) | No | No | MSX (file dump) |
| GBS | NO | YES (via GBSExporter) | No | No | Game Boy (file dump) |
| SPC | NO | YES (via SPCExporter) | No | No | SNES (file dump) |
| SID | NO | YES (via C64SIDEngine log) | No | Yes | C64 (song file) |
| VGM | NO | YES (via VGMExporter) | No | No | Multi-chip format |
| NSF | NO | YES (via NSFExporter) | No | No | NES format |
| GYM | NO | YES (via GYMExporter) | No | No | Genesis YM2612 |
| SAP | NO | YES (via SAPExporter) | No | No | Atari POKEY |
| SNDH | NO | YES (via SNDHExporter) | No | No | Atari ST YM2149 |
| MDX | NO | YES (via MDXExporter) | No | No | X68000 OPM |
| PMD | NO | YES (via PMDExporter) | No | No | PC-98 |
| S98 | NO | YES (via S98Exporter) | No | No | Register dump |

---

## 8. IMPLEMENTATION PATTERNS

### How to Check if a Format is Editable

```typescript
const { editorMode } = useFormatStore();
const isEditable = editorMode !== 'classic'; // Any special mode = editable
```

Or check for native format data:
```typescript
const { furnaceNative, hivelyNative, klysNative, musiclineFileData } = useFormatStore();
const hasNativeEditor = !!(furnaceNative || hivelyNative || klysNative || musiclineFileData);
```

### How to Find Available Exporters

1. **Native DEViLBOX:** `exporters.ts` (song, sfx, instrument)
2. **Tracker formats:** `XMExporter.ts`, `MODExporter.ts`
3. **Chip formats:** `src/lib/export/` directory (20+ exporters)
4. **Special cases:** `KlysExporter.ts`, `HivelyExporter.ts`, `FurnaceExporter.ts`

### How to Validate Format Edits

```typescript
import { validateEdit } from '@lib/import/formatConstraints';

const warnings = validateEdit(format, channelIndex, note, instrument, effectCol);
if (warnings.length > 0) {
  // Warn user
}
```

---

## 9. SUMMARY COUNTS

- **Total formats supported:** 50+
- **Fully editable formats:** 15+ (7 editor modes)
- **Editable via native mode:** 6 (Furnace, Hively, Klystrack, GoatTracker, MusicLine, JamCracker)
- **Classic tracker editable:** 10 (MOD, XM, IT, S3M, OKT, MED, DIGI, DBM, FC, + rare ones)
- **Replay-only WASM engines:** 15 (PreTracker, Hippel, Sonix, etc.)
- **Chip exporters:** 13 (VGM, GYM, NSF, GBS, SPC, ZSM, SAP, S98, MDX, SNDH, PMD, AdPlug, TIAUna)
- **Furnace chip alternatives:** 90+ (covers all replay-only formats)

---

## 10. KEY FILES

- `src/engine/replayer/NativeEngineRouting.ts` — WASM engine registry (suppressNotes classification)
- `src/stores/useFormatStore.ts` — Editor mode state & applyEditorMode() logic
- `src/types/tracker.ts:495` — EditorMode type definition
- `src/lib/import/formatConstraints.ts` — Format editing constraints
- `src/lib/export/` — All exporters (30+ files)
- `src/pixi/views/PixiTrackerView.tsx` — Editor mode routing to UI views
- `src/types/instrument/base.ts` — SynthType including 90+ Furnace chips
