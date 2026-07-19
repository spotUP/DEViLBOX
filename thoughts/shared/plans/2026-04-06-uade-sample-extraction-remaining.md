---
date: 2026-04-06
topic: uade-sample-extraction-remaining
tags: [uade, format-audit, samples, plan]
status: draft
---

# Remaining UADE Format Sample Extraction — Implementation Notes

## Completed This Session
- FashionTracker: getCellFileOffset ✓
- WallyBeben: encoder + layout ✓
- DigitalSonixChrome: sample extraction ✓
- Desire: sample extraction via opcode scan ✓
- ThomasHermann: sample names from descriptors ✓
- BenDaglishSID: subsong count + SID voice labeling ✓
- KimChristensen: sample extraction via opcode scan + origin computation ✓
- JeroenTel: full pattern parsing (voice sequences → tracks → cells) ✓

## Ready to Implement (Clear Documentation)

### Maximum Effect — 16B descriptors, absolute addresses
- SampleInit at `Maximum_Effect/Maximum Effect_v1.asm` lines 80-109
- Descriptor: 16 bytes. +0: u32 address (absolute), +4: u16 length (words, double for bytes)
- Count: from InfoBuffer+Samples (opcode scan needed)
- Stride: 16 bytes per entry
- Addresses are absolute → need origin subtraction

### MartinWalker — 8B offset pairs
- SampleInit at `MartinWalker/src/Martin Walker_v2.asm` lines 98-130
- Descriptor: 8 bytes (2 longwords). +0: relative offset, +4: next offset
- Length = next_offset - current_offset
- Addresses: relative to SamplesPtr base
- Count: (EndSamplesInfoPtr - SamplesInfoPtr) / 8

### CoreDesign — 14B descriptors, absolute addresses
- SampleInit at `CoreDesign/Core Design.asm` lines 306-337
- Descriptor: 14 bytes. +6: u32 address (absolute)
- Length: u16 at sample address itself, doubled
- Count: (EndSampleInfoPtr - SampleInfoPtr) / 14

### Nick Pelling Packer — 16B entries, 30 samples hardcoded
- Descriptor: 16 bytes. Address at (A1), length u16 at +4 (doubled)
- Count: 30 (hardcoded)
- Sequential PCM data

### NovoTradePacker — 8B entries at module+32
- Descriptor: 8 bytes. Address at (A2), length u16 at +2 (doubled)
- Count: from InfoBuffer+Samples
- Base offset: ModulePtr + 32

### Janne Salmijarvi / Images Music System — 30B entries at module+20
- Descriptor: 30 bytes. Name at A2, length u16 at +22 (doubled)
- Count: 30 (hardcoded)
- Sample data: sequential from SamplesPtr
- IMS: data base at module + offset from u32 at module+1080

### PaulRobotham — 6B flat entries
- Descriptor: 6 bytes. +0: u32 address, +4: u16 length (words, doubled)
- Count: from InfoBuffer+Samples

### Paul Tonge — 8B relative entries
- Descriptor: 8 bytes. +0: u32 relative address (add base D2), +4: u16 length (doubled)
- Count: from InfoBuffer+Samples

### PaulShields — 10B/32B version-dependent
- Fixed 15 samples
- New format: 10B records; Old: 32B records
- Sequential PCM accumulation

### Andrew Parton — Split pointer+length arrays, 20 samples
- Pointers at module base (longwords), lengths at module+80 (longwords)
- Count: 20 (hardcoded)

## Synthesis-Only (No PCM Samples)
- SeanConran: pure synthesis
- FuturePlayer: no SampleInit
- NTSP-system: no SampleInit
- JankoMrsicFlogel: AMSynth only (algorithmic)

## Complex / Multi-Format (Need More Research)
- SoundMaster: 2 format variants (old/new)
- JasonPage: 4 sub-variants, mixed addressing
- Cinemaware: multi-waveform (26B per waveform, 138B per set)
- Ashley Hogg: 2 format variants (16B new, 44B old)
- KrisHatlelid: FORM/IFF-based variable-length
- Jesper Olsen: dual-path (IFF or direct)
- SoundPlayer: FORM/IFF-based

## Tier 4 — No ASM Source (Binary Players Only)
- GlueMon: GLUE magic, no SampleInit docs
- Laxity: prefix-only detection
- FredGray: compiled exe, no data format docs
- SpeedySystem: binary player
- SpecialFX: binary player (but has ASM dir — check)

## Not Started
These formats have parsers with empty patterns + uadeEditableFileData but need:
1. Sample extraction (where ASM docs exist)
2. Pattern parsing (where track format is documented)
3. For formats without ASM: rely on dynamic layout builder

Full stub list (need sample extraction):
- BladePackerParser
- CustomMadeParser
- MedleyParser
- MoshPackerParser
- MultiMediaSoundParser
- MusicMakerParser
- PSAParser
- OnEscapeeParser
- PeterVerswyvelenPackerParser
- PierreAdaneParser
- QuartetParser
- RobHubbardSTParser
- SoundMasterParser
- SteveBarrettParser
- SynthPackParser
- TimeTrackerParser
- TitanicsPackerParser
- TomyTrackerParser
- UFOParser
