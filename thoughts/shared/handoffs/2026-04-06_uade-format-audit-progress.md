---
date: 2026-04-06
topic: uade-format-audit-progress
tags: [uade, format-audit, parsers, editing]
status: in-progress
---

# UADE Format Audit — Session Progress

## Completed this session (7 formats)

### 1. Dave Lowe (.dl) — Full implementation
- **Parser**: Complete rewrite with command stream decoding
- **Samples**: Real PCM extraction from 14-byte descriptors via HUNK pointer table
- **Patterns**: Command stream parsing (SET_INSTRUMENT=4, SET_VOL_ENV=12, NOTE>100, REST=32, SEQ_ADVANCE=8)
- **Encoder**: `daveLoweEncoder` (VariableLengthEncoder) for writing edits back
- **Editing**: UADEVariablePatternLayout with filePatternAddrs/sizes/trackMap
- **File**: `src/lib/import/formats/DaveLoweParser.ts`

### 2. Dave Lowe New (.dln) — Full implementation
- **Parser**: Complete rewrite, shares command stream format with DL
- **Samples**: Collected via SET_INSTRUMENT pointer scanning (no separate sample table)
- **Patterns**: Same command stream decoding as DL
- **Encoder**: Shares `daveLoweEncoder` from DL
- **Editing**: UADEVariablePatternLayout
- **File**: `src/lib/import/formats/DaveLoweNewParser.ts`

### 3. Wally Beben (.wb) — Full implementation
- **Parser**: Complete rewrite with opcode scanning (origin, SongsPtr, SamplesPtr)
- **Samples**: Extracted from SamplesPtr table with length calculation from pointer differences
- **Patterns**: Voice sequences expanded → phrase table lookup → note decoding (0x00-0x23 = notes, 0xE0-0xEF = instrument, 0x80+ = commands)
- **Editing**: uadeEditableFileData stored
- **File**: `src/lib/import/formats/WallyBebenParser.ts`

### 4. David Hanney (.dh) — Full implementation
- **Parser**: Complete rewrite with IFF chunk parsing (DSNG/SEQU/INFO/BLK)
- **Samples**: N/A (pure sequencer format)
- **Patterns**: BLK chunks parsed into 4ch × 64row × 3bytes/cell patterns
- **Encoder**: Per-cell encoding (note + instrument + effect)
- **Editing**: Full UADEPatternLayout with getCellFileOffset
- **File**: `src/lib/import/formats/DavidHanneyParser.ts`

### 5. Jeroen Tel (.jt) — Sample extraction
- **Parser**: Rewrite with opcode scanning (0x1400E302, 0x03580328, 0x49F9)
- **Samples**: Real PCM extraction via relocated pointer table + descriptors (+2 len, +4 PCM ptr)
- **Patterns**: Stub (empty — command stream format not yet reversed)
- **Editing**: uadeEditableFileData stored
- **File**: `src/lib/import/formats/JeroenTelParser.ts`

### 6. Mark Cooksey (.mc) — Sample extraction for Old/New variants
- **Parser**: Added sample extraction via opcode scanning chain (43FA × 2, 000041FA, 43FA)
- **Samples**: Real PCM from SampleInfoPtr word offsets → 20-byte descriptors (desc+0 PCM offset, desc+16 length)
- **Patterns**: Stub (empty)
- **Editing**: uadeEditableFileData stored
- **Variants**: Old (D040D040) and New (601A) share the scan chain; Rare (mcr) still uses placeholders
- **File**: `src/lib/import/formats/MarkCookseyParser.ts`

### 7. Ben Daglish (.bd) — Handled by another agent
- **Samples**: Already had working extraction (survived linter)
- **Patterns**: Being implemented by parallel agent

## Key technical details

### DL/DLN command stream format
```
Position list per channel: array of longword pointers to command sections
Command section: word-based stream
  word > 100 → NOTE: period in this word, duration in next word  
  word == 4  → SET_INSTRUMENT: next longword = sample descriptor pointer
  word == 8  → SEQ_ADVANCE: end of section
  word == 12 → SET_VOL_ENV: next longword = envelope pointer
  word == 32 → REST: next word = duration in ticks
```

### DL sample descriptors (14 bytes each)
```
+0: u16 loop type (0=no loop, 1=loop)
+2: u32 PCM address (offset from module base / CODE_BASE)
+6: u16 sample length in words
+8: u32 loop offset (same address space as PCM addr)
+12: u16 loop length in words
```

### DH BLK chunk format
```
"BLK" + u8(blockIndex) + u32BE(dataSize=770)
Data: u8(flags) + u8(numRows=64) + 4ch × 64rows × 3bytes/cell
Cell: [note, instrument, effect]
```

### MC Old format scan chain
```
1. Scan for first 43FA → song data base
2. Scan for second 43FA → subsong count = (addr2 - addr1) / 16  
3. Scan for 000041FA → resolve LEA → SampleInfoPtr
4. SampleInfoPtr first word / 2 = sample count
5. Word offsets → 20-byte descriptors (desc+0: u32 pcmOff, desc+16: u16 lenWords)
6. Next 43FA → SamplesPtr (PCM data base)
```

## Still TODO

### From original handoff priority list
- [ ] BD pattern parsing (other agent working on it)
- [ ] MC Rare variant (mcr) sample extraction  
- [ ] MC pattern parsing for all variants
- [ ] JT pattern parsing

### Remaining 33 stub formats (from handoff)
High file count priorities:
- Richard Joseph (178 files) — two-file format (sng+ins)
- Jason Page (77 files) — two-file format (jpn+smp)
- Sound Master (44 files) — 68k-BRA
- Jason Brooke (19 files)
- Sean Conran (17 files)
- Fashion Tracker (14 files)
- Fred Gray (12 files) — HUNK exe

## Build status
All parsers pass `npx tsc -b --force` with zero errors.
