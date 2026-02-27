---
date: 2026-02-27
topic: jamcracker-format
tags: [amiga, uade, pcm-sampler, chunk-format, format-research]
status: implemented
---

# JamCracker — `.jam` / `.jc` Format

**Status:** Implemented. NATIVE_SAMPLER — full PCM extraction in DEViLBOX.

---

## Overview

JamCracker is an Amiga music format by **Thomas Neumann / The APlayer-Team**. It is a chunk-based
binary format used in several Amiga game soundtracks. Files contain a song name, instrument
definitions (PCM samples or AM synthesis data), pattern data, and a song sequence.

**Extensions:** `.jam`, `.jc`
**Magic bytes:** `42 65 45 70` = ASCII `BeEp` (at offset 0x00)
**UADE player:** `JamCracker`
**Reference files:** ~48 files in `Reference Music/JamCracker/`
**DEViLBOX status:** `NATIVE_SAMPLER` — `JamCrackerParser.ts` + Sampler engine

---

## File Layout

```
Offset    Content
------    -------
0x0000    4 bytes     "BeEp" magic
0x0004    2 bytes     Number of instruments (NOI, uint16 BE)
0x0006    NOI × 40   Instrument info structs (struct InstInfo)
+         2 bytes     Number of patterns (NOP, uint16 BE)
+         NOP × 6    Pattern info structs (struct PattInfo)
+         2 bytes     Song length (SL, uint16 BE)
+         SL × 2     Song table (pattern indices, uint16 BE each)
+         NOP × rows  Pattern data (NOP patterns, variable size)
+                     Sample / AM data (sequentially, NOI entries)
```

---

## Instrument Info (`struct InstInfo`, 40 bytes)

```
Bytes 0–30  (31 bytes)  Name (null-terminated ASCII)
Byte  31    (1 byte)    Flags
                        Bit 0 = 0: No loop / 1: Loop
                        Bit 1 = 0: PCM sample / 1: AM synthesis data
Bytes 32–35 (uint32 BE) Size of sample or AM data in bytes
Bytes 36–39             Address pointer (runtime; NOT a file offset — must be resolved)
```

The `it_address` field is zero in the file; the parser must accumulate sizes to find each
sample's file offset (samples are stored sequentially after all patterns).

**Detecting AM vs PCM instruments:** `flags & 0x02` — if set, the data is AM synthesis
(additive synthesis waveform tables), not PCM audio.

---

## Pattern Info (`struct PattInfo`, 6 bytes)

```
Bytes 0–1  (uint16 BE) Pattern size in bytes
Bytes 2–5              Address pointer (runtime; resolve at parse time)
```

Patterns are stored sequentially after the song table. The parser accumulates `pt_size` bytes
to locate each pattern in the file.

---

## Note Format (`struct NoteInfo`, 8 bytes per note per channel)

```
Byte 0: nt_period     — Amiga period table index (0 = no note)
Byte 1: nt_instr      — Signed instrument number (0 = keep previous, <0 = no note)
Byte 2: nt_speed      — Playback speed / tempo change
Byte 3: nt_arpeggio   — Arpeggio semitone offsets
Byte 4: nt_vibrato    — Vibrato depth/speed
Byte 5: nt_phase      — Phase modulation
Byte 6: nt_volume     — Channel volume (0–64)
Byte 7: nt_porta      — Portamento speed
```

Patterns use a variable number of channels (4 channels typical) × variable row count.
Pattern size = `(pt_size / 8)` rows × 8 bytes per note × N channels.

---

## Sample Data

After all patterns and the song table, sample/AM data is stored sequentially:
- `inst[0].data` starts at fileOffset after all patterns
- `inst[1].data` starts at `inst[0].data + inst[0].it_size`
- etc.

For PCM samples (`flags & 0x02 == 0`):
- **Format:** 8-bit signed, mono, Amiga standard
- **Looping:** controlled by `flags & 0x01`; if set, sample loops from start to end

For AM data (`flags & 0x02 == 1`):
- Contains AM synthesis tables (not PCM)
- Not extractable as simple PCM; UADE handles AM synthesis

---

## Instrument Parameters

| Parameter | Notes |
|-----------|-------|
| Volume | 64 = maximum (Amiga standard) |
| Loop | `flags & 0x01` — simple start-to-end loop |
| Playback rate | Period-based; C-3 = period 214 → 8287 Hz (PAL) |

---

## DEViLBOX Implementation

### Parser: `src/lib/import/formats/JamCrackerParser.ts`

- Detects `BeEp` magic at offset 0
- Parses NOI instrument infos (name, flags, size)
- Parses NOP pattern infos and song table
- Reads pattern data (variable size per pattern)
- Extracts sample data sequentially; calls `createSamplerInstrument()` for PCM instruments
- AM instruments (bit 1 set) are detected but receive placeholder instruments (no native AM engine)

### Routing: `src/lib/import/parseModuleToSong.ts`

```
.jam / .jc → JamCrackerParser (native) → Sampler instruments
             UADE fallback if parse fails
```

---

## Reference

- `Reference Music/JamCracker/` — test corpus (~48 files)
- `Reference Code/uade-3.05/players/JamCracker` — UADE eagleplayer binary
- Format spec by Thomas Neumann / The APlayer-Team (see `docs/formats/JamCracker.txt`)

---

## Format Variants

| Variant | Description |
|---------|-------------|
| Standard | PCM samples only |
| AM variant | Uses AM synthesis data (bit 1 of flags) — UADE synthesis only |
