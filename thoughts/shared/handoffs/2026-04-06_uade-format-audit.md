---
date: 2026-04-06
topic: uade-format-audit
tags: [uade, format-audit, parsers, editing]
status: in-progress
---

# UADE Format Audit — Handoff

## Goal
Make ALL UADE formats fully editable: parse binary data → display in tracker grid → encode edits back to binary → UADE playback. Every format gets the same 1:1 treatment. No shortcuts, no stubs, no "not worth it".

## Standard for "done"
Each format parser must have:
1. **Full pattern parsing** — decode command streams/cells into tracker grid rows
2. **Real sample extraction** — `createSamplerInstrument()` with actual PCM from the binary
3. **Encoder** — `VariableLengthEncoder` or `UADEPatternLayout` for writing edits back
4. **UADEVariablePatternLayout** — wired up with `filePatternAddrs`, `filePatternSizes`, `trackMap`
5. **`uadeEditableFileData`** — for export to original format
6. **`uadeEditableFileName`** — correct UADE prefix-form filename

Reference implementation: `DaveLoweParser.ts` + `DaveLoweEncoder.ts` (when samples are re-applied)

## Completed formats (need fixes)

### Dave Lowe (DL) — `.dl` / `dl.*`
- **Parser**: `src/lib/import/formats/DaveLoweParser.ts` — decodes command streams into grid rows ✓
- **Encoder**: `src/engine/uade/encoders/DaveLoweEncoder.ts` — grid → command stream ✓
- **Routing**: `AmigaFormatParsers.ts` line ~1290 — routes to native parser ✓
- **FIX NEEDED**: `createSamplerInstrument` import was stripped by other agent's linter. Re-add sample extraction. The code was working — samples at `CODE_BASE + instrDataOff` with format: `word(loopType) long(sampleOff) word(sampleLen) [long(loopOff) word(loopLen)]`
- **Format**: HUNK executable (0x000003F3). CODE_BASE = 0x20. Header pointers at 0x2C-0x4F. Command stream: word > 100 = period + duration, word <= 100 = command (SET_INSTRUMENT=4, SEQ_ADVANCE=8, SET_VOL_ENV=12, REST=32, etc.)
- **Files**: 10+ in Reference Music, test file at `public/data/songs/formats/incredibleshrinkingsphere.dl`

### Dave Lowe New (DLN) — `.dln` / `dln.*`
- **Parser**: `src/lib/import/formats/DaveLoweNewParser.ts` — decodes command streams ✓
- **Encoder**: shares `DaveLoweEncoder.ts` ✓
- **FIX NEEDED**: Never added sample extraction. DLN files DO contain samples — need to locate sample table in the binary and extract PCM.
- **Format**: Raw data (no HUNK). word[0]=4 or 8. Channel pointer table at offset 4 or 8. Same command stream as DL.
- **Files**: 41 in Reference Music, test file at `public/data/songs/formats/m-bison.dln`

### Wally Beben (WB) — `.wb` / `wb.*`
- **Parser**: `src/lib/import/formats/WallyBebenParser.ts` — extracts voice sequences but only shows phrase indices, not decoded notes
- **FIX NEEDED**:
  1. Re-add `createSamplerInstrument` sample extraction (was stripped by linter)
  2. Decode phrase command streams into actual notes (bytes 0x00-0x23 = note indices into 36-entry period table, bytes >= 0x80 = control commands)
  3. Create encoder for writing edits back
- **Format**: Raw 68k executable (0x6000 BRA). Opcode scanning to find: Origin (0x1039), SubsongCount (0x223C), SongsPtr (0x41F9 after 0x223C), SamplesPtr (0xE584). Voice sequences = byte arrays (0xFF-terminated) of phrase indices. Two variants: old (20 files) and new (1 file).
- **Research doc**: `thoughts/shared/research/2026-04-05_wally-beben-format.md` (comprehensive, production-quality algorithm)
- **Files**: 24 `.wb` + 17 `.cus` in Reference Music

### Ben Daglish (BD) — `.bd` / `bd.*`
- **Parser**: `src/lib/import/formats/BenDaglishParser.ts` — sample extraction works (survived linter)
- **FIX NEEDED**:
  1. No pattern data parsing at all
  2. No encoder
  3. Need to trace the player's sequencer code to understand the note command stream format
- **Sample extraction algorithm**: Scan all `0x41FA` (LEA d16(PC),A0) instructions. The correct one points to a table of longwords where hi-word=0 (offsets < 0x10000, >= 3 entries). Each entry = offset from SampleInfo1 to a 12-byte descriptor: `u32(sampleOff) u32(loopOff) u16(lenWords) u16(loopLenWords)`. PCM at `SampleInfo1 + sampleOff`. May be IFF 8SVX (check for "FORM" magic → find BODY chunk).
- **UADE source**: `third-party/uade-3.05/amigasrc/players/wanted_team/BennDaglish/Benn Daglishv3.asm`
- **Files**: 85 `.bd` in Reference Music

### Mark Cooksey (MC) — `.mc` / `mc.*` / `mcr.*` / `mco.*`
- **Parser**: `src/lib/import/formats/MarkCookseyParser.ts` — good detection (4 variants), broken sample extraction
- **FIX NEEDED**: Everything. Sample extraction uses wrong algorithm. No pattern parsing. No encoder.
- **Format**: 4 sub-variants (Old, New, Rare v1.3, Old Player split-file). All are compiled 68k executables. Sample table found via `0x43FA` opcode scanning. Command-stream sequencer with 14 commands (note, set_sample, set_wait, set_volume, call, return, goto, end, etc.)
- **UADE source**: `third-party/uade-3.05/amigasrc/players/wanted_team/MarkCooksey/` — check for `Mark Cooksey_v2.asm` and `MarkCookseyOld_mod.asm`
- **Files**: 8 `.mc` + 5 `.fw` in Reference Music

