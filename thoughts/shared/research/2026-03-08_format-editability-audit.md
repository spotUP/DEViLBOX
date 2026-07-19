---
date: 2026-03-08
topic: format-editability-audit
tags: [formats, editing, uade, chip-ram, encoders]
status: in-progress
---

# Format Editability Audit

## Legend
- **DONE** = Has `uadePatternLayout` + encoder, fully editable via chip RAM
- **TODO** = Has parser with real pattern data, can add encoder
- **OWN_ENGINE** = Uses own WASM engine, needs different editing approach
- **STUB** = No real pattern data (compiled 68k / register dumps / empty)
- **LIBOPENMPT** = Played via libopenmpt, not UADE chip RAM
- **N/A** = Not a pattern-based format

---

## DONE — Editable via UADE Chip RAM (44 formats)

| # | Format | Parser | Bytes/Cell | Ch |
|---|--------|--------|-----------|-----|
| 1 | AMF (Asylum) | AMFParser.ts | 4 | var |
| 2 | Art of Noise | ArtOfNoiseParser.ts | 4 | 4/8 |
| 3 | Chuck Biscuits | ChuckBiscuitsParser.ts | 5 | var |
| 4 | Composer 667 | Composer667Parser.ts | 3 | 8 |
| 5 | Delta Music 1 | DeltaMusic1Parser.ts | 4 | 4 |
| 6 | Delta Music 2 | DeltaMusic2Parser.ts | 4 | 4 |
| 7 | DigiBooster 1.x | DigiBoosterParser.ts | 4 | var |
| 8 | Digital Mugician | DigitalMugicianParser.ts | 4 | 4 |
| 9 | Digital Sound Studio | DigitalSoundStudioParser.ts | 4 | 4 |
| 10 | DSIK Sound Module | DSMParser.ts | 4 | var |
| 11 | Digital Tracker | DTMParser.ts | 4 | var |
| 12 | Farandole | FARParser.ts | 4 | var |
| 13 | Future Composer | FCParser.ts | 2 | 4 |
| 14 | Composer 669 | Format669Parser.ts | 3 | 8 |
| 15 | Game Music Creator | GameMusicCreatorParser.ts | 4 | 4 |
| 16 | GMC (alt) | GMCParser.ts | 4 | 4 |
| 17 | Graoumf Tracker 2 | GraoumfTracker2Parser.ts | 5 | var |
| 18 | ICE Tracker | ICEParser.ts | 4 | 4 |
| 19 | Images Music System | IMSParser.ts | 3 | 4 |
| 20 | InStereo! 1.0 | InStereo1Parser.ts | 4 | 4 |
| 21 | InStereo! 2.0 | InStereo2Parser.ts | 4 | 4 |
| 22 | ChipTracker (KRIS) | KRISParser.ts | 4 | 4 |
| 23 | OctaMED / MED | MEDParser.ts | 3/4 | var |
| 24 | Magnetic Fields | MFPParser.ts | 4 | 4 |
| 25 | MultiTracker | MTMParser.ts | 3 | var |
| 26 | NoiseRunner | NRUParser.ts | 4 | 4 |
| 27 | Oktalyzer | OktalyzerParser.ts | 4 | 4-8 |
| 28 | Disorder Tracker 2 | PLMParser.ts | 5 | var |
| 29 | ProTracker 3.6 | PT36Parser.ts | 4 | 4 |
| 30 | Quadra Composer | QuadraComposerParser.ts | 4 | 4 |
| 31 | SidMon 1 | SidMon1Parser.ts | 5 | 4 |
| 32 | Sonic Arranger | SonicArrangerParser.ts | 4 | 4 |
| 33 | Sound Control | SoundControlParser.ts | 4 | 4 |
| 34 | Sound-FX | SoundFXParser.ts | 4 | 4 |
| 35 | SoundMon | SoundMonParser.ts | 3 | 3 |
| 36 | Ultimate SoundTracker | STKParser.ts | 4 | 4 |
| 37 | ScreamTracker 2 | STMParser.ts | 4 | 4 |
| 38 | SoundTracker Pro II | STPParser.ts | 4 | var |
| 39 | Synthesis | SynthesisParser.ts | 4 | 4 |
| 40 | TCB Tracker | TCBTrackerParser.ts | 2 | 4 |
| 41 | TFMX | TFMXParser.ts | 4 | var |
| 42 | UNIC Tracker | UNICParser.ts | 3 | 4 |
| 43 | XMF / Imperium Galactica | XMFParser.ts | 6 | var |
| 44 | ZoundMonitor | ZoundMonitorParser.ts | 4 | 4 |

---

## TODO — Need Encoder + Layout (real patterns, UADE playback)

| # | Format | Parser | Status | Bytes/Cell | Ch | Notes |
|---|--------|--------|--------|-----------|-----|-------|
| 1 | AMOS Music Bank | AMOSMusicBankParser.ts | TODO | ? | 4 | Has real cell decoding, needs layout analysis |
| 2 | FuturePlayer | FuturePlayerParser.ts | TODO | 4 | 4 | Own engine but UADE-compatible |
| 3 | SidMon II | SidMon2Parser.ts | TODO | ? | 4 | Transpiled 68k, own engine |
| 4 | Music-Assembler | MusicAssemblerParser.ts | TODO | ? | 4 | Transpiled 68k, own engine |
| 5 | PumaTracker | PumaTrackerParser.ts | TODO | ? | 4 | Transpiled 68k, own engine |

