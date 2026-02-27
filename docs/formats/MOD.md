# MOD (ProTracker / Amiga MOD)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MODParser.ts`
**Extensions:** `.mod`, `.nst`, `.wow`, and many tracker-specific variants
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/ProTracker/`

---

## Overview

The MOD format originated on the Amiga with Karsten Obarski's SoundTracker (1987) and was
perfected by ProTracker. It is the foundational tracker format from which XM, IT, S3M and
virtually all later PC tracker formats derive. Files store up to 31 PCM samples and fixed
64-row patterns in a compact binary layout. Channel count and variant are identified by
a 4-byte format tag at offset 1080.

---

## File Layout

### MOD File Structure

```
Offset  Size   Description
------  -----  -----------
0       20     Song title (ASCII, space/null padded)
20      930    Sample headers: 31 × 30 bytes each
950     1      Song length (number of orders, 1–128)
951     1      Restart position (usually 127 in ProTracker; ignored by most players)
952     128    Pattern order table (128 × u8, each value = pattern index 0-based)
1080    4      Format tag ("M.K.", "FLT4", "6CHN", etc.)
1084    ...    Pattern data: patternCount × channelCount × 64 rows × 4 bytes
...     ...    Sample PCM: sequential 8-bit signed data
```

**Pattern count** = max(patternOrderTable) + 1.

---

## Sample Header (30 bytes)

```
Offset  Size  Description
------  ----  -----------
0       22    Sample name (ASCII)
22      2     Length in words (u16BE; multiply by 2 for byte count)
24      1     Finetune: low nibble (0–15); 0–7 = fine up, 8–15 = fine down (stored as 2's complement nibble)
25      1     Volume (0–64)
26      2     Loop start in words (u16BE)
28      2     Loop length in words (u16BE; <= 1 = no loop)
```

---

## Format Tags → Channel Counts

| Tag    | Channels | Tracker       |
|--------|----------|---------------|
| `M.K.` | 4        | ProTracker 1.x (most common) |
| `M!K!` | 4        | ProTracker (>64 patterns) |
| `FLT4` | 4        | StarTrekker 4-channel |
| `FLT8` | 8        | StarTrekker 8-channel |
| `4CHN` | 4        | FastTracker 4-channel |
| `6CHN` | 6        | FastTracker 6-channel |
| `8CHN` | 8        | FastTracker / TakeTracker |
| `OCTA` | 8        | Octalyser |
| `CD81` | 8        | Octalyser / Atari |
| `2CHN` | 2        | FastTracker 2-channel |
| `TDZ1` | 1        | TakeTracker |
| `TDZ2` | 2        | TakeTracker |
| `TDZ3` | 3        | TakeTracker |
| `nnCH` | nn       | FastTracker (nn = 10, 12, ... 32) |

---

## Detection Algorithm

```
1. buf.byteLength >= 1084
2. buf[1080..1083] in known format tag set
   OR buf[1080..1082] matches /\d\dCH/ (FastTracker multichannel)
```

---

## Pattern Cell Encoding (4 bytes per cell)

```
byte 0: aaaa bbbb  — aa = instrument high nibble (bits 4-7), bbbb = period high nibble (bits 0-3)
byte 1: cccc cccc  — period low byte
byte 2: dddd eeee  — dd = instrument low nibble (bits 4-7), eeee = effect command (bits 0-3)
byte 3: ffff ffff  — effect parameter

period = ((byte0 & 0x0F) << 8) | byte1
instrument = (byte0 & 0xF0) | (byte2 >> 4)
effect = byte2 & 0x0F
param = byte3
```

**Amiga period to MIDI note:**
Standard ProTracker period table maps octave 0–3 with C = 856, C# = 808, D = 762... etc.
Period 0 = no note. Finetune adjusts the period by ±1.5 semitones.

---

## Effects (ProTracker)

| Code | Name | Description |
|------|------|-------------|
| 0 | Arpeggio | Cycles between note, note+x, note+y |
| 1 | Porta up | Pitch slide up |
| 2 | Porta down | Pitch slide down |
| 3 | Porta to note | Glide to target pitch |
| 4 | Vibrato | Pitch LFO |
| 5 | Porta + vol slide | Combined portamento + volume |
| 6 | Vibrato + vol slide | Combined vibrato + volume |
| 7 | Tremolo | Volume LFO |
| 8 | Panning | Set pan (0-FF) |
| 9 | Sample offset | Jump to position in sample |
| A | Volume slide | Linear ramp up/down |
| B | Jump to pattern | Order table jump |
| C | Set volume | 0-64 |
| D | Pattern break | Break to next pattern at row |
| E | Extended | Sub-effects E0x-EFx |
| F | Set speed | Speed (1-31) or BPM (32-255) |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MODParser.ts`
- **Specification:** Amiga MOD format documentation (Amiga hardware programming guides)
