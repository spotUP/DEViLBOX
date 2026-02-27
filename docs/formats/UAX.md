# UAX (Unreal Audio Package)

**Status:** NATIVE_SAMPLER — PCM extracted (WAV/VOC blobs), plays via Sampler engine
**Parser:** `src/lib/import/formats/UAXParser.ts`
**Extensions:** `.uax`, `.umx`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Unreal/`

---

## Overview

UAX files are Unreal Engine package files containing sound objects. The format is a
general Unreal package container (`\xC1\x83\x2A\x9E` magic) that can also contain music
(UMX). The UAX parser reads the name table, export table, and import table to locate
`Sound` class objects, then extracts the raw embedded audio data (WAV, VOC, or other
format) from each.

Reference: OpenMPT `soundlib/Load_uax.cpp`, `soundlib/UMXTools.cpp`

---

## File Layout

### Package File Header (36 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: \xC1\x83\x2A\x9E
4       2     packageVersion (u16LE)
6       2     licenseMode (u16LE)
8       4     flags (u32LE)
12      4     nameCount (u32LE)
16      4     nameOffset (u32LE, file offset of name table)
20      4     exportCount (u32LE)
24      4     exportOffset (u32LE)
28      4     importCount (u32LE)
32      4     importOffset (u32LE)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 36
2. buf[0..3] == \xC1\x83\x2A\x9E
3. nameOffset >= 36, exportOffset >= 36, importOffset >= 36
4. nameCount > 0 and nameCount <= UINT32_MAX/5
5. exportCount > 0 and exportCount <= UINT32_MAX/8
6. Name table contains the string "sound" (case-insensitive)
```

---

## Compressed Index Integers (ReadIndex)

Variable-length signed integers used in table entries:

```
Byte 0: bit7=sign, bit6=continue, bits5-0 = value bits[5:0]
Remaining: bit7=continue, bits6-0 = value bits
Accumulate with left-shift; apply sign at end.
```

---

## Name Table Entries

**packageVersion >= 64:**
```
ReadIndex() length + zero-terminated string + u32LE flags
```

**packageVersion < 64:**
```
Zero-terminated string + u32LE flags
```

---

## Export Table Entries

```
ReadIndex() ~objClass    — bitwise NOT = index into import table (gets class name)
ReadIndex() obj-parent
if version >= 60: u32LE package; else ReadIndex() package
ReadIndex() obj-name     — index into name table
u32LE flags
ReadIndex() obj-size
ReadIndex() obj-offset   — file offset of object data
```

---

## Sound Object Data (at obj-offset)

Version-dependent prefix bytes to skip before the raw audio:

```
version < 40:  skip 8 bytes
version < 60:  skip 16 bytes
ReadIndex() property-name (discard)
version >= 120: ReadIndex() + skip 8 bytes (UT2003)
version >= 100: skip 4 + ReadIndex() + skip 4 (AAO)
version >= 62:  ReadIndex() + skip 4 (UT)
else:           ReadIndex() (old Unreal)
ReadIndex() data-size → read data-size bytes = embedded audio blob
```

The extracted audio blob is typically a WAV or VOC file.

---

## Output Structure

The parser creates one TrackerSong with:
- One instrument per found Sound object
- Each instrument backed by the extracted PCM (WAV decoded if recognized)
- An empty 64-row pattern referencing instruments sequentially

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/UAXParser.ts`
- **OpenMPT reference:** `soundlib/Load_uax.cpp`, `soundlib/UMXTools.cpp`
- **Documentation:** Unreal Package File Format (beyondunreal.com/Legacy:Package_File_Format)
