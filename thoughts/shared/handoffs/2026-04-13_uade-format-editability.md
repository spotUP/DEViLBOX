---
date: 2026-04-13
topic: uade-format-editability
tags: [uade, formats, parsers, chip-ram-editing]
status: in-progress
---

# UADE Format Editability — Handoff

## Task
Make UADE FORCE_CLASSIC formats editable by wiring native parser routes and adding pattern decoding + chip RAM editing where possible.

## What Was Done (9 commits pushed)

### Phase 1: Wire up native routes for existing parsers (3 commits)
- **f8a5626**: 18 formats wired to NATIVE_ROUTES — 13 with full chip RAM editing (CoreDesign, MarkCooksey×2, JankoMrsicFlogel, ThomasHermann, SteveBarrett, SoundPlayer, JasonPage, SeanConnolly, SCUMM, ManiacsOfNoise, CustomMade, ZoundMonitor), 5 with native parsing (SteveTurner, BenDaglish, KrisHatlelid, DavidHanney, BenDaglish-SID)
- **8da2b42**: AshleyHogg (full editing) + SoundMaster (native parsing)
- **1fa4ea7**: PCM sample extraction for CustomMade + MarkCooksey

### Phase 2: BenDaglish track-aligned encoder (1 commit)
- **2b8a961**: Refactored BenDaglish from timeline-slicing to track-aligned patterns. Created `BenDaglishEncoder.ts`. Now has full `uadeVariableLayout` for chip RAM editing.

### Phase 3: New parsers for remaining FORCE_CLASSIC formats (4 commits)
- **5c2caa2**: BeathovenSynthesizer (HUNK header + magic `BEATHOVEN109/100/NEW` + sample extraction), RiffRaff (magic `RIFFRAFF`), HowieDavies (magic `H.DAVIES`), DynamicSynthesizer, SoundImages, Silmarils
- **bcb2765**: VoodooSupremeSynthesizer, AProSys, SoundProgrammingLanguage, SynTracker, MarkII
- **a5291184**: Routed SynTracker→SymphonieProParser (was wrong — synmod IS SynTracker)
- **6e666848**: Reverted — restored SynTracker parser, synmod=SynTracker, .symmod=SymphoniePro

### Shared utility
- `WantedTeamUtils.ts`: AmigaOS HUNK parser, Wanted Team magic matching, string extraction

## What's Left

### Problem: Stub parsers return empty patterns
10 format parsers are stubs with no pattern decoding. They create empty 64-row patterns. This means the formats play audio through UADE but show blank patterns in the tracker:

| Parser | Ext | Issue |
|--------|-----|-------|
| SynTrackerParser | synmod | Stub — empty patterns |
| DynamicSynthesizerParser | dns | Stub — empty patterns |
| SoundImagesParser | tw | Stub — empty patterns |
| SilmarilsParser | mok | Stub — 3-voice, empty |
| VoodooSupremeSynthesizerParser | vss | Stub — empty |
| AProSysParser | aps | Stub — ADRVPACK compressed |
| SoundProgrammingLanguageParser | spl | Stub — empty |
| MarkIIParser | mk2/mkii | Self-playing — empty |
| KrisHatlelidParser | kh | Self-playing — has sample extraction but empty patterns |
| DavidHanneyParser | dh | DSNGSEQU magic — empty patterns |

### Two approaches to fix empty patterns

**Approach A: Decode the binary format (proper fix)**
Each format needs its pattern data decoded from the module binary. This requires understanding each format's binary layout.

**Approach B: Fall through to tick reconstruction (quick fix)**  
Return `null` from the native route so FORCE_CLASSIC handles it with `reconstructClassicPatterns()`, which captures CIA tick snapshots during UADE playback and builds approximate display-only patterns. This gives note visualization without editing.

**Approach C: Hybrid**
For formats with sample extraction (Beathoven, RiffRaff, HowieDavies), keep the native parser for samples but augment with tick-reconstructed patterns. Similar to how TFMX uses `augmentWithUADEAudio()`.

### SynTracker format analysis (partially done)
Downloaded test module: `/tmp/storm.synmod` (44,772 bytes, by Twice/RAVE)

Binary structure discovered:
```
0x0000: "SYNTRACKER-SONG:" magic (16 bytes)
0x0010: u16BE numSamples=25, u16BE unknown=22
0x0014: Song name (null-terminated)
0x003C: Author name (null-terminated)
0x0214: Sample names (32 bytes per entry × 25)
0x0418: Sample table (16 bytes per entry × 25):
        u16 sampleLenWords, u16 volume, u16 flags, u16 unused,
        u16 loopStart?, u16 loopLen?, u32 sampleDataOffset
0x05A8: Channel descriptors? (16 bytes × 4?)
0x0614: Position list channel 0 (25 entries, padded to ~128 bytes)
0x0697: Position list channel 1 (22 entries)
0x0714: Position list channel 2 (25 entries)
0x0795: Position list channel 3 (24 entries)
0x0800+: Pattern data (sparse — synthesis events at specific row positions)
~0x1CE2: Sample data base (synth waveforms 0-15 = 32 bytes each; PCM samples 16-24)
```

