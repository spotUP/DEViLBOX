# UADE Format Implementation Status

Track which formats have native parsers vs UADE-only, and which are claimed by which tab.
**Update this file when you start or finish work on a format.**

---

## How to Claim a Format

Add your tab ID and the date to the "Claimed by" column before starting work.
Release it (clear the column) when done.

---

## ✅ Implemented (native parser integrated in parseModuleToSong.ts)

| Extension(s) | Format | Parser File | Notes |
|---|---|---|---|
| `.hvl`, `.ahx` | HivelyTracker / AHX | HivelyParser.ts | UADE fallback available |
| `.okt` | Oktalyzer | OktalyzerParser.ts | UADE fallback available |
| `.med`, `.mmd0`–`.mmd3` | OctaMED / MED | MEDParser.ts | UADE fallback available |
| `.digi` | DigiBooster | DigiBoosterParser.ts | UADE fallback available |
| `.dm2` | Delta Music 2.0 | DeltaMusic2Parser.ts | dm/dm1 still UADE-only |
| `.sa` | Sonic Arranger | SonicArrangerParser.ts | sa-p, sa_old still UADE |
| `.bp`, `.bp3`, `.sndmon` | SoundMon | SoundMonParser.ts | UADE fallback |
| `.sid2`, `.smn` | SidMon II | SidMon2Parser.ts | UADE fallback |
| `.smn` | SidMon 1.0 | SidMon1Parser.ts | magic detection; smn tried first |
| `.fred` | Fred Editor | FredEditorParser.ts | UADE fallback |
| `.sfx`, `.sfx13` | Sound-FX | SoundFXParser.ts | UADE fallback |
| `.dmu`, `.dmu2`, `.mug`, `.mug2` | Digital Mugician | DigitalMugicianParser.ts | UADE fallback |
| `.tfmx`, `.mdat` | TFMX (Jochen Hippel) | TFMXParser.ts | UADE fallback |
| `.hipc`, `.soc`, `.coso` | Hippel CoSo | HippelCoSoParser.ts | UADE fallback |
| `.rh`, `.rhp` | Rob Hubbard | RobHubbardParser.ts | UADE fallback |
| `.dw`, `.dwold` | David Whittaker | DavidWhittakerParser.ts | UADE fallback |
| `.aon`, `.aon8` | Art of Noise | ArtOfNoiseParser.ts | UADE fallback |
| `.bd`, `.bds` | Ben Daglish | BenDaglishParser.ts | UADE fallback |
| `.jam`, `.jc` | JamCracker | JamCrackerParser.ts | UADE fallback |
| `.emod`, `.qc` | Quadra Composer | QuadraComposerParser.ts | UADE fallback |
| `.abk` | AMOS Music Bank | AMOSMusicBankParser.ts | UADE fallback |
| `.tcb` | TCB Tracker | TCBTrackerParser.ts | UADE fallback |
| `.fc`, `.fc13`, `.fc14`, `.sfc`, etc. | Future Composer | FCParser.ts | FC2/3/4 UADE fallback |
| `.puma` | PumaTracker | PumaTrackerParser.ts | ✅ Just implemented 2026-02-26 |
| `.is`, `.is10` | InStereo! 1.0 | InStereo1Parser.ts | |
| `.is20` | InStereo! 2.0 | InStereo2Parser.ts | |
| `.ims` | Images Music System | IMSParser.ts | No magic; structural validation. 3-byte cells. ✅ 2026-02-26 |
| `.ice` | ICE Tracker / SoundTracker 2.6 | ICEParser.ts | Magic "MTN\0"/"IT10" at +1464. Track-based. ✅ 2026-02-26 |
| `.kris` | ChipTracker | KRISParser.ts | Magic "KRIS" at +952. Track-based w/ transpose. ✅ 2026-02-26 |
| `.gmc` | Game Music Creator | GMCParser.ts | No magic; 15 samples, 444-byte header. ✅ 2026-02-26 |

---

## 🔧 Good Candidates (structured, parseable, reference code available)

Formats that would benefit from native parsing. Check OpenMPT (`Reference Code/openmpt-master/soundlib/`) and NostalgicPlayer first.

