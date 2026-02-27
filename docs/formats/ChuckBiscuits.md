# Chuck Biscuits (Black Artist)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/ChuckBiscuitsParser.ts`
**Extensions:** `.cba`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Chuck Biscuits/`

---

## Overview

Chuck Biscuits (also known as Black Artist) is an Amiga tracker format used by the
demoscene. It is known to have been used for the Expoze musicdisk by Heretics. The format
is identified by "CBA\xF9" magic at offset 0 and stores 8-bit delta-encoded PCM samples.

Reference: OpenMPT `soundlib/Load_cba.cpp`

---

## File Layout

### File Header (332 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "CBA\xF9" (0x43, 0x42, 0x41, 0xF9)
4       32    title[32] (ASCII, null-padded)
36      1     eof (must be 0x1A)
37      2     messageLength (u16LE, song message length in bytes)
39      1     numChannels (u8, 1–32)
40      1     lastPattern (u8, patterns are 0..lastPattern)
41      1     numOrders (u8)
42      1     numSamples (u8)
43      1     speed (u8, initial ticks/row, must be > 0)
44      1     tempo (u8, initial BPM, must be >= 32)
45      32    panPos[32] (u8 per channel: 0=left, 128=center, 255=right)
77      255   orders[255] (u8 each; 0xFF = end, 0xFE = loop marker)
```

### After Header

```
numSamples × 48 bytes  — sample headers (CBASampleHeader)
messageLength bytes    — song message text
(lastPattern+1) × 64 × numChannels × 5 bytes — pattern data
numSamples × sampleLength bytes — 8-bit delta PCM
```

---

## Detection Algorithm

```
1. buf.byteLength >= 332
2. buf[0..3] == "CBA\xF9"  (0x43, 0x42, 0x41, 0xF9)
3. buf[36] == 0x1A  (DOS EOF marker)
```

---

## Sample Header (48 bytes — CBASampleHeader)

```
Offset  Size  Description
------  ----  -----------
0       32    name[32] (ASCII)
32      1     flags (u8): bit 3 = loop active
33      1     volume (u8, 0–64)
34      2     sampleRate (u16LE, Hz at C)
36      4     length (u32LE, in bytes)
40      4     loopStart (u32LE, in bytes)
44      4     loopEnd (u32LE, in bytes)
```

Sample PCM is 8-bit delta-encoded: each stored byte is the delta (difference) between
adjacent samples; integrate to reconstruct.

---

## Pattern Cell Encoding (5 bytes per cell)

```
byte 0: instr   — instrument number (1-based; 0 = no instrument)
byte 1: note    — 0 = no note; 255 = note cut; 1-96 → XM note = 12 + note
byte 2: vol     — 0 = no volume change; 1–65 → volume = vol - 1 (0–64)
byte 3: command — effect command:
                  0 = none
                  1–0x0E → MOD effect (command - 1)
                  0x0F = Funky sync (dummy, skip)
                  0x10–0x1E → MOD extended effect (Exy)
                  0x1F = set speed
                  0x20 = set tempo (BPM)
byte 4: param   — effect parameter
```

---

## Panning

Per-channel panning is stored in `panPos[ch]`:
- 0 = full left
- 128 = center
- 255 = full right

Conversion: `xmPan = panPos[ch] * 2` (maps to OpenMPT 0–512 range).

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ChuckBiscuitsParser.ts`
- **OpenMPT reference:** `soundlib/Load_cba.cpp`
