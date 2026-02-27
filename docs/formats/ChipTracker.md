# ChipTracker (KRIS)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/KRISParser.ts` (full parse)
           `src/lib/import/formats/ChipTrackerParser.ts` (detection only)
**Extensions:** no standard extension (identified by binary signature)
**Reference files:** (identified within MOD-adjacent file collections)
**Reference:** `Reference Code/openmpt-master/soundlib/Load_kris.cpp`

---

## Overview

ChipTracker by Erik Oosterom is a DOS/Amiga tracker format that closely mirrors
the ProTracker MOD layout — it reuses the standard 31-sample MOD header, but
appends a `"KRIS"` magic tag and custom data structures immediately following.
The first 952 bytes are structurally identical to a ProTracker MOD header.

---

## File Layout

```
Offset   Size   Description
-------  -----  -----------
+0       22     Song name (space-padded ASCII)
+22      930    31 × MOD sample headers (30 bytes each):
                  name[22] + length(u16BE, words) + finetune(i8) + volume(u8)
                  + loopStart(u16BE, words) + loopLen(u16BE, words)
+952     4      Magic: "KRIS" (0x4B 0x52 0x49 0x53)
+956     1      numOrders (uint8, 1–128)
+957     1      restartPos (uint8, 0–127)
+958     1024   Track reference table [128 × 4 channels × 2 bytes]:
                  entry[orderIdx * 4 + ch]:
                    byte[0] = track index (uint8)
                    byte[1] = transpose (int8, semitone offset)
+1982    ...    Synth waveforms (numSynthWaveforms × 64 bytes, if any)
+tracksOffset:  Sequential track data. Track t at tracksOffset + t × 256.
                  Each track: 64 rows × 4 bytes per cell.
```

**Minimum file size:** > 2240 bytes.

---

## Track Cell Format (4 bytes)

```
byte0  note byte: 0x18–0x9E (even values = note), 0xA8 = empty
byte1  instrument (1-based; 0 = no instrument)
byte2  high nibble must be 0; low nibble = effect type
byte3  effect parameter
```

Note byte to pitch: even values in 0x18–0x9E map to the chromatic scale.

---

## Instrument Structures

Instruments follow the standard MOD 30-byte sample header format (reusing the
first 952 bytes of the file). Sample loop points are in words (× 2 = bytes).

**Synth waveforms** (optional): 64-byte signed PCM waveform data stored after
the track reference table. Instruments with non-sample waveforms reference these.

---

## Track Reference Table

The 128 × 4 × 2 byte table at offset 958 forms the song arrangement:
- 128 order positions × 4 channels
- Each entry: `(trackIndex, transpose)` — selects which track plays on which
  channel at each song position, with a semitone transpose offset applied

This allows track reuse across positions with different pitch transpositions.

---

## Reference Implementations

- **Full parser:** `src/lib/import/formats/KRISParser.ts`
- **Detection only:** `src/lib/import/formats/ChipTrackerParser.ts`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_kris.cpp`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

The `KRISParser.ts` implements a full parse extracting sample headers, the track
reference table, and pattern cells. PCM samples are played via the Sampler engine.

`ChipTrackerParser.ts` provides detection only (for routing to libopenmpt) — the
full-parse `KRISParser.ts` takes precedence when detected. The format is identified
by `"KRIS"` at offset 952, which is distinctive enough to avoid false positives
against standard ProTracker MOD files.
