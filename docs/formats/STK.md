# STK (Ultimate SoundTracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/STKParser.ts`
**Extensions:** `.stk`, early `.mod` files
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/SoundTracker/`

---

## Overview

Ultimate SoundTracker (UST) by Karsten Obarski (1987) is the original Amiga tracker that
spawned the entire MOD format lineage. It predates ProTracker and uses only 15 samples
(not 31). The format has no magic bytes — detection is purely heuristic based on file
structure, sample counts, and absence of the ProTracker "M.K." tag.

Reference: OpenMPT `soundlib/Load_stk.cpp`, `MODTools.h`

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       20    Song name (space-padded ASCII)
20      450   15 × MOD sample headers (30 bytes each, same as ProTracker)
470     130   File header:
              numOrders (u8)
              restartPos/tempo (u8) — encodes CIA timing in early UST versions
              orderList[128] (u8 each)
600     ...   Pattern data: N × 64 rows × 4 channels × 4 bytes/cell
...     ...   Sample PCM: sequential 8-bit signed
```

**Total header block: 600 bytes** (20 + 15×30 + 130)

---

## Detection Algorithm

Heuristic (no magic bytes):

```
1. buf.byteLength >= 600
2. buf[1080..1083] NOT in any known format tag (not "M.K.", "M!K!", "FLT4", etc.)
3. All 15 sample headers pass sanity checks:
   - finetune == 0 (UST doesn't use finetune)
   - volume in [0, 64]
   - loopStart in [0, length]
   - loopLength in [1, length]
   - Sample name has ≤ 2 non-printable bytes (dirt check)
4. Pattern count derived from order table max value is plausible
5. File size is consistent with pattern + sample data
```

---

## Sample Header (30 bytes — identical to ProTracker MODSampleHeader)

```
Offset  Size  Description
------  ----  -----------
0       22    name[22] (ASCII, may contain disk path references in early files)
22      2     length (u16BE, in words; × 2 = bytes)
24      1     finetune (u8, should be 0 in UST files)
25      1     volume (u8, 0–64)
26      2     loopStart (u16BE, in bytes)
28      2     loopLength (u16BE, in words; × 2 = bytes; 1 = no loop)
```

---

## Pattern Cell Encoding (4 bytes — identical to ProTracker MOD)

```
byte 0: (sampleHi << 4) | (period >> 8)
byte 1: period & 0xFF
byte 2: (sampleLo << 4) | effect
byte 3: effectParam

sample = (sampleHi << 4) | sampleLo  (1–15)
period = full Amiga period value
effect = lower nibble of byte 2
```

---

## Tempo (restartPos field)

In UST files, the `restartPos` field (offset 471) is repurposed for CIA-based tempo in
some versions. In later versions it's the restart position (as in ProTracker). Values in
the range 0x78–0xFF are typically tempo values; others are restart positions.

---

## Differences from ProTracker MOD

| Feature | UST/STK | ProTracker MOD |
|---------|---------|----------------|
| Sample count | 15 | 31 |
| Magic tag | None | "M.K." at offset 1080 |
| Finetune | Always 0 | 0–15 |
| Channel panning | LRRL | LRRL |
| Effects | Subset only | Full ProTracker effect set |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/STKParser.ts`
- **OpenMPT reference:** `soundlib/Load_stk.cpp`, `MODTools.h`
