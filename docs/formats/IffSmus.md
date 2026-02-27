# IFF-SMUS (Standard Music)

**Status:** NATIVE_SAMPLER — parser extracts instrument names, uses Sampler engine placeholders
**Parser:** `src/lib/import/formats/IffSmusParser.ts`
**Extensions:** `smus.*`, `snx.*`, `tiny.*`, UADE eagleplayer
**Reference files:** `Reference Music/IFF-SMUS/` (8817 files — largest collection)
**Replayer source:** no Amiga assembly replayer; EA/Impulse format

---

## Overview

SMUS (Standard MUSic) is an IFF-chunked Amiga music format from Electronic Arts
(circa 1985). Unlike tracker formats with pattern/row data, SMUS stores music as
**scored events** (note + duration pairs), similar to a simplified MIDI file. Each
TRAK chunk represents one voice/channel; instruments reference external `.instr`
files (IFF 8SVX or Synthesis samples) which are not bundled with the module.

DEViLBOX creates **silent Sampler placeholders** for each instrument because the
external `.instr` files are not available in the standard module distribution.
UADE's eagleplayer handles full synthesis including sound.

**Primary reference:** NostalgicPlayer `IffSmusWorker.cs`, `Tables.cs`, `EventType.cs`
by Polycode.

---

## File Layout

Standard IFF FORM container:

```
Offset  Size  Description
------  ----  -----------
0x00    4     "FORM"
0x04    4     Total size (big-endian)
0x08    4     Type: "SMUS"
0x0C    ...   IFF chunks (described below)
```

---

## IFF Chunks

### `SHDR` — Score Header (required, 4 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    2     Tempo (CIA timer value, uint16BE)
0x02    1     Global volume (0–127)
0x03    1     Number of channels/voices
```

**Tempo conversion:** The uint16 CIA value is looked up in a 128-entry TEMPO_TABLE.
The high nibble of the matching index gives the XM `speed` value. Default tempo
approximates 120 BPM.

### `INS1` — Instrument Definition (one per instrument, variable length)

```
Offset  Size  Description
------  ----  -----------
0x00    1     Register number (instrument slot, 0-based)
0x01    1     Instrument type (0=SampledSound, 1=Synthesis, 2=MIDI, etc.)
0x02    1     Data1 (type-dependent)
0x03    1     Data2 (type-dependent)
0x04    ...   Name string (null-terminated ASCII)
```

Instrument names from `INS1` are used as display names (typically the `.instr`
filename without extension).

### `TRAK` — Track Event Stream (one per channel)

```
2 bytes per event: type byte + data byte
```

#### Event Type Encoding

| Type | Meaning |
|------|---------|
| 0–127 | MIDI note number (play note); data byte contains duration nibble |
| 128 | Rest; data byte contains duration nibble |
| 129 | Instrument change; data = register number |
| 130 | Time signature change |
| 132 | Per-track volume change |
| 255 | End-of-track marker |

For note and rest events, the data byte is masked to 4 bits (`& 0x0F`) and used
as an index into the duration table:

```
DURATION_TABLE[16]:
  Index  Ticks  Description
  0      32     Whole note
  1      16     Half note
  2      8      Quarter note
  3      4      Eighth note
  4      2      Sixteenth note
  5-7    skip   Invalid
  8      48     Dotted whole
  9      24     Dotted half
  10     12     Dotted quarter
  11     6      Dotted eighth
  12     3      Dotted sixteenth
  13-15  skip   Invalid
```

### `NAME` — Song Name (optional)

Null-terminated ASCII song title string.

### `AUTH` — Author (optional)

Null-terminated ASCII author/composer name.

### `SNX1`–`SNX9` — Sonix Extension Chunks (optional)

Per-channel extensions used by Sonix Music Driver:
- Transpose
- Tune offset
- Per-channel enabled/disabled flags

---

## Note Pitch Conversion

SMUS uses standard MIDI note numbers (0–127):
```
XM note = MIDI note - 11,  clamped to [1, 96]
MIDI 60 (middle C / C-5) → XM 49 (C-4 in DEViLBOX convention)
MIDI 12 (C-0) → XM 1
```

---

## Playback Model

- 1 SMUS tick = 1 pattern row
- A note of duration N ticks occupies: 1 note-on row + (N-1) empty continuation rows
- Flat cell arrays are split into 64-row patterns for the TrackerReplayer
- Multiple channels (TRAK chunks) map to multiple tracker channels

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/IffSmusParser.ts`
- **NostalgicPlayer:** `Reference Code/NostalgicPlayer/Source/Agents/Players/IffSmus/`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER with silent placeholders

Because IFF-SMUS instruments reference external `.instr` files by name, the parser
cannot extract actual PCM data — the external files are not distributed with modules.
Each `INS1` entry creates a `createSamplerInstrument()` with a 1-sample silent PCM
block, preserving the instrument name for display.

**Extension variants:**
- `smus.*` — Standard EA SMUS modules
- `snx.*` — Sonix Music Driver variant (adds SNX extension chunks)
- `tiny.*` — Compact format (fewer instruments, optimized for demos)

**Path to richer extraction:**
Matching instrument names to a library of `.instr` files would enable PCM extraction.
The instrument type byte (0=SampledSound, 1=Synthesis) determines how the `.instr`
file should be decoded.
