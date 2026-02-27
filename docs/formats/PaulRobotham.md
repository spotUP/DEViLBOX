# Paul Robotham

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PaulRobothamParser.ts`
**Extensions:** `dat.*` (prefix-based)
**UADE name:** PaulRobotham
**Reference files:** `Reference Music/Paul Robotham/` (17 files)
**Replayer reference:** `Reference Code/uade-3.05/players/PaulRobotham`

---

## Overview

Paul Robotham is an Amiga music format by Paul Robotham / Pete Barnett, used in
games such as *Starlord* (Microprose, 1994). Files use the `dat.*` filename prefix
and contain a structured binary with voice, sequence, pattern, and instrument tables.

Detection is a rigorous structural validation matching the `EP_Check5` / `DTP_Check2`
routines in the Wanted Team eagleplayer assembly source.

---

## File Layout

```
Offset  Size     Description
------  ----     -----------
0x00    2        voiceCount: number of voices (D1). High byte must be 0. Range: 1–4.
0x02    2        seqPtrCount: number of sequence pointers (D2). High byte must be 0.
0x04    2        patPtrCount: number of pattern pointers (D3). High byte must be 0.
0x06    2        instrCount: number of instruments (D4).
0x08    D1×4     Voice start-position table.
                 Each entry: upper word == 0; lower word != 0 (absolute pointer).
?       D2×4     Sequence pointer table.
                 Each entry: non-zero, non-negative (>= 0), even.
?       D3×4     Pattern pointer table.
                 Each entry: non-zero, non-negative (>= 0), even.
                 First entry saved as D2_ref (used for structural verification).
?       D4×12    Instrument records (12 bytes each).
?       127×2    Sequence data: all 127 words must equal 0x3F3F.
```

**Structural verification:** The byte offset of the first word after the instrument
table (relative to file start) must exactly equal `D2_ref` (the first pattern pointer
value). This ensures the header sizes and pointer arithmetic are consistent.

---

## Detection Algorithm

```
1. voiceCount  = u16BE(0); require high byte == 0 and 1 <= low byte <= 4
2. seqPtrCount = u16BE(2); require high byte == 0
3. patPtrCount = u16BE(4); require high byte == 0
4. instrCount  = u16BE(6)

5. Voice table: voiceCount × 4 bytes starting at offset 8
   Each entry: u32BE(entry) must have upper word == 0 and lower word != 0

6. Sequence pointer table: seqPtrCount × 4 bytes
   Each entry: u32BE != 0, non-negative, even

7. Pattern pointer table: patPtrCount × 4 bytes
   D2_ref = first pattern pointer value
   Each entry: u32BE != 0, non-negative, even

8. Instrument table: instrCount × 12 bytes

9. Structural check:
   currentOffset (= offset of byte after instrument table) == D2_ref

10. Sentinel check:
    127 consecutive u16BE values at (base + D2_ref) must all == 0x3F3F
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PaulRobothamParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PaulRobotham/src/Paul Robotham.AMP.asm`
- **UADE player:** `Reference Code/uade-3.05/players/PaulRobotham`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the Paul Robotham binary structure and routes playback to UADE.
The `dat.*` prefix is the primary routing key. Placeholder instruments are emitted;
the format does not encode human-readable sample names in a standard location.

The `0x3F3F` sentinel (ASCII `??`) appears to be a fill pattern used by the Paul
Robotham / Pete Barnett music system to pad sequence data.