---

## OWN_ENGINE — Own WASM Engine, Different Editing Approach Needed

| # | Format | Parser | Real Patterns? | Engine | Status |
|---|--------|--------|---------------|--------|--------|
| 1 | HivelyTracker | HivelyParser.ts | YES | HivelyEngine | Separate editing system |
| 2 | Klystrack | KlysParser.ts | YES | KlysEngine | WASM extracts patterns |
| 3 | JamCracker | JamCrackerParser.ts | Metadata | JamCrackerEngine | Compiled 68k |
| 4 | PreTracker | PreTrackerParser.ts | Stub | PreTrackerEngine | WASM handles all |
| 5 | Jochen Hippel ST | JochenHippelSTParser.ts | Metadata | HippelEngine | Compiled 68k |
| 6 | Sonix Music Driver | SonixMusicDriverParser.ts | Metadata | SonixEngine | IFF sub-formats |
| 7 | MusicLine | MusicLineParser.ts | YES | MusicLineEngine | Own editing system |
| 8 | Symphonie Pro | SymphonieProParser.ts | YES | SymphonieEngine | Own WASM, being worked on |
| 9 | C64 SID | SIDParser.ts | Stub | C64SIDEngine | C64 emulation |
| 10 | PxTone | PxtoneParser.ts | Stub | PxtoneEngine | Event stream |
| 11 | Organya | OrganyaParser.ts | Stub | OrganyaEngine | Event stream |
| 12 | Psycle | CpsycleParser.ts | Stub | CpsycleEngine | Plugin tracker |
| 13 | FM Towns EUP | EupminiParser.ts | Stub | EupminiEngine | FM Towns |
| 14 | Ixalance | IxalanceParser.ts | Stub | IxalanceEngine | Event stream |
| 15 | ZX Spectrum | ZxtuneParser.ts | Stub | ZxtuneEngine | AY chip |
| 16 | SC68 / SNDH | Sc68Parser.ts | Stub | Sc68Engine | 68k + YM2149 |
| 17 | Ben Daglish | BenDaglishParser.ts | Metadata | BdEngine | Compiled 68k |

---

## LIBOPENMPT — Played via libopenmpt, Not UADE

| # | Format | Parser | Real Patterns? | Notes |
|---|--------|--------|---------------|-------|
| 1 | ProTracker MOD | MODParser.ts | NO | OpenMPT handles both |
| 2 | ScreamTracker 3 | S3MParser.ts | YES | Compressed patterns |
| 3 | Impulse Tracker | ITParser.ts | YES | Compressed patterns |
| 4 | FastTracker II | XMParser.ts | YES | Compressed patterns |
| 5 | X-Tracker DMF | XTrackerParser.ts | YES | Real cells |
| 6 | PolyTracker | PTMParser.ts | YES | Real cells |
| 7 | General DigiMusic | GDMParser.ts | NO | OpenMPT only |
| 8 | Ultra Tracker | ULTParser.ts | NO | OpenMPT only |
| 9 | Reality Tracker | RTMParser.ts | YES | Real cells |
| 10 | DigiTrakker | MDLParser.ts | YES | Compressed blocks |
| 11 | Extreme's Tracker | AMSParser.ts | YES | Compressed patterns |
| 12 | DigiBooster Pro | DigiBoosterProParser.ts | YES | RLE compressed |
| 13 | Digital Symphony | DigitalSymphonyParser.ts | YES | LZW compressed |
| 14 | Face The Music | FaceTheMusicParser.ts | YES | Event stream |
| 15 | MadTracker 2 | MadTracker2Parser.ts | YES | Real cells |
| 16 | PSM (Epic Games) | PSMParser.ts | YES | Compressed |
| 17 | Imago Orpheus | ImagoOrpheusParser.ts | YES | Real cells |
| 18 | CDFM 670 | CDFM67Parser.ts | YES | Real cells |
| 19 | STX (STMIK) | STXParser.ts | YES | Real cells |
| 20 | Karl Morton | KarlMortonParser.ts | YES | Real cells |

---

## STUB / N/A — No Real Pattern Data (70+ formats)

Compiled 68k, register dumps, CPU binaries, prefix-only metadata extraction.
Pattern editing not feasible — data is embedded in machine code.

Includes: David Whittaker, Fred Editor, Ben Daglish SID, Sean Conran,
Thomas Hermann, Custom Made, Dave Lowe (old/new), Mark Cooksey,
Jeroen Tel, Steve Turner, Quartet, Sound Master, Richard Joseph,
Jason Page, Rob Hubbard (Amiga/ST), VGM, NSF, SAP, YM, AY, GBS,
KSS, HES, SPC, S98, MDX, PMD, AdPlug, Furnace, DefleMask, and 40+ more.

---

## Progress Summary

| Category | Count | % |
|----------|-------|---|
| DONE (editable) | 44 | 100% of feasible UADE formats |
| TODO (can add encoder) | 5 | need investigation |
| OWN_ENGINE | 17 | different approach needed |
| LIBOPENMPT | 20 | not chip RAM |
| STUB/N/A | 70+ | not feasible |
| **TOTAL parsers** | ~190 | |
