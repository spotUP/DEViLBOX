# Imago Orpheus

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/ImagoOrpheusParser.ts`
**Extensions:** `*.imf`
**Reference:** `Reference Code/openmpt-master/soundlib/Load_imf.cpp`

---

## Overview

Imago Orpheus is a PC DOS tracker supporting up to 32 channels, multi-sample
instruments with envelopes, and a rich effect set. The format is identified by
the 4-byte magic `"IM10"` at offset 60 within the 576-byte file header.

---

## File Layout

### IMFFileHeader (576 bytes)

```
Offset  Size  Description
------  ----  -----------
+0      32    title — song name (null-terminated)
+32     2     ordNum — number of orders (uint16LE)
+34     2     patNum — number of patterns (uint16LE)
+36     2     insNum — number of instruments (uint16LE)
+38     2     flags (uint16LE; bit 0 = linear slides)
+40     8     unused1
+48     1     tempo — initial speed (Axx)
+49     1     bpm — initial BPM (Txx, 32–255)
+50     1     master — master volume (0–64)
+51     1     amp — amplification (4–127)
+52     8     unused2
+60     4     "IM10" magic
+64     512   channels[32] — 32 × IMFChannel (16 bytes each)
```

### After Header

```
orders[256]          uint8 order list (0xFF = end)
patNum × pattern chunks:
  length  uint16LE  total chunk size in bytes (includes 4-byte header)
  numRows uint16LE  row count
  packed row data   variable-length
insNum × IMFInstrument (384 bytes each)
For each instrument: smpNum × IMFSample (64 bytes) + raw PCM data
```

---

## Pattern Row Encoding

```
0x00          → next row
mask & 0x1F   = channel (0-based)
mask & 0x20   → note (uint8) + instrument (uint8) follow
mask & 0xC0 == 0x40  → effect1 (cmd+data, 2 bytes)
mask & 0xC0 == 0x80  → effect2 (cmd+data, 2 bytes)
mask & 0xC0 == 0xC0  → both effects (4 bytes)
```

Note encoding: `0xA0` = key-off; `0xFF` = empty; else `(note >> 4) × 12 + (note & 0x0F) + 13`.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ImagoOrpheusParser.ts`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_imf.cpp`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

PCM samples are extracted per-instrument and played via the Sampler engine. The
`"IM10"` magic at offset 60 is the primary detection signal.
