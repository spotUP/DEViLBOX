# Format Implementation Status

Track which formats have native parsers vs UADE-only.
**Update this file when starting or finishing work on a format.**

---

## Reference Code Priority

1. **OpenMPT** (`Reference Code/openmpt-master/soundlib/Load_*.cpp`) — most accurate, use first
2. **NostalgicPlayer** (`thoughts/shared/research/nostalgicplayer/sources/{Format}/`) — second choice, C#
3. **libxmp** (`Reference Code/libxmp-master/`) — third choice
4. **UADE** — most authentic but hardest to read (68k asm)

---

## ✅ Implemented (native parser in parseModuleToSong.ts)

| Extension(s) | Format | Parser File | Reference | Notes |
|---|---|---|---|---|
| `.mod` | ProTracker / MOD | MODParser.ts + libopenmpt | OpenMPT | UADE fallback |
| `.hvl`, `.ahx` | HivelyTracker / AHX | HivelyParser.ts | HivelyTracker src | UADE fallback |
| `.okt` | Oktalyzer | OktalyzerParser.ts | NostalgicPlayer | UADE fallback |
| `.med`, `.mmd0`–`.mmd3` | OctaMED / MED | MEDParser.ts | libxmp med.h | OctaMEDSynth for SynthInstr |
| `.digi` | DigiBooster | DigiBoosterParser.ts | NostalgicPlayer | UADE fallback |
| `.bp`, `.bp3`, `.sndmon` | SoundMon | SoundMonParser.ts | NostalgicPlayer | UADE fallback |
| `.sid2`, `.smn` | SidMon II | SidMon2Parser.ts | NostalgicPlayer | UADE fallback |
| `.smn`, `.sid1` | SidMon 1.0 | SidMon1Parser.ts | FlodJS S1Player | .smn tries SM1 magic first |
| `.fred` | Fred Editor | FredEditorParser.ts | NostalgicPlayer | UADE fallback |
| `.sfx`, `.sfx13` | Sound-FX | SoundFXParser.ts | OpenMPT | UADE fallback |
| `.dmu`, `.dmu2`, `.mug`, `.mug2` | Digital Mugician | DigitalMugicianParser.ts | NostalgicPlayer | UADE fallback |
| `.tfmx`, `.mdat` | TFMX (Jochen Hippel) | TFMXParser.ts | libtfmxaudiodecoder | UADE fallback |
| `.hipc`, `.soc`, `.coso` | Hippel CoSo | HippelCoSoParser.ts | FlodJS + WASM synth | UADE fallback |
| `.rh`, `.rhp` | Rob Hubbard | RobHubbardParser.ts | FlodJS + WASM synth | UADE fallback |
| `.dw`, `.dwold` | David Whittaker | DavidWhittakerParser.ts | FlodJS + WASM synth | UADE fallback |
| `.aon`, `.aon8` | Art of Noise | ArtOfNoiseParser.ts | NostalgicPlayer | UADE fallback |
| `.bd`, `.bds` | Ben Daglish | BenDaglishParser.ts | NostalgicPlayer | UADE fallback |
| `.jam`, `.jc` | JamCracker | JamCrackerParser.ts | NostalgicPlayer | UADE fallback |
| `.emod`, `.qc` | Quadra Composer | QuadraComposerParser.ts | NostalgicPlayer | UADE fallback |
| `.abk` | AMOS Music Bank | AMOSMusicBankParser.ts | — | routing only |
| `.tcb` | TCB Tracker | TCBTrackerParser.ts | **OpenMPT** Load_tcb.cpp | UADE fallback |
| `.fc`, `.fc13`, `.fc14`, `.sfc` | Future Composer | FCParser.ts | FlodJS | FC2/3/4 → UADE |
| `.sa`, `.sonic` | Sonic Arranger | SonicArrangerParser.ts | NostalgicPlayer | LH-compressed → UADE |
| `.puma` | PumaTracker | PumaTrackerParser.ts | **OpenMPT** Load_puma.cpp | UADE fallback |
| `.dm2` | Delta Music 2.0 | DeltaMusic2Parser.ts | NostalgicPlayer + spec | .dm/.dm1 → UADE |
| `.gmc` | Game Music Creator | GameMusicCreatorParser.ts | **OpenMPT** Load_gmc.cpp | UADE fallback |
| `.ftm` | Face The Music | FaceTheMusicParser.ts | **OpenMPT** Load_ftm.cpp | embedded samples only; external → UADE |
| `.st` | Sawteeth | SawteethParser.ts | NostalgicPlayer | SWTD magic required; UADE fallback |
| `.sc`, `.sct` | Sound Control | SoundControlParser.ts | NostalgicPlayer | v3.x/4.0/5.0 sub-formats; UADE fallback |
| `.psf` | Sound Factory | SoundFactoryParser.ts | NostalgicPlayer | opcode stream; 16 subsongs; UADE fallback |
| `.is`, `.is10` | InStereo! 1.0 | InStereo1Parser.ts | NostalgicPlayer | UADE fallback |
| `.is`, `.is20` | InStereo! 2.0 | InStereo2Parser.ts | NostalgicPlayer | IS20 magic tried first |
| `.act` | Actionamics | ActionamicsParser.ts | NostalgicPlayer | UADE fallback |
| `.avp`, `.mw` | Activision Pro | ActivisionProParser.ts | NostalgicPlayer | M68k heuristic; UADE fallback |
| `.rk`, `.rkb` | Ron Klaren | RonKlarenParser.ts | NostalgicPlayer | HUNK magic + sig; UADE fallback |
| `.ay` | AY / ZX Spectrum | AYParser.ts | — | native only |
| `.sap` | SAP (Atari POKEY) | SAPParser.ts | — | native only |
| `.sid` | SID (C64) | SIDParser.ts | — | native only |
| `.vgm`, `.vgz` | VGM | VGMParser.ts | — | native only |
| `.ym` | YM (Atari ST) | YMParser.ts | — | native only |
| `.nsf`, `.nsfe` | NSF (NES) | NSFParser.ts | — | native only |
| `.xm` | XM (FastTracker II) | XMParser.ts | — | native only |
| `.syn` | Synthesis | SynthesisParser.ts | NostalgicPlayer | Synth4.0/4.2; UADE fallback |
| `.ma` | Music Assembler | MusicAssemblerParser.ts | NostalgicPlayer | M68k heuristic; UADE fallback |

