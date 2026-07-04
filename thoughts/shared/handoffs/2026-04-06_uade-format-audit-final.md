---
date: 2026-04-06
topic: uade-format-audit-final
tags: [uade, format-audit, parsers, editing, handoff]
status: final
---

# UADE Format Audit — Final Session Handoff

## Summary

Implemented real parsing (samples, patterns, encoders) for 6 UADE formats, added `uadeEditableFileData` to 76+ stub parsers, and fixed 3 broken batch entries from parallel agent. All pass `tsc -b --force` with zero errors.

## Completed Implementations

### Full implementations (samples + patterns + editing)

| Format | Files | Samples | Patterns | Encoder | Key File |
|--------|-------|---------|----------|---------|----------|
| Dave Lowe (.dl) | 10+ | 14-byte descriptors via HUNK ptrs | Command stream (SET_INSTR/VOL_ENV/NOTE/REST/SEQ_ADV) | VariableLengthEncoder | DaveLoweParser.ts |
| Dave Lowe New (.dln) | 41 | From SET_INSTRUMENT ptr collection | Same as DL | Shared daveLoweEncoder | DaveLoweNewParser.ts |
| Wally Beben (.wb) | 24 | SamplesPtr table (opcode scan 0xE584) | Voice seq → phrase table → note decode | — | WallyBebenParser.ts |
| David Hanney (.dh) | 8 | N/A (pure sequencer) | BLK chunk parsing (3byte cells) | UADEPatternLayout | DavidHanneyParser.ts |

### Sample extraction only (patterns still stub)

| Format | Files | Method | Key File |
|--------|-------|--------|----------|
| Jeroen Tel (.jt) | 19 | Opcode scan: 0x1400E302 → origin, 0x49F9 → sample table | JeroenTelParser.ts |
| Mark Cooksey (.mc) | 13 | Opcode scan chain: 43FA×2 → 000041FA → SampleInfoPtr → descriptors | MarkCookseyParser.ts |

### Metadata/detection improvements

| Format | Improvement |
|--------|-------------|
| Fred Gray (.gray) | uadeEditableFileData added (title extraction was reverted by linter) |
| Richard Joseph (.rjp) | Already complete — numSamples, descriptors, subsongs, uadeEditableFileData |
| 76+ stub parsers | uadeEditableFileData + uadeEditableFileName batch-added |

### Bug fixes (from parallel agent's batch)

- FCParser.ts: removed wrongly-placed uadeEditableFileData in inner `stubTrackerSong()` function
- JasonBrookeParser.ts: fixed `_buffer` → `buffer` variable name
- ManiacsOfNoiseParser.ts: fixed `_buffer` → `buffer` variable name

## Technical Details

### DL/DLN command stream
```
Position list: array of longword pointers per channel to command sections
Each section: word-based stream terminated by SEQ_ADVANCE (8)
  word > 100 → NOTE (period) + next word (duration)
  word == 4  → SET_INSTRUMENT + longword (descriptor ptr)
  word == 12 → SET_VOL_ENV + longword (envelope ptr)
  word == 32 → REST + word (duration)
```

### DH BLK chunks
```
"BLK" + u8(blockIndex) + u32(size=770)
Data: u8(flags) + u8(rows=64)
Then channel-major: 4 channels × 64 rows × 3 bytes/cell
Cell: [note, instrument, effect]
Song positions: bytes at file offset 0x0C (header)
```

### JT sample table discovery
```
Find1: scan for 0x1400E302 → D7 at +6
Find2: scan for 0x03580328 → origin = D7 - position
Find4: scan for 0x49F9 → sample pointer table (abs address - origin)
Table: longword ptrs → descriptors (+2: u16 lenWords, +4: u32 pcmPtr)
```

### MC sample table discovery (Old/New variants)
```
1. Scan for first 43FA → song data base
2. Scan for second 43FA → subsong boundary
3. Scan for 000041FA → resolve LEA → SampleInfoPtr
4. First word / 2 = sample count
5. Word offsets → 20-byte descriptors (desc+0: u32 pcmOff, desc+16: u16 lenWords)
6. Next 43FA → SamplesPtr (PCM base)
```

## Key Architecture Insight: UADE Enhanced Scan = Universal Parser

**Discovery**: ALL remaining "blocked" formats already route through UADE's enhanced scan mode, which runs the actual 68k emulator, captures Paula DMA writes, and extracts:
- Real PCM samples from chip RAM
- Reconstructed pattern rows (notes, volumes, effects) from Paula register captures
- BPM/speed detection from CIA timer analysis

**This means no more format-specific 68k code tracing is needed.** The enhanced scan IS the universal parser.

### Architecture

```
Enhanced Scan (reading)     Native Parser (writing)      Chip RAM (editing)
─────────────────────────   ─────────────────────────    ─────────────────
UADE 68k emulator runs      Format-specific encoders     UADEChipEditor
module init + playback       reverse cell→binary          reads/writes live
→ captures Paula DMA        → enables native export      emulated memory
→ extracts PCM samples      → only needed for EXPORT     → edits take effect
→ reconstructs patterns     DL, DLN, WB, DH, FT have    on next DMA tick
→ works for ALL formats     native encoders              → works for ALL
```

### Formats using enhanced scan (no native patterns needed)
BD, SM, JT, MC, SC, FT, JB, JP — all route through `parseUADEFile(buffer, file, 'enhanced', ...)`

### Two-file companion loading (implemented this session)
- Auto-companion detection added to `useFileNavigation.ts`
- Prefix patterns: `rjp.` ↔ `smp.`, `jpn.` ↔ `smp.`
- Extension patterns: `.sng` ↔ `.ins`
- RJP parser extracts real PCM from companion SMP/INS file

## Build Status
Zero TypeScript errors. All parsers pass `tsc -b --force`.
