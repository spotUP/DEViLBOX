---
date: 2026-04-06
topic: uade-phase2-editability
tags: [uade, format-audit, editing, handoff]
status: final
---

# Handoff: UADE Phase 2 — Pattern Parsing & Routing Fixes

## What Was Done

### RichardJoseph — Full Pattern Parsing (178 files)
- **Complete rewrite** of `RichardJosephParser.ts` with real pattern data decoding
- Parses interleaved chunk layout: 7 chunks (size+data) for sample descs, envelopes, subsongs, step ptrs, pattern ptrs, step data, pattern data
- Decodes variable-length byte stream: notes ($00-$7F), commands ($80-$8E) including vibrato, speed, instrument, pitch slide
- Handles multi-subsong files (finds first non-empty subsong)
- **Sample extraction** from companion SMP/INS files (32-byte descriptors with loop info)
- **UADEPatternLayout** with file offset map for chip RAM editing
- **77/77 test files pass** with 34,533 total notes extracted, 61+ real sampler instruments per file
- Wired into AmigaFormatParsers.ts via `withNativeThenUADE`

### JasonPage — Sample Extraction (77 files)
- Added companion SMP file loading to `JasonPageParser.ts`
- Parses sample length table from header (Format 1/2: word[2] offset, sequential 4-byte lengths)
- Real PCM extraction from companion SMP files
- **31/32 files pass** (1 non-standard "jpn.road" correctly falls through to UADE)
- Added `jpo`/`jpold` extensions to routing (Steve Turner variant)
- 198 total sampler instruments extracted across all files

### Routing Fixes — 8 Formats Wired to Native Parsers
All these formats previously bypassed their native parsers and went directly to UADE. Now properly use `withNativeThenUADE` with `injectUADE: true`:

| Format | Files | Change |
|--------|-------|--------|
| RichardJoseph | 178 | Full rewrite with pattern parsing + sample extraction |
| JasonPage | 77 | Sample extraction + routing fix |
| BenDaglish | 85 | Routing to native parser (sample extraction) |
| SoundMaster | 44 | Routing to native parser (metadata) |
| SeanConran | 17 | Routing to native parser (metadata) |
| FredGray | 12 | Routing to native parser (metadata) |
| RobHubbard | varies | Fixed duplicate routing block that shadowed proper handler |

### Key Finding: 68k Executable Formats Cannot Have Native Pattern Parsing

Research confirmed that ALL remaining Phase 2/3 target formats are compiled 68k executables:
- **BenDaglish**: Player code IS the data, patterns only via UADE DMA capture
- **SoundMaster**: Opcode-scanned data pointers, runtime code patching
- **JasonPage**: 3 format variants, 24-entry command dispatch tables
- **MarkCooksey**: PC-relative pointer chasing in init routine
- **SeanConran**: Pure synthesis, 68k code
- **RobHubbard**: Compiled synth replayer
- **FredGray**: HUNK executable, no ASM source
- **ManiacsOfNoise**: Binary-only player

These all rely on the **dynamic layout builder** (Paula log capture via UADE enhanced scan) for pattern editing. Native pattern parsing is only possible for data-only formats like RichardJoseph.

## Build Status
`npm run type-check` passes clean (pre-existing unrelated error in EditorControlsBar.tsx).

## What Remains

### Phase 3 (remaining sample extraction)
Formats where sample descriptors ARE parseable from the binary (via opcode scanning):
- SoundMaster: old/new format sample descriptor tables
- BenDaglish: SampleInfo1/SampleInfo2 tables (12-byte descriptors)

### Phase 4: Tier 4 Formats
- Verify dynamic layout builder works for all 17 binary-only formats
- Test: GlueMon, Laxity, FredGray, SpeedySystem, SpecialFX

### Phase 5: Synth Formats  
- FredEditor, RonKlaren, SunTronic — need synth parameter editing architecture