---

## 🔄 In Progress (agents currently implementing)

| Format | Parser File | Reference | Extensions |
|---|---|---|---|

---

## 🎯 Queued (NostalgicPlayer reference already downloaded)

| Format | Parser File (planned) | Reference | Notes |
|---|---|---|---|
| Digital Sound Studio | DigitalSoundStudioParser.ts | NostalgicPlayer + DSS.txt spec | `.dss` |

---

## 🔧 Good Candidates (reference not yet downloaded)

| Extension(s) | Format | OpenMPT Loader | Notes |
|---|---|---|---|
| `.dm`, `.dlm1` | Delta Music 1.x | — | NP: DeltaMusic10 player available |
| `.dsym` | Digital Symphony | Load_dsym.cpp (615 ln) | |
| `.gt2` | Graoumf Tracker 2 | Load_gt2.cpp (1566 ln) | |
| `.symmod` | Symphonie Pro | Load_symmod.cpp (1947 ln) | |
| `.rjp`, `.sng` | Richard Joseph | NP source available | Two-file format (.sng+.ins) |
| `.trc` | Tronic | — | Same author as PumaTracker |

## 🚧 Claimed — In Progress (this session, 2026-02-26)

| Extension(s) | Format | OpenMPT Loader | Parser File |
|---|---|---|---|
| `.unic` | UNIC Tracker | Load_unic.cpp (251 ln) | UNICParser.ts |
| `.mtm` | MultiTracker | Load_mtm.cpp (318 ln) | MTMParser.ts |
| `.669` | Composer 669 | Load_669.cpp (332 ln) | Format669Parser.ts |
| `.far` | Farandole Composer | Load_far.cpp (336 ln) | FARParser.ts |
| `.plm` | Disorder Tracker 2 | Load_plm.cpp (409 ln) | PLMParser.ts |
| `.ult` | Ultra Tracker | Load_ult.cpp (435 ln) | ULTParser.ts |
| `.rtm` | Reality Tracker | Load_rtm.cpp (443 ln) | RTMParser.ts |
| `.dsm` | DSIK Sound Module | Load_dsm.cpp (525 ln) | DSMParser.ts |
| `.dtm` | Digital Tracker | Load_dtm.cpp (596 ln) | DTMParser.ts |
| `.stm` | ScreamTracker 2 | Load_stm.cpp (615 ln) | STMParser.ts |

