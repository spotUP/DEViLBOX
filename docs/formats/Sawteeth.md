# Sawteeth

**Status:** NATIVE_SAMPLER (software synth tracker) — fully parsed natively; software synth instruments (no PCM)
**Parser:** `src/lib/import/formats/SawteethParser.ts`
**Extensions:** `.st` (binary "SWTD" variant only; text "SWTT" variant not supported)
**UADE name:** N/A (native parser)
**Reference files:** `Reference Music/Sawteeth/`
**Reference implementation:** NostalgicPlayer `SawteethWorker.cs`

---

## Overview

Sawteeth is a software-synthesizer-based Amiga/PC music tracker. Unlike PCM-sample formats,
all instruments are defined as synthesis algorithms (filter envelopes, amplifier envelopes,
waveform sequences, vibrato, PWM, resonance). There are no raw sample buffers.

Two file variants exist:
- **SWTD** — binary format (this parser)
- **SWTT** — ASCII/text format (not supported)

The format is big-endian.

Reference: `Reference Code/NostalgicPlayer/Source/Agents/Players/SawteethPlayer/SawteethWorker.cs`

---

## File Layout

### Magic and Version (offset 0)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "SWTD" (0x53 0x57 0x54 0x44)
4       2     stVersion (u16BE; accepted range: 1–1200)
6       2     spsPal (u16BE; only if stVersion >= 900; else hardcoded 882)
```

**Version history:**
- v1–899: Channel steps = 3 bytes; instrument Len/Loop packed in 1 byte
- v900–909: `spsPal` field added
- v910–1199: `lLoop` field added per channel
- v1200: `rLoop` field added per channel

---

## Channel Records

```
channelCount (u8)  → 1–12 channels

Per channel:
  left    (u8)  — panning left  (Amiga-style)
  right   (u8)  — panning right
  len     (u16BE) — step count (1–8192)
  lLoop   (u16BE) — loop start (only if stVersion >= 910; else 0)
  rLoop   (u16BE) — loop end   (only if stVersion >= 1200; else len-1)

  len × ChStep:
    part   (u8)  — part index reference
    transp (s8)  — semitone transpose (signed)
    dAmp   (u8)  — amplitude delta
```

---

## Part Records

```
partCount (u8)  → number of parts (>= 1)

Per part:
  sps  (u8)  — steps per second (>= 1)
  len  (u8)  — row count (>= 1)
  len × Step:
    ins   (u8)  — instrument index
    eff   (u8)  — effect code
    note  (u8)  — note (1-based XM note or 0=empty)
```

---

## Instrument Records

```
instrumentCountRaw (u8)  → actual count = raw + 1 (index 0 is dummy)

Per instrument (index 1..count-1):
  filterPoints (u8 >= 1)
  filterPoints × { time(u8), lev(u8) }
  ampPoints (u8 >= 1)
  ampPoints × { time(u8), lev(u8) }
  filterMode      (u8)
  clipMode_boost  (u8): boost = bits[3:0], clipMode = bits[7:4]
  vibS, vibD, pwmS, pwmD, res, sps (u8 each)

  if stVersion < 900:
    1 byte combined: len = tmp & 0x7F; loop = (tmp&1) ? 0 : len-1
  else:
    len  (u8 >= 1)
    loop (u8; must be < len)

  len × InsStep:
    combined (u8): bit7 = relative, bits[3:0] = waveform
    note     (u8)
```

---

## Break Points and Names

```
breakPCount (u8)
breakPCount × 8 bytes  (pal + command, skip)

Names (null/LF-terminated ASCII strings):
  moduleName, author, part[0..n-1].name, ins[1..n-1].name
```

---

## Detection Algorithm

```
buf[0..3] == "SWTD"   (0x53 0x57 0x54 0x44)
buf.length >= 10
stVersion (u16BE at 4) <= 1200
```

**Minimum file size:** 10 bytes.

---

## Implementation Notes

This is a fully native parser — no UADE required. Instruments are software synth
descriptions, not PCM data. The parser expands channel step sequences (part references +
transpose) into a flat row grid, emitting one DEViLBOX pattern per 64 rows.

`synthType` is `'Synth'` for all instruments, reflecting the software-synthesis nature of
the format.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SawteethParser.ts`
- **NostalgicPlayer reference:** `Reference Code/NostalgicPlayer/Source/Agents/Players/SawteethPlayer/SawteethWorker.cs`
