---
date: 2026-07-02
topic: cinter4-music-section-bytemap
tags: [cinter4, format, decode, import]
status: final
---

# Cinter4 music-section byte-map (Phase 0 deliverable)

Definitive reference for decoding the `.cinter4` music section. Cross-checked across
three sources; **`CinterConvert.py` is authoritative for on-disk layout**, `Cinter4.S`
and the transpiled `cinter4-wasm/src/cinter4/cinter4.c` confirm read semantics.

Sources:
- `/Users/spot/Code/Reference Code/Cinter/convert/CinterConvert.py` (layout: 442-505, 601-612)
- `/Users/spot/Code/Reference Code/Cinter/player/Cinter4.S` (read/decode: 10-25, 100-142, 145-292)
- `/Users/spot/Code/DEViLBOX/cinter4-wasm/src/cinter4/cinter4.c` (CinterParseMusic ~989, CinterPlay1/2)

## Correction to prior assumptions
- `test-automatic.cinter4` is **NOT all-synth**: first i16 = `-3` → 3 raw instruments
  (degenerate len=1/replen=0 placeholders) + 11 generated = 14 total (indices 0–13).
- `Cinter4Parser.ts:8` docstring says "little-endian" — **wrong**, format is big-endian
  throughout (code already reads BE correctly).

## File layout (all words big-endian)
1. Optional raw header: leading negative i16 `-nRaw` (only if raw instruments exist),
   then `nRaw × [length u16, replength u16]`.
2. Generated instruments: i16 `count-1` (dbra), then `count × 11 words`
   (length, replen, mpitch, mod, bpitch, attack, dist, decay, mpitchdecay, moddecay, bpitchdecay).
3. **Music header** (`CinterConvert.py:610-612` writes `pack(">hh", len(notes)//4, len(noteRange))`):
   - word1 = **TrackSize** = bytes per track = `len(notes_data)//4`.
   - word2 = **note-range length** in bytes (INCLUDES the trailing restart word).
4. **Note-range block** (`noteRangeLen` bytes): `N × [noteMin u8, count u8, offset*128 u16]`
   then a **final 2-byte restart word**. So `N = (noteRangeLen - 2) / 4`.
5. **Notes data**: `4 × TrackSize` bytes = 4 parallel tracks, each `TrackSize/2` u16 words,
   one word per 50 Hz tick. Track file-order `[3,2,1,0]` → Paula channels 3,2,1,0.

`test-automatic.cinter4` (74104 B): raw hdr 14 B, 11 gen × 22 B, music hdr @0x0102
(TrackSize=18446, nrLen=58 → 14 entries + restart), notes @0x0140 = 4×18446 = EOF. All bytes accounted.

## Note-word encoding (u16 BE)
`VOLUME_SHIFT=9`, `NOTE_ABS_MASK=0x80` (CinterConvert.py:442-479).
```
trigger = (w & 0x8000) != 0     // bit15
vol6    = (w >> 9) & 0x3F        // bits14..9
field9  =  w & 0x1FF             // bits8..0
```
Three word kinds:
- **trigger**: `noteId = field9` (resolve via range-walk), `volume = vol6` (absolute 0..63).
- **non-trigger, absolute-note** (`((field9>>7)^(field9>>6))&1 == 1`): `noteIndex = field9 & 0x7F`
  → set period = periodTable[noteIndex], no retrigger; `dvol = vol6` (signed 6-bit delta).
- **non-trigger, slide**: `dper = signExtend9(field9)` (period delta); `dvol = vol6` (signed delta).
- `w == 0` before first trigger on a track = silent/no-op (`initial` state).

Encoder guarantees valid slides have bit7==bit6, so the XOR cleanly discriminates abs-note vs slide.

## Note-range walk: noteId → (instrument, note) — port 1:1 (Cinter4.S:229-243)
```
d0 = noteId; instIndex = -1; i = 0;
loop:
  e = table[i++];
  if (e.offsetWords === 0) instIndex += 1;   // offset==0 marks a new instrument
  d0 -= e.count;
  if (d0 < 0) break;
d0 += e.count;
note = e.noteMin + d0;      // absolute period-table index (0..35)
// instIndex = GLOBAL index into c_Instruments (raw first, then generated)
```

## Note → MOD note / period
`note` (0..35) indexes the 36-entry ProTracker period table directly:
```
[856,808,762,720,678,640,604,570,538,508,480,453,   // C-1..B-1
 428,404,381,360,339,320,302,285,269,254,240,226,   // C-2..B-2
 214,202,190,180,170,160,151,143,135,127,120,113]   // C-3..B-3
```
`letter = note%12`, `octave = note//12 + 1`. period = table[note]. No period math needed to recover the MOD note (stored value IS the note index for triggers/abs-notes).

## Timing & loop
- **Pure one-word-per-tick at 50 Hz. No speed/tempo command in the music stream** — all
  effects (arp/porta/vibrato/tremolo/volslide/retrig/cut/delay/offset) are pre-rendered
  into per-tick period/volume/note streams at convert time (CinterConvert.py:144-395).
- Volume-only change = slide word with `field9=0`, `vol6=dvol`.
- **Restart word** = `(restart - musiclength + 1) * 2`, signed byte offset relative to
  `MusicEnd` (last word of track 3). Recover: `restartTick = musiclength - 1 + restartWord/2`.
  For test-automatic: 9223-1 + (-18430/2) = 7 → loops to tick 7.
- Trailing identical words trimmed at loop boundary (CinterConvert.py:488-491); an `Fxx=00`
  stop appends one `0` word per track.

## Word-kind census (measured, all 4 tracks, test-automatic.cinter4)
trigger=2341, absNote=2233, slide=5499, zero=26819. Of non-zero (10073): **slide 54.6%,
absNote 22.2%, trigger 23.2%.** Song is automation-dominated → plain-note MOD decompile
would be massively lossy. Confirms the need for lossless tick-level decode (Path A).
