# ICE Tracker / SoundTracker 2.6

**Status:** NATIVE_SAMPLER — PCM samples extracted; plays via Sampler engine
**Parser:** `src/lib/import/formats/ICEParser.ts`
**Extensions:** `*.ice` / magic-based (no standard prefix)
**UADE name:** (no UADE; native PCM extraction)
**Reference files:** (rare)
**Reference:** `Reference Code/openmpt-master/soundlib/Load_ice.cpp`

---

## Overview

ICE Tracker and SoundTracker 2.6 are closely related ProTracker-derived formats
identified by a 4-byte magic at offset 1464 (immediately after the standard
31-sample MOD header + 128-order track reference table). Two sub-variants:

- **SoundTracker 2.6** — magic `"MTN\0"` at offset 1464
- **Ice Tracker 1.0 / 1.1** — magic `"IT10"` at offset 1464

The file layout mirrors the KRIS/ChipTracker design: a standard 31-sample ProTracker
header, followed by a 128×4 track reference table, then the magic, then track data
and sample PCM.

---

## File Layout

```
Offset  Size         Description
------  ----         -----------
0       20           Song name (space-padded ASCII)
20      31 × 30      Sample headers (31 entries × 30 bytes each):
                     +0  name[22]     (sample name, ASCII)
                     +22 length       (uint16 BE, in words)
                     +24 finetune     (int8)
                     +25 volume       (uint8, 0-64)
                     +26 loopStart    (uint16 BE, in words)
                     +28 loopLen      (uint16 BE, in words)
950     1            numOrders (uint8, 1-128)
951     1            numTracks (uint8): total reusable tracks in file
952     128 × 4      Track reference table:
                     trackRefs[orderIdx × 4 + channel] = track index (uint8)
1464    4            Magic: "MTN\0" (0x4D544E00) or "IT10" (0x49543130)
1468    numTracks × 256  Track data: 64 rows × 4 bytes per row per track
                     Row cell: note(1) + instrument(1) + effect type(1) + effect(1)
1468 + tracks×256   ...   Sample PCM data: 8-bit signed, sequential
```

**Minimum file size:** 1468 bytes (header + magic, no tracks or samples).

---

## Detection Algorithm

```
1. buf.length >= 1468
2. u32BE(1464) == 0x4D544E00  → "MTN\0" (SoundTracker 2.6)
   OR
   u32BE(1464) == 0x49543130  → "IT10" (Ice Tracker)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ICEParser.ts`
- **OpenMPT:** `Reference Code/openmpt-master/soundlib/Load_ice.cpp`
- **AmigaUtils:** `src/lib/import/formats/AmigaUtils.ts` (`createSamplerInstrument`, `periodToNoteIndex`)

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

The parser extracts sample headers and PCM data from the file, creating
`SamplerSynth` instruments. The track reference table (128×4 channel mapping)
is used to build the song pattern order.

**Relationship to KRIS/ChipTracker:** ICE uses the same file layout region
(song name + 31 sample headers + 128×4 order table) but places its magic at
offset 1464 rather than offset 952. KRIS uses `"KRIS"` at 952 (before the order
table). ICE uses `"MTN\0"` or `"IT10"` at 1464 (after the order table).
