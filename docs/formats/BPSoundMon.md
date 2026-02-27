# BP SoundMon (SoundMon 2.0 / 2.2)

**Status:** FULLY_NATIVE — synth instruments use SoundMonSynth WASM engine; PCM samples use Sampler engine
**Parser:** `src/lib/import/formats/SoundMonParser.ts`
**Extensions:** `bp.*`, `sndmon.*` (V1/V2), `bp3.*` (V3)
**UADE names:** SoundMon2.0 (V1+V2), SoundMon2.2 (V3)
**Reference files:** `Reference Music/BP SoundMon 2/` (212 files), `Reference Music/BP SoundMon 3/` (122 files)
**Replayer source:** `docs/formats/Replayers/BPSoundMon/BS22player.s`

---

## Overview

BP SoundMon is a 4-channel Amiga tracker by Brian Postma featuring sophisticated
software-synthesised instruments with ADSR, LFO, EG (envelope generator), FX, and
MOD (modulation) tables in addition to regular 8-bit signed PCM samples. Three
versions exist with increasing instrument capabilities:

- **V1 (`BPSM`):** Basic synth tables, no `tables` count; `bp.*` / `sndmon.*` prefix
- **V2 (`V.2`):** Synth tables with count byte; same `bp.*` / `sndmon.*` prefix
- **V3 (`V.3`):** FX table + MOD table added to synth instruments; `bp3.*` prefix

UADE groups V1+V2 as "SoundMon2.0" and V3 as "SoundMon2.2". DEViLBOX handles all
three variants in a single parser and maps synth instruments to `SoundMonSynth`
(WASM-based soft synth) and sample instruments to the Sampler engine.

**Primary reference:** `docs/formats/Replayers/BPSoundMon/BS22player.s` (original
Brian Postma assembly source)

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    26    Song title (ASCII, null-padded)
0x1A    4     Version ID: "BPSM" (V1), "V.2\0" (V2), "V.3\0" (V3)
0x1D    1     Number of synth tables (V2/V3 only; ignored for V1)
0x1E    2     Song length in sequence steps (uint16BE)
0x20    ...   15 instrument definitions (variable length, see below)
  ...   ...   Track/sequence data: songLength × 4 entries × 4 bytes
  ...   ...   Pattern data: highestPattern × 16 rows × 3 bytes
  ...   ...   Synth table data: numTables × 64 bytes (V2/V3 only)
  ...   ...   Sample PCM data: 8-bit signed, one block per sample instrument
```

---

## Instrument Definitions (15 total, 1-indexed)

Each instrument starts at a variable offset after the 2-byte song length. There
are always exactly 15 instrument slots (instruments 1–15).

### Detection

The first byte determines the type:
- `0xFF` → **Synth instrument** (structured parameters + wave table index)
- anything else → **Sample instrument** (name + length + loop)

### Sample Instrument (32 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    24    Sample name (ASCII, null-padded)
0x18    2     Sample length in words (uint16BE; multiply ×2 for bytes)
0x1A    2     Loop start in words (×2 for bytes)
0x1C    2     Repeat length in words (×2 for bytes; 2 = one-shot / no loop)
0x1E    2     Volume (0–64)
```

If `(loop + repeat) >= length`, the parser clamps: `repeat = length - loop`.

### Synth Instrument (variable, V1/V2: 23 bytes; V3: 26 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    1     0xFF marker (identifies synth type)
0x01    1     Wave table index (into synth tables section)
0x02    2     Waveform length in words (uint16BE; ×2 = bytes)
0x04    1     ADSR control flags
0x05    1     ADSR table index (<<6 for byte offset into synth tables)
0x06    2     ADSR length (uint16BE)
0x08    1     ADSR speed

0x09    1     LFO control flags
0x0A    1     LFO table index (<<6)
0x0B    1     LFO depth (0 = disabled)
0x0C    2     LFO length (uint16BE)
0x0E    1     LFO delay

        [V3 continues directly; V1/V2 have 1 skip byte here]

0x0F    1     LFO speed
0x10    1     EG control flags
0x11    1     EG table index (<<6)
        [V1/V2 have 1 skip byte here]
