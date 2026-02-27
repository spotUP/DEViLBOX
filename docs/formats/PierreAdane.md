# Pierre Adane Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PierreAdaneParser.ts`
**Extensions:** `pap.*` (prefix)
**UADE name:** PierreAdanePacker
**Reference files:** (identified in Amiga game collections; e.g. Pang by Ocean, 1990)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PierreAdanePacker/src/Pierre Adane Packer.AMP_2.asm`

---

## Overview

Pierre Adane Packer is a proprietary 4-channel Amiga music format by Pierre Adane (© 1990),
used in games such as Pang (Ocean Software). Files are typically prefixed `pap.*`.

Detection implements the `EP_Check5` routine from the UADE assembly source, performing a
structural consistency check on four header offset words and a sequence table scan.

---

## Detection Algorithm

Based on `EP_Check5` from `Pierre Adane Packer.AMP_2.asm`:

### Step 1 — Read four header words

```
D1 = u16BE(0)   offset to sequence/pattern table
D2 = u16BE(2)   offset to pattern data
D3 = u16BE(4)   offset to sample info table
D4 = u16BE(6)   offset to sample data / end
```

Each must be: **non-zero**, **non-negative** (bit 15 == 0), and **even** (bit 0 == 0).

### Step 2 — Structural gap checks

```
gap43 = D4 - D3   (must be >= 0)
gap32 = D3 - D2   (must be >= 0)
gap43 == gap32    (equal-sized sample-info and pattern blocks)

gap21 = D2 - D1   (must be >= 0)
gap21 - 2 == gap43  (sequence block is gap43 + 2 bytes)
```

### Step 3 — Terminator byte check

```
D4_new = u16BE(buf, D1)   (word at the sequence table start)
buf[D4_new] == 0xFF       (terminator at end-of-header offset)
```

### Step 4 — Sequence table scan

```
scanStart = D1
scanEnd   = D4_orig + gap43    (= D4_orig + (D4_orig - D3_orig))

While scanStart < scanEnd (step 2 bytes):
  entry = u16BE(buf, scanStart)
  entry must be: non-negative (bit 15 == 0), even (bit 0 == 0), <= D1
```

**Minimum file size:** 10 bytes.

---

## Format Notes

The four header words define a fixed-block layout:
```
[0..D1-1]   header block (sequence table + control data)
[D1..D2-1]  sequence/pattern table
[D2..D3-1]  pattern data
[D3..D4-1]  sample info table
[D4..]      sample PCM data
```

The equal gap constraint (`gap43 == gap32`) ensures the pattern-data and sample-info
blocks have matching sizes, which is a structural invariant of this packer format.

The module name is derived from the filename with the `pap.` prefix stripped.
Song name suffix: `[Pierre Adane]`.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PierreAdaneParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PierreAdanePacker/src/Pierre Adane Packer.AMP_2.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `EP_Check5` five-stage structural check (4 offset words + gap equality + terminator +
sequence scan) provides reliable detection. UADE synthesizes audio.