| Extension(s) | Format | Reference Code | Claimed by | Notes |
|---|---|---|---|---|
| `.rj`, `.rjp` | Richard Joseph | ? | — | Two-file format (.sng+.ins). NostalgicPlayer has source. Complex synthesis. |
| `.dm`, `.dlm1` | Delta Music 1.x | openmpt: Load_dm.cpp? | — | Different from dm2; check if OpenMPT has a loader |
| `.ams` | AMS Synthesizer | openmpt: Load_ams.cpp | — | Check if this is the Amiga format |
| `.qpa`, `.qts`, `.sqt` | Quartet | ? | — | Atari ST quartet module |
| `.sng` | ZoundMonitor | openmpt? | — | Not to be confused with Richard Joseph .sng |
| `.mon` | Manics of Noise | NostalgicPlayer? | — | Complex synth format |
| `.trc`, `.tronic` | Tronic | ? | — | Dirk Bialluch format (same author as PumaTracker!) |
| `.tpu` | DirkBialluch | ? | — | Another Dirk Bialluch format |
| `.is`, `.is20` | InStereo! | Already have parsers | — | Check if wired into parseModuleToSong |
| `.jmf` | Janko Mrsic-Flogel | ? | — | Check NostalgicPlayer |
| `.gmc` | GMC | GMCParser.ts | — | ✅ Implemented 2026-02-26 — moved to Implemented table |

---

## ❌ Not Parseable (compiled 68k players / binary executables)

These are Amiga binary executables with embedded player code. They cannot be parsed as structured data without 68k disassembly. UADE handles them by running the actual Amiga player code.

| Extension(s) | Format | Reason |
|---|---|---|
| `.hip` | Jochen Hippel | Compiled 68k binary |
| `.hip7` | Jochen Hippel 7V | Compiled 68k binary |
| `.hst` | Hippel ST | Compiled 68k binary |
| `.sog` | Hippel ST (sog) | Compiled 68k binary |
| `.ash` | Ashley Hogg | Likely compiled binary |
| `.gray` | Fred Gray | Compiled binary |
| `.cin` | Cinemaware | Likely compiled binary |
| `.dum` | Infogrames | Likely compiled binary |
| `.fw` | ForgottenWorlds | Likely compiled binary |
| `.scumm` | SCUMM | Complex game engine format |
| `.wb` | Wally Beben | Likely binary |

---

## 🔄 UADE Catch-All (no native parser, lowest priority)

These go through UADE's catch-all. They work for playback but produce placeholder patterns for editing.

Most packed MOD variants (`.ac1`, `.p40a`, `.pm`, etc.), obscure one-offs (`.aps`, `.hot`, `.aam`, etc.), and formats without good reference code.

---

## Reference Code Priority

1. **OpenMPT** (`Reference Code/openmpt-master/soundlib/Load_*.cpp`) — most accurate, C++
2. **NostalgicPlayer** (`Reference Code/NostalgicPlayer/`) — second choice, C#
3. **libxmp** — third choice
4. **UADE assembly** — most authentic but hardest to read (68k asm)

---

## Recently Completed

- **2026-02-26**: IMSParser.ts — Images Music System (.ims), no magic, structural validation, 3-byte pattern cells. OpenMPT Load_ims.cpp reference.
- **2026-02-26**: ICEParser.ts — ICE Tracker / SoundTracker 2.6 (.ice), "MTN\0"/"IT10" magic at +1464, track-based patterns. OpenMPT Load_ice.cpp reference.
- **2026-02-26**: KRISParser.ts — ChipTracker (.kris), "KRIS" magic at +952, track-based with per-track transpose. OpenMPT Load_kris.cpp reference.
- **2026-02-26**: GMCParser.ts — Game Music Creator (.gmc), 15 samples, 444-byte header, loop from sample end. OpenMPT Load_gmc.cpp reference.
- **2026-02-26**: PumaTrackerParser.ts — PumaTracker (.puma), 4-channel Amiga tracker by Dirk Bialluch. Uses OpenMPT Load_puma.cpp as reference. 42 built-in waveforms embedded. RLE pattern decoding, vol/pitch script parsing for initial waveform assignment.
- **2026-02-26**: SonicArrangerParser.ts — Sonic Arranger (.sa), implemented by other tab
- **2026-02-26**: DeltaMusic2Parser.ts — Delta Music 2.0 (.dm2), implemented by other tab
