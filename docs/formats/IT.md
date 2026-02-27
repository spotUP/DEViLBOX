# IT (Impulse Tracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/ITParser.ts`
**Extensions:** `.it`, `.mptm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/ImpulseTracker/`

---

## Overview

Impulse Tracker by Jeffrey Lim (1995) is the most powerful of the classic PC DOS trackers.
It added true stereo, 64 channels, new note actions (NNA), instrument mode with full envelope
sets (volume, panning, pitch), IT sample compression (ITSS), and a complete effect system.
The `.mptm` extension is used by OpenMPT for extended IT files.

Reference: OpenMPT `soundlib/Load_it.cpp`

---

## File Layout

### IT File Header (192 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "IMPM"
0x04    26    Song name (ASCII, null-padded)
0x1E    2     Highlight: (rowsPerBeat << 8) | rowsPerMeasure
0x20    2     ordNum (u16LE) — number of orders
0x22    2     insNum (u16LE) — number of instruments
0x24    2     smpNum (u16LE) — number of samples
0x26    2     patNum (u16LE) — number of patterns
0x28    2     cwtv (u16LE) — created-with tracker version
0x2A    2     cmwt (u16LE) — compatible-with tracker version
0x2C    2     flags (u16LE):
              bit 2: use instruments (else samples)
              bit 3: linear slides
              bit 5: old effects
0x2E    2     special (u16LE): bit 0 = message attached
0x30    1     globalvol (u8, 0–128)
0x31    1     mv (u8, mix volume 0–128)
0x32    1     speed (u8, initial ticks/row)
0x33    1     tempo (u8, initial BPM)
0x34    1     sep (u8, panning separation)
0x35    1     pwd (u8, pitch wheel depth)
0x36    2     msglength (u16LE)
0x38    4     msgoffset (u32LE, file offset of message)
0x3C    4     reserved (u32)
0x40    64    chnpan[64] (0–64 = L→R, 100 = surround, +128 = disabled)
0x80    64    chnvol[64] (0–64)
```

### Offset Tables (at 0xC0 = 192)

```
orders[ordNum]          u8 each (255 = end marker, 254 = skip/+++, else pattern index)
instOffsets[insNum]     u32LE each (file offsets to instrument headers)
sampleOffsets[smpNum]   u32LE each (file offsets to sample headers)
patternOffsets[patNum]  u32LE each (file offsets to pattern data; 0 = empty pattern)
```

---

## Sample Header (80 bytes, "IMPS" magic)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "IMPS"
0x04    12    Filename[12]
0x10    1     Reserved (0)
0x11    1     gvl (global volume, 0–64)
0x12    1     flags:
              bit 0: sample data exists
              bit 1: 16-bit
              bit 2: stereo
              bit 3: compressed (ITSS)
              bit 4: loop
              bit 5: sustain loop
              bit 6: ping-pong loop
              bit 7: ping-pong sustain
0x13    1     vol (default volume, 0–64)
0x14    26    Name[26] (ASCII)
0x2E    1     cvt (0x01 = signed; 0x00 = unsigned)
0x2F    1     dfp (panning: bit7=use, bits 0–5 = 0–63)
0x30    4     length (u32LE, in samples)
0x34    4     loopbegin (u32LE)
0x38    4     loopend (u32LE)
0x3C    4     C5Speed (u32LE, Hz at middle C)
0x40    4     susloopbegin (u32LE)
0x44    4     susloopend (u32LE)
0x48    4     samplepointer (u32LE, file offset)
0x4C    1     vis (vibrato speed)
0x4D    1     vid (vibrato depth)
0x4E    1     vir (vibrato rate)
0x4F    1     vit (vibrato type: 0=sine, 1=ramp, 2=square, 3=random)
```

---

## Instrument Header (554 bytes, "IMPI" magic)

Used only when `flags & 0x04` and `cmwt >= 0x200`.

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "IMPI"
0x04    12    Filename[12]
0x10    1     Reserved
0x11    1     nna (new note action: 0=cut,1=continue,2=note-off,3=fade)
0x12    1     dct (duplicate check type)
0x13    1     dca (duplicate check action)
0x14    2     fadeout (u16LE, 0–128)
0x16    1     pps (pitch/pan sep)
0x17    1     ppc (pitch/pan centre)
0x18    1     gbv (global volume, 0–128)
0x19    1     dfp (default panning: bit7=use, bits 0-6 = 0–64)
0x1A    2     rv, rp (random vol/pan variation)
0x1C    2     trkver (tracker version)
0x1E    1     nos (number of samples)
0x1F    1     reserved
0x20    26    Name[26]
0x3A    1     ifc (initial filter cutoff)
0x3B    1     ifr (initial filter resonance)
0x3C    1     mch (MIDI channel)
0x3D    1     mpr (MIDI program)
0x3E    2     midibank (u16LE)
0x40    240   keyboard[240]: note[120] + sample1based[120]
0x130   82    volenv
0x182   82    panenv
0x1D4   82    pitchenv
```

### Envelope (82 bytes)

```
Offset  Size  Description
------  ----  -----------
0       1     flags: bit0=on, bit1=loop, bit2=sustain
1       1     num (number of points, 1–25)
2       1     loopbegin
3       1     loopend
4       1     susloopbegin
5       1     susloopend
6       1     reserved
7       75    nodes[25] × {value(i8) + tick(u16LE)} = 3 bytes each
```

---

## Detection Algorithm

```
1. buf.byteLength >= 4
2. buf[0..3] == "IMPM"
```

---

## Pattern Format

```
Per pattern:
  dataSize (u16LE) — packed data size
  numRows  (u16LE) — number of rows (1–200)
  reserved (u32LE)
  data[dataSize]:
    Channel variable byte: if 0 → end of row; else:
      bits 0–6 = channel index (1-based; 0 = use last channel variable)
      bit 7 = more follows

    Mask byte (follows if this is a new channel variable or bit7 set):
      bit 0: note
      bit 1: instrument
      bit 2: volume/panning
      bit 3: effect+param
      bit 4: repeat last note
      bit 5: repeat last instrument
      bit 6: repeat last volume
      bit 7: repeat last effect+param

    Data bytes as flagged by mask.
```

---

## IT Compression (ITSS)

IT compressed samples use a modified DPCM scheme. Compression is identified by
`sampleFlags & 0x08`. The format uses adaptive bit-width coding with special values for
width changes: 0 or 1 (8-bit) / 0 (16-bit) trigger width adjustments.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ITParser.ts`
- **OpenMPT reference:** `soundlib/Load_it.cpp`
- **Specification:** Impulse Tracker technical specification (ITTECH.TXT)
