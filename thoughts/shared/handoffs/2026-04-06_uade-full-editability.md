---
date: 2026-04-06
topic: uade-full-editability-handoff
tags: [uade, format-audit, editing, handoff]
status: final
---

# Handoff: UADE Full Editability — Phase 1 Complete

## What Was Done

### Infrastructure (Dynamic Layout Builder)
- `UADEFormatAnalyzer.ts` — new `buildDynamicLayout()` builds UADEPatternLayout from Paula log captured during enhanced scan. Enables editing for ANY UADE format without format-specific encoders.
- `UADEChipEditor.ts` — now supports `getExtraWrites` for formats needing multiple chip RAM writes per cell edit.
- `useFileNavigation.ts` — companion file loading for RJP (smp./rjp.), JPN (smp./jpn.), and extension-based (.SNG/.INS).

### Full Pattern Parsing + Encoder + Layout
| Format | What | Lines |
|--------|------|-------|
| FashionTracker | Real MOD cell parsing, song order, getCellFileOffset, encodeCell, UADEPatternLayout | 244 |
| WallyBeben | Phrase offset tracking, encodeCell (1-byte notes), getCellFileOffset via offset map | 59 |
| JeroenTel | Voice sequence → track data parsing (variable-length 1-4 byte entries), full patterns | 446 |

### Sample Extraction (Real PCM from Binary)
| Format | Method | Notes |
|--------|--------|-------|
| DigitalSonixChrome | Binary header parsing | nLengths × 18B records, PCM after header |
| KimChristensen | Opcode scan (0x207C→0x0680→0xE341→0x227C→0x0680→0x0087), origin computation | 6B descriptors |
| Desire | Opcode scan (0xE341→3×0x47FA), Ruch shift factor | Separate lengths+offsets tables |
| ThomasHermann | Fixed offset 5358, 48B descriptors | Names extracted, PCM in companion file |
| MaximumEffect | SMP.set parsing after module data | 16B descriptors |
| NickPellingPacker | MOD-style appended samples | 30 samples, delta decoding support |
| ImagesMusicSystem | ProTracker header, 768B/pattern | 31 samples from header, PCM sequential |
| JanneSalmijarvi | ProTracker header + JS92 magic | 31 samples, standard 1024B/pattern |
| AndrewParton | Split pointer+length arrays at fixed offsets | 20 samples hardcoded |
| PaulShields | 3 format variants (10B/32B records) | 15 samples, variant auto-detection |
| PaulRobotham | Header-driven descriptor table | 12B descriptors |
| PaulTonge | Heuristic scan for descriptor table | 12B relative-offset entries |
| NovoTradePacker | SAMP chunk parsing | 8B descriptors at offset 32 |
| MarkCooksey | Opcode scan chain (3×0x43FA) | 20B descriptors, Old/New variants |
| RichardJoseph | Companion SMP file parsing | 32B descriptors, SMP/INS companions |
| BenDaglishSID | SID synthesis (3 voices, no PCM) | Subsong count from header |

### uadeEditableFileData (115 parsers)
All UADE format parsers now include `uadeEditableFileData` and `uadeEditableFileName` in their return, enabling dynamic layout editing via the Paula log builder.

## What Remains — Future Sessions

### Phase 2: Pattern Parsing for High-File-Count Formats
These have ASM sources but complex track data formats requiring dedicated parsing:

| Format | Files | Complexity | Notes |
|--------|-------|------------|-------|
| BenDaglish | 85 | HIGH | Multi-path scanning, feature flags |
| SoundMaster | 44 | HIGH | Indirect pointer chains, 2 format variants |
| JasonPage | 77 | HIGH | 4 sub-variants, two-file, companion done |
| RichardJoseph | 178 | MEDIUM | Companion loading done, need pattern decoding |
| SeanConran | 17 | MEDIUM | Pure synthesis, ~1388 ASM lines |
| MarkCooksey | 13 | HIGH | 4 sub-variants, sample extraction done |

### Phase 3: Sample Extraction for Remaining Stubs
Formats with ASM sources but no sample extraction yet:

| Format | Descriptor | ASM Location |
|--------|-----------|--------------|
| Cinemaware | 26B waveforms, 138B sets | Cinemaware/Cinemaware.asm |
| CoreDesign | 14B descriptors | CoreDesign/Core Design.asm |
| MartinWalker | 8B offset pairs | MartinWalker/src/Martin Walker_v2.asm |
| AshleyHogg | 16B/44B dual-format | Ashley Hogg/Ashley Hogg_v1.asm |
| KrisHatlelid | FORM/IFF-based | KrisHatlelid/Kris Hatlelid_v1.asm |
| JesperOlsen | Dual-path IFF/direct | Jesper_Olsen/Jesper Olsen_v1.asm |
| SoundPlayer | FORM/IFF-based | SoundPlayer/SoundPlayer_v1.asm |
| SoundMaster | 6B/4B format-dependent | SoundMaster/Sound Master_v1.asm |
| JasonPage | Mixed addressing | JasonPage/src/Jason Page_v5.s |

### Phase 4: Tier 4 Formats (No ASM Source)
These rely entirely on the dynamic layout builder:
- GlueMon, Laxity, FredGray, SpeedySystem, SpecialFX

### Phase 5: Synth Formats
- FredEditor, RonKlaren, SunTronic — algorithmic synthesis, need synth parameter editing

## Key Files
- Plan: `thoughts/shared/plans/2026-04-06-uade-full-editability.md`
- Sample extraction notes: `thoughts/shared/plans/2026-04-06-uade-sample-extraction-remaining.md`
- Dynamic layout builder: `src/engine/uade/UADEFormatAnalyzer.ts`
- Pattern encoder registry: `src/engine/uade/UADEPatternEncoder.ts`
- Chip RAM editor: `src/engine/uade/UADEChipEditor.ts`

## Build Status
`npm run type-check` passes clean (0 errors). 117 files changed, 2460 insertions, 304 deletions.