**Entries 0-15** in the sample table are tiny synth waveforms (16 words = 32 bytes each).
**Entries 16-24** are real PCM samples with larger sizes.

The pattern data is SPARSE (mostly zeros with scattered event bytes) — this is a synthesis tracker, not a dense ProTracker format. The pattern cell structure needs the UADE player binary disassembled to decode properly.

### Wanted Team header format (documented)
Three formats have documented Wanted Team wrappers via `docs/formats/Replayers/eagleplayers/*/Standard.header`:
- **BeathovenSynthesizer**: magic `BEATHOVEN109|100|NEW`, 76-byte pointer table
- **RiffRaff**: magic `RIFFRAFF`, 68-byte pointer table  
- **HowieDavies**: magic `H.DAVIES`, 68-byte pointer table

All three parsers already extract sample data from the pointer table. Pattern data is embedded in the replay code section — not accessible without disassembly.

Beathoven is noted as "very similar to Dave Lowe format" (from EP readme) — if the command stream matches, `DaveLoweParser` could potentially decode its pattern data.

### Format docs location
- `docs/formats/Replayers/` — replayer source code (MarkI.s, MarkI+.s, MarkIISoundSystem.s)
- `docs/formats/Replayers/eagleplayers/` — EP readmes, Standard.headers, WT_Customs.txt module lists
- Downloaded EP packages in `/Users/spot/Downloads/` — Silmarils, Sound Images, Beathoven, Riff Raff, Howie Davies, Dynamic Synthesizer

### UADE player binary analysis
All remaining formats have player binaries in `third-party/uade-3.05/players/` using `DELIRIUM` or `EPPLAYER` wrapper magic. Key finding: NONE use `JSR (A0)` to jump into module code — they all read the module as data. The "self-playing" label was incorrect for most formats.

True self-playing formats (module IS code):
- KrisHatlelid — LoadSeg + patch + jsr into module's own songplay
- DariusZendeh — `move.l M_Addr,a0; jsr (a0)` wrapper
- MarkII — `move.l _adr_data,a0; jsr (a0)` wrapper

Data-driven formats (player binary reads module data):
- All others — player binary contains full replay engine, module is data

## Critical Files
- `src/lib/import/formats/UADEParser.ts` — NATIVE_ROUTES (line ~930+), FORCE_CLASSIC lists
- `src/lib/import/formats/WantedTeamUtils.ts` — HUNK parser, magic matching
- `src/lib/import/formats/*Parser.ts` — individual format parsers
- `src/engine/uade/UADEPatternEncoder.ts` — UADEPatternLayout interface
- `src/engine/uade/UADEChipEditor.ts` — chip RAM patching
- `src/engine/uade/encoders/` — per-format cell encoders
- `third-party/uade-3.05/players/` — compiled UADE player binaries
- `third-party/uade-3.05/amigasrc/players/` — ASM source (where available)
- `docs/formats/Replayers/` — format documentation and replayer sources

## Completed (2026-04-13 session 2)

1. ✅ **Stub parsers → tick reconstruction** (commit 7a8498c30):
   - 9 stub parsers (SynTracker, DynamicSynthesizer, SoundImages, Silmarils, VoodooSupreme, AProSys, SoundProgrammingLanguage, MarkII, DavidHanney) return `null` from NATIVE_ROUTES → fall through to FORCE_CLASSIC → tick-reconstructed patterns
   - 4 sample-extracting parsers (Beathoven, RiffRaff, HowieDavies, KrisHatlelid) use hybrid: `augmentWithUADEAudio()` + `uadeDeferredCapture = true` → samples preserved + patterns reconstructed during playback

2. ✅ **SynTracker pattern decoding** (commit c1580abda):
   - Reverse-engineered from player binary + test module: 4 bytes/cell (note, instrument, ASCII effect, value), 32 rows/pattern, per-channel position lists
   - Full parser with 12 effects mapped to XM equivalents, 956 non-empty cells in test module
   - Restored native route (no longer falling through to tick reconstruction)

3. ✅ **Beathoven/DaveLowe investigation**:
   - Confirmed: command stream format is identical to DaveLowe (word > 100 = note period, 32 = rest, 8 = seq_advance)
   - BUT: channel pointer extraction requires disassembling InitSong code, which varies between BEATHOVEN100/109/NEW variants
   - Only 7/32 test modules match the simple `MOVE.L #ptr, $0A(A0)` pattern; BEATHOVEN109 uses completely different register-based setup
   - **Verdict**: Generic pattern extraction not practical. Current hybrid approach (samples + deferred tick capture) is the right answer.

## Remaining Next Steps
- For formats needing higher-fidelity patterns than tick reconstruction: disassemble specific player binaries per-format
- Future enhancement: merge native sample data into tick-reconstructed patterns (currently tick reconstruction creates its own instrument mapping)