0x12    2     EG length (uint16BE)
        [V1/V2 have 1 skip byte here]
0x14    1     EG delay
0x15    1     EG speed
        V3 only — FX and MOD tables:
0x16    1     FX control flags  [V3]
0x17    1     FX speed          [V3]
0x18    1     FX delay          [V3]
0x19    1     MOD control flags [V3]
0x1A    1     MOD table index (<<6) [V3]
0x1B    1     MOD speed         [V3]
0x1C    1     MOD delay         [V3]
0x1D    1     Volume (0–64)
0x1E    2     MOD length (uint16BE) [V3]
```

V1/V2 synth instruments end at volume; no FX or MOD tables. V3 adds FX and MOD
for richer FM-style modulation effects.

---

## Track / Sequence Data

Immediately after the 15 instrument definitions:

```
songLength × 4 entries (one per channel), each 4 bytes:
  uint16BE  pattern number (1-indexed; 0 = empty/silent)
  int8      soundTranspose (added to instrument table offset)
  int8      transpose (added to note pitch)
```

Total size: `songLength × 4 × 4 bytes = songLength × 16 bytes`.

---

## Pattern Data

Immediately after track data:

```
highestPattern × 16 rows × 3 bytes:
  int8    note value (0 = silent, positive = pitch index)
  uint8   (sample << 4) | effect  — upper nibble = sample 0–15, lower = effect 0–15
  int8    effect parameter
```

Patterns are 1-indexed; pattern 0 in the sequence table means no pattern.
Each pattern has exactly 16 rows.

### Effects

The lower nibble of byte 1 encodes effects (from BS22player.s):

| Code | Effect |
|------|--------|
| 0x0  | Arpeggio (param lo/hi nibbles = semitone offsets) |
| 0x1  | Slide up |
| 0x2  | Slide down |
| 0x5  | Set volume |
| 0x6  | Jump to pattern |
| 0xF  | Set speed |

---

## Synth Tables (V2/V3 only)

After pattern data, `numTables × 64 bytes` of raw 8-bit waveform data.

- Each table entry is 64 bytes of signed 8-bit PCM representing one period of a waveform
- The ADSR, LFO, EG, and MOD table indices reference offsets into this block
  (`index << 6` = byte offset)
- The wave table index in the synth instrument header also references this data

---

## Sample PCM Data

After synth tables (or after pattern data for V1), consecutive 8-bit signed PCM blocks
in instrument order, one block per non-empty sample instrument. Total size per
sample = `sampleLength × 2` bytes (since length was stored in words).

---

## Note Pitch Table

From BS22player.s, SoundMon uses its own 84-entry period table covering 7 octaves
(vs. ProTracker's standard 48-entry table). Note value lookup: `PERIODS[note + 35]`.
Period 856 at index 36 corresponds to ProTracker C-1.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SoundMonParser.ts`
- **Original player:** `docs/formats/Replayers/BPSoundMon/BS22player.s`
- **UADE players:** `Reference Code/uade-3.05/players/SoundMon2.0`, `SoundMon2.2`

---

## Implementation Notes

**Current status:** FULLY_NATIVE

- Synth instruments → `SoundMonSynth` (custom WASM engine in `soundmon-wasm/`)
- Sample instruments → Sampler engine via `createSamplerInstrument()`

**Synthesis mapping:**
- `waveType` = lower nibble of wave table index (0–15)
- `adsrSpeed` drives ADSR attack phase speed
- `lfoDepth > 0` and `lfoControl > 0` → vibrato enabled
- `lfoDelay` / `lfoSpeed` / `lfoDepth` → vibrato parameters

**V1 note:** V1 modules lack synth tables; synth instruments in V1 use built-in
waveforms indexed by `waveType`. Empty/zero-length sample slots use a `'Synth'`
placeholder (not routed to SoundMonSynth).

**Version identification:**
- Detect via `readString(buf, 26, 4)`: "BPSM" = V1, "V.2" = V2, "V.3" = V3
- `bp.*` and `sndmon.*` files may be V1 or V2 (same prefix)
- `bp3.*` files are exclusively V3

**Sample rate:** `createSamplerInstrument()` uses 8287 Hz (Amiga PAL 8-bit rate).