## Not yet started

### David Hanney (DH) — `.dh` / `dh.*`
- **Parser**: `src/lib/import/formats/DavidHanneyParser.ts` — 228 lines, stub
- **Format**: Clean IFF-style chunks: `DSNG` magic, `SEQU`(256B sequence), `INFO`(10B metadata), `BLK`(770B pattern blocks). Pure sequencer data (no PCM samples). 4 channels.
- **MUST**: Parse SEQU for song positions, INFO for metadata, BLK for actual pattern note data. Create encoder. Even though there are no PCM samples, the pattern data and sequence editing must work.
- **Files**: 8 `.dh` in Reference Music (all Tearaway Thomas)

### Jeroen Tel (JT) — `.jt` / `jt.*` / `mon_old.*`
- **Parser**: `src/lib/import/formats/JeroenTelParser.ts` — 267 lines, detection works, stub patterns
- **Format**: Raw 68k executable. Detection: scan first 40 bytes for `0x02390001`. Instrument count at scanPos+9.
- **Sample extraction algorithm** (from `Jeroen Tel_v1.asm` SampleInit lines 153-188):
  - `A2 = lbL0011AC` (sample pointer table, found via Find4: scan for `0x49F9`)
  - Origin found via Find1 (`0x1400E302`) + Find2 (`0x03580328`)
  - Each table entry: longword absolute pointer → descriptor at `ptr - Origin + moduleBase`
  - Descriptor: `+2` u16 sample length in words, `+4` u32 absolute PCM pointer (relocate same way)
  - Sample count: `(first_descriptor_addr - table_start) / 4`
- **UADE source**: `third-party/uade-3.05/amigasrc/players/wanted_team/JeroenTel/Jeroen Tel_v1.asm` (1237 lines, fully read)
- **Files**: 19 (8 `.jt` + 9 `.cus` + 2 `.mon`) in Reference Music

### Remaining 33 UADE formats (all stubs with only `uadeEditableFileData` added)

All need full 1:1 implementation. Listed with file counts:

| Format | Files | Type | UADE Source Dir |
|--------|-------|------|-----------------|
| Sound Master | 44 | 68k-BRA | wanted_team/SoundMaster or similar |
| Jason Page | 77 | Two-file (jpn+smp) | wanted_team/JasonPage |
| Jason Brooke | 19 | ? | ? |
| Sean Conran | 17 | Data | ? |
| Fashion Tracker | 14 | Data | ? |
| Fred Gray | 12 | HUNK exe | fred/ |
| Richard Joseph | 178 | Two-file (sng+ins) | ? |
| Steve Barrett | 8 | 68k-BRA | ? |
| Quartet | 7 | 68k-BRA | ? |
| Desire | 5 | Data | ? |
| Kim Christensen | 1 | Data | ? |
| Thomas Hermann | 1 | HUNK | ? |
| + 21 more with 0 reference files | — | — | — |

## Converter script fixes (applied, save for reference)
- `/tmp/convert_objdump_to_asm68k.py` — fixes applied:
  - Branch suffix stripping: `BEQS`→`BEQ`, `BNEW`→`BNE`
  - Label zero-padding: `L_{addr:04X}` consistent format

## Key patterns to follow

### For HUNK executable formats (DL, Fred Gray, etc.)
```
CODE_BASE = 0x20 (after HUNK header)
Pointer table at CODE_BASE + fixed offsets
Sample info at CODE_BASE + pointer[N]
PCM data at CODE_BASE + sample_offset
```

### For raw 68k executable formats (WB, BD, JT, MC, etc.)
```
Opcode scanning to find data structure pointers
Origin extraction for pointer relocation
Sample table → descriptor → PCM via relocated pointers
```

### For data-only formats (DH, DLN, etc.)
```
Fixed header with chunk/section layout
Direct byte offsets for pattern data and samples
```

### UADEVariablePatternLayout setup
```typescript
const variableLayout: UADEVariablePatternLayout = {
  formatId: 'formatName',
  numChannels: 4,
  numFilePatterns: sortedPatternOffsets.length,
  rowsPerPattern: 64,
  moduleSize: buf.length,
  encoder: formatEncoder,  // VariableLengthEncoder
  filePatternAddrs,        // byte offset of each pattern in file
  filePatternSizes,        // byte size of each encoded pattern
  trackMap,                // [trackerPatIdx][chIdx] → file pattern index
};
```

### Sample extraction pattern
```typescript
import { createSamplerInstrument } from './AmigaUtils';

const pcm = new Uint8Array(lenBytes);
for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
instruments.push(createSamplerInstrument(id, name, pcm, 64, 8287, loopStart, loopEnd));
```

## Priority order
1. Fix DL sample extraction (re-add stripped code)
2. Fix DLN sample extraction (add for first time)
3. Fix WB (phrase decoding + samples + encoder)
4. Complete BD (pattern parsing + encoder)
5. Complete MC (fix sample extraction + pattern parsing + encoder)
6. Implement DH (SEQU/BLK parsing + encoder)
7. Implement JT (samples + pattern parsing + encoder)
8. Work through remaining 33 formats systematically

## Format status tracker
`http://localhost:4444` — update with `POST /push-updates`