---

## ❌ Not Parseable (compiled 68k executables — UADE only)

| Extension(s) | Format |
|---|---|
| `.hip`, `.hip7`, `.hst`, `.sog` | Jochen Hippel variants (other than CoSo) |
| `.ash` | Ashley Hogg |
| `.gray` | Fred Gray |
| `.cin` | Cinemaware |
| `.dm`, `.dm1`, `.dlm1`, `.dlm2` | Delta Music 1.x (compiled player binary) |

---

## Recently Completed

| Date | Format | Parser | Reference used |
|---|---|---|---|
| 2026-02-26 | Synthesis | SynthesisParser.ts | NostalgicPlayer |
| 2026-02-26 | Music Assembler | MusicAssemblerParser.ts | NostalgicPlayer |
| 2026-02-26 | InStereo! 1.0 & 2.0 | InStereo1Parser.ts, InStereo2Parser.ts | NostalgicPlayer |
| 2026-02-26 | PumaTracker | PumaTrackerParser.ts | **OpenMPT** Load_puma.cpp |
| 2026-02-26 | Sonic Arranger | SonicArrangerParser.ts | NostalgicPlayer |
| 2026-02-26 | Art of Noise | ArtOfNoiseParser.ts | NostalgicPlayer |
| 2026-02-26 | Ben Daglish | BenDaglishParser.ts | NostalgicPlayer |
| 2026-02-26 | Delta Music 2.0 | DeltaMusic2Parser.ts | NostalgicPlayer + format spec |
| 2026-02-26 | MEDParser → OctaMEDSynth | MEDParser.ts fix | libxmp med.h |
| 2026-02-26 | David Whittaker | DavidWhittakerParser.ts | FlodJS DWPlayer + WASM synth |
| 2026-02-26 | SidMon 1.0 | SidMon1Parser.ts | FlodJS S1Player + WASM synth |
| 2026-02-26 | Rob Hubbard | RobHubbardParser.ts | FlodJS + WASM synth |
| 2026-02-26 | Hippel CoSo | HippelCoSoParser.ts | FlodJS + WASM synth |
| 2026-02-26 | TCB Tracker | TCBTrackerParser.ts | **OpenMPT** Load_tcb.cpp |
| 2026-02-26 | Game Music Creator | GameMusicCreatorParser.ts | **OpenMPT** Load_gmc.cpp |
| 2026-02-26 | Face The Music | FaceTheMusicParser.ts | **OpenMPT** Load_ftm.cpp |
| 2026-02-26 | Actionamics | ActionamicsParser.ts | NostalgicPlayer |
| 2026-02-26 | Activision Pro | ActivisionProParser.ts | NostalgicPlayer |
| 2026-02-26 | Ron Klaren | RonKlarenParser.ts | NostalgicPlayer |
| 2026-02-26 | Sawteeth | SawteethParser.ts | NostalgicPlayer |
| 2026-02-26 | Sound Control | SoundControlParser.ts | NostalgicPlayer |
| 2026-02-26 | Sound Factory | SoundFactoryParser.ts | NostalgicPlayer |
