# STM (ScreamTracker 2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/STMParser.ts`
**Extensions:** `.stm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/ScreamTracker 2/`

---

## Overview

ScreamTracker 2 is an early PC DOS 4-channel tracker format by Future Crew. It
predates ScreamTracker 3 (S3M) and uses a simpler 4-channel structure with 31
samples. Multiple tracker name strings identify which tool created the file.

Reference: OpenMPT `Load_stm.cpp`

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       20    songname (null-padded ASCII)
20      8     trackerName: one of:
              "!Scream!" — ScreamTracker 2
              "BMOD2STM" — BMOD2STM converter
              "WUZAMOD!" — WuzaMOD converter
              "SWavePro" — SWavePro converter
28      1     dosEof (0x1A) — DOS end-of-file marker
29      1     filetype (must be 0x02 = module)
30      1     verMajor (must be 2)
31      1     verMinor (0, 10, 20, or 21)
32      1     initTempo: high nibble = ticks/row, low nibble = tempo factor
33      1     numPatterns (0–64)
34      1     globalVolume (0–64)
35      13    reserved
48      992   31 × STMSampleHeader (32 bytes each):
              +0   filename[12]    (null-padded)
              +12  zero (u8)       — must be 0 (or 46 for legacy quirk)
              +13  disk (u8)       — legacy disk number (ignored)
              +14  offset (u16LE)  — file offset = value << 4
              +16  length (u16LE)  — sample length in bytes
              +18  loopStart (u16LE)
              +20  loopEnd (u16LE)
              +22  volume (u8)     — 0–64
              +23  reserved2 (u8)
              +24  sampleRate (u16LE)
              +26  reserved3[6]
1040    ...   Order list: 64 bytes (verMinor==0) or 128 bytes
              Values 99 or 255 = end-of-song
...     ...   Pattern data: numPatterns × 1024-byte blocks
              (64 rows × 4 channels × 4 bytes)
...     ...   Sample PCM data at absolute file offsets (sampleHeader.offset << 4)
```

---

## Detection Algorithm

```
1. buf[20..27] in { "!Scream!", "BMOD2STM", "WUZAMOD!", "SWavePro" }
2. buf[28] == 0x1A  (DOS EOF marker)
3. buf[29] == 0x02  (module type)
4. buf[30] == 2     (major version)
```

---

## Pattern Cell Encoding (4 bytes per cell)

```
byte 0: STM note byte
  0x00–0x5F → pitched note: octave = noteByte >> 4, semi = noteByte & 0x0F
  0xFB → empty note
  0xFC → note continue
  0xFD, 0xFE → note cut
  XM note = octave * 12 + semitone + 36 + 1

byte 1 (insVol):
  instr   = insVol >> 3
  vol_lo  = insVol & 0x07

byte 2 (volCmd):
  vol_hi  = (volCmd & 0xF0) >> 1
  effType = volCmd & 0x0F
  combined volume = vol_lo | vol_hi  (>64 = no volume)

byte 3 (cmdInf): effect parameter
```

---

## Tempo

The `initTempo` byte packs initial speed and tempo:
```
ticks_per_row = (initTempo >> 4) & 0x0F
tempo_factor  = initTempo & 0x0F
BPM = 125 * tempo_factor / 10  (approximately)
```

---

## Sample Addressing

STM samples use an unusual absolute addressing scheme:
```
file_offset = sampleHeader.offset << 4
```

Each sample starts at a paragraph-aligned (16-byte) file offset stored in the header.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/STMParser.ts`
- **OpenMPT reference:** `soundlib/Load_stm.cpp`

