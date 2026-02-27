# Quartet / Quartet PSG / Quartet ST

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/QuartetParser.ts`
**Extensions:** `qpa.*` (Quartet), `sqt.*` (Quartet PSG), `qts.*` (Quartet ST), UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/Quartet/PlayModule.S`
**Reference files:** `Reference Music/Quartet/`

---

## Overview

Quartet is a family of three Amiga/Atari ST music formats sharing a UADE player family:

| Variant | Prefix | Platform | Description |
|---------|--------|----------|-------------|
| **Quartet (QPA)** | `qpa.` | Amiga | 4-channel PCM sampler, original Quartet |
| **Quartet PSG (SQT)** | `sqt.` | Atari ST | YM-2149 PSG synthesis (not PCM) |
| **Quartet ST (QTS)** | `qts.` | Atari ST | 4-channel ST DMA sampler |

Files are named by prefix: `qpa.mysong`, `sqt.mysong`, `qts.mysong`. All three variants
are compiled-binary format (68k player + song data baked together), similar to Ben Daglish
or Jeroen Tel. The parser uses structural binary checks ported from the UADE eagleplayer
`DTP_Check2` routines to distinguish variants.

---

## Detection Signatures (from UADE eagleplayer assembly)

### Quartet (QPA)
```
byte[0]: tempo, must be in range 1..30 (0x01..0x1E)
byte[1]: 0x50 (ASCII 'P')
3000 % tempo == 0  (tempo must evenly divide 3000)
End-sentinel scan: scan word-by-word backward from (even-aligned) end of file,
  looking for first 0xFFFF word. Once found, the two preceding longwords must
  both be 0xFFFFFFFF.
```

### Quartet PSG (SQT)
```
bytes[0..1]: 0x60 0x00 (BRA.W instruction)
Four consecutive BRA.W instructions with positive even displacements at offsets 0, 4, 8, 12
At offset 16: 0x49FA (LEA PC-relative)
Follow first BRA.W: check for 0x48E7FFFE (MOVEM.L) + 0x4DFA + 0x51EE at +4 + 0x6100 at +8
```

### Quartet ST (QTS)
```
word[0]:   speed, must be 1..16 (0x0001..0x0010)
byte[7]:   4
byte[6]:   ≤ 4
dword[8]:  0
word[12]:  may be 'WT' (optional extended header); else dword[12] = 0
dword[24]: ≤ 0x4C and dword[24] & 3 == 0
word[16]:  0x0056
```

---

## Format Notes

**Quartet (QPA) — Amiga 4-channel PCM:**
Standard 4-voice Amiga PCM replay. Song data is embedded after the 68k player code.
Samples are Amiga-address-relative, requiring load address recovery for PCM extraction.

**Quartet PSG (SQT) — Atari ST YM-2149:**
PSG synthesis only — no PCM samples. The YM-2149 is a 3-voice square wave + noise chip.
Not feasible to convert to native sampler without an AY/YM synthesis engine.

**Quartet ST (QTS) — Atari ST 4-channel:**
ST DMA sample replay variant. Similar structure to QPA but for ST hardware registers.

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/Quartet/PlayModule.S`
- **Demo:** `docs/formats/Replayers/Quartet/Demo.S`
- **UADE player sources:**
  - `Reference Code/uade-3.05/amigasrc/players/wanted_team/Quartet/Quartet_v1.asm`
  - `Reference Code/uade-3.05/amigasrc/players/wanted_team/Quartet_PSG/Quartet PSG.asm`
  - `Reference Code/uade-3.05/amigasrc/players/wanted_team/QuartetST/Quartet ST_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `QuartetParser.ts` identifies all three variants and
creates `'Synth' as const` placeholder instruments. UADE handles synthesis.

**Path to NATIVE_SAMPLER (QPA only):**
QPA files are Amiga PCM. Binary analysis of the Quartet_v1.asm replay routine would
reveal the song data layout and sample table structure. Load address recovery from the
68k init code would be needed to convert Amiga absolute sample pointers to file offsets.

**Note:** SQT (PSG synthesis) cannot be native-sampler without a YM-2149 WASM synth.
