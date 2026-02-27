# Karl Morton Music Format

**Status:** NATIVE_SAMPLER — PCM samples extracted; plays via Sampler engine
**Parser:** `src/lib/import/formats/KarlMortonParser.ts`
**Extensions:** `.mus` (extension-based)
**UADE name:** (no UADE; native PCM extraction)
**Reference files:** (Amiga game music — Psycho Pinball, Micro Machines 2)
**Reference:** NostalgicPlayer `KarlMortonWorker.cs`

---

## Overview

Karl Morton's music engine was used in *Psycho Pinball* and *Micro Machines 2*
(Codemasters). Files use the `.mus` extension and contain an IFF-like chunk stream
with `SONG` and `SMPL` 4-byte chunk identifiers. The format is **little-endian**
(unusual for Amiga formats) and stores 8-bit signed mono PCM samples.

---

## File Layout

Files consist of sequential chunks in any order:

```
Per chunk:
  +0   4   chunk ID (little-endian): "SONG" = 0x474E4F53, "SMPL" = 0x4C504D53
  +4   4   chunk length (uint32 LE): total chunk size including 8-byte header
  +8   ...  chunk payload (length - 8 bytes)
```

### SMPL Chunk (Sample)

```
Payload Offset  Size  Description
--------------  ----  -----------
+0              32    Sample name (null-terminated printable ASCII)
+32             4     loopStart (uint32 LE): loop start offset in PCM data
+36             4     size (uint32 LE): byte length of following PCM data
+40             ...   PCM data: 8-bit signed mono, little-endian
```

### SONG Chunk (Song/Pattern Data)

```
Payload Offset  Size              Description
--------------  ----              -----------
+0              32                Song name (null-terminated printable ASCII)
+32             31 x 34           Sample reference table (KMSampleReference x 31):
                                  +0 name[32]: matches SMPL chunk sample name
                                  +32 finetune (uint8, 0-15)
                                  +33 volume (uint8, 0-64)
+1086           2                 Unknown (always 0) (uint16 LE)
+1088           4                 numChannels (uint32 LE): 1-4
+1092           4                 restartPos (uint32 LE): music data loop restart offset
+1096           ...               Music data (variable length channel data)
```

---

## Detection Algorithm

```
1. Scan for "SONG" or "SMPL" chunk ID at offset 0 (little-endian comparison)
2. chunk.length > 8 (valid payload)
3. For SONG chunk: payload >= 1096 bytes (minimum for full KMSongHeader)
4. For SMPL chunk: name[0..31] is printable ASCII or zero
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/KarlMortonParser.ts`
- **NostalgicPlayer:** `KarlMortonWorker.cs` (authoritative format reference)

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

The parser extracts PCM samples from `SMPL` chunks directly into `SamplerSynth`
instruments. Sample names from the 32-byte ASCII field appear in the instrument
list. Song/pattern structure from the `SONG` chunk provides the playback order.

The little-endian chunk format is unusual for Amiga — most Amiga IFF formats use
big-endian. This reflects the format being written for a specific game engine
rather than standard Amiga tooling.
