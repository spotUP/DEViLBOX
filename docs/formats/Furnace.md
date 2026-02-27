# Furnace Tracker Instrument / Wavetable (.fui, .fuw)

**Status:** FULLY_NATIVE — routes to Furnace chip synthesizer
**Parsers:** `src/lib/import/formats/FurnaceParser.ts`, `src/lib/import/formats/FurnaceWavetableParser.ts`
**Extensions:** `.fui` (instrument), `.fuw` (wavetable)
**UADE name:** N/A (native Furnace synth)
**Reference files:** `Reference Music/Furnace/`

---

## Overview

Furnace Tracker (by tildearrow) is an open-source chiptune tracker supporting dozens of
retro hardware chips. DEViLBOX supports two Furnace file types:

- **`.fui`** — a single Furnace instrument (FM or PSG), including operator parameters and embedded wavetables
- **`.fuw`** — a standalone Furnace wavetable (arbitrary-length signed integer array)

Both formats have two sub-variants: a legacy format (magic `-Furnace instr.-` or `-Furnace waveta-`)
and a modern feature-based format (`FINS`/`INS2`/`INST` magic).

---

## .fui — Furnace Instrument File

### Detection

```
Old format: buf[0..15] starts with "-Furnace instr."
New format: buf[0..3] == "FINS" OR "INS2" OR "INST"
```

### Old Format Layout

```
Offset  Size  Description
------  ----  -----------
0       16    Magic: "-Furnace instr." (padded to 16 bytes)
16      2     version (u16LE)
18      2     reserved
20      4     dataPtr (u32LE) — offset to INST block
24      2     waveCount (u16LE)
26      2     sampleCount (u16LE)
30      4     reserved
34      waveCount×4   wave pointers (u32LE each)
...     sampleCount×4 sample pointers (skipped)
at dataPtr: INST block
  "INST" magic (4)
  block size (4)
  version (2)
  chipType (u8)
  reserved (1)
  name (null-terminated string)
  algorithm (u8), feedback (u8)
  fms (u8), ams (u8)
  opCount (u8), OPLL flags (u8), reserved (2)
  4 × operator data (12 bytes each): AM, AR, DR, MULT, RR, SL, TL, DT2, RS, DT, D2R, SSG
```

### New Format Layout

```
Offset  Size  Description
------  ----  -----------
0       2/4   Magic: "FINS", "INS2" (skip 4 bytes), or "INST"
...     2     version (u16LE)
...     1     chipType (u8)
...     ...   Feature blocks (terminated by "EN" or 0x00 0x00):
              Each block: featCode(2) + featSize(u16LE) + featData
  "NA"/"NM" — instrument name (string of featSize bytes)
  "FM"      — FM operator data (see FM feature below)
  "WV"/"WL"/"LW" — wave pointers
```

**FM Feature:**
```
flags (u8):  bits[3:0] = opCount, bits[7:4] = opEnabled mask
algorithm (u8, masked to 0x07)
feedback (u8, masked to 0x07)
reserved (2)
opCount × operator: MULT, DT, TL, AR, DR, SL, RR, SSG (1 byte each)
```

---

## .fuw — Furnace Wavetable File

### Detection

```
buf[0..15] == "-Furnace waveta-"
```

### Layout

```
Offset  Size  Description
------  ----  -----------
0       16    Magic: "-Furnace waveta-"
16      2     version (u16LE)
18      2     reserved
20      4     "WAVE" magic
24      4     block size (u32LE)
28      1     name length (usually 0)
29      len   name bytes (if nameLen > 0)
...     4     wavetable length (i32LE, 1–256)
...     4     min value (i32LE)
...     4     max value (i32LE)
...     length×4  sample data (i32LE each)
```

---

## Chip Type Mapping

See `DefleMask.md` for the system/chip mapping shared between Furnace and DefleMask formats.

---

## Reference Implementations

- **Instrument parser:** `src/lib/import/formats/FurnaceParser.ts`
- **Wavetable parser:** `src/lib/import/formats/FurnaceWavetableParser.ts`
- **Furnace source:** `Reference Code/furnace-master/`
