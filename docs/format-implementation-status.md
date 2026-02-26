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
| `.rh`, `.rhp` | Rob Hubbard | RobHubbardParser.ts | UADE eagleplayer asm | UADE fallback |
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
| `.unic` | UNIC Tracker | UNICParser.ts | **OpenMPT** Load_unic.cpp | OpenMPT fallback |
| `.mtm` | MultiTracker | MTMParser.ts | **OpenMPT** Load_mtm.cpp | OpenMPT fallback |
| `.669` | Composer 669 | Format669Parser.ts | **OpenMPT** Load_669.cpp | OpenMPT fallback |
| `.far` | Farandole Composer | FARParser.ts | **OpenMPT** Load_far.cpp | OpenMPT fallback |
| `.plm` | Disorder Tracker 2 | PLMParser.ts | **OpenMPT** Load_plm.cpp | OpenMPT fallback |
| `.ult` | Ultra Tracker | ULTParser.ts | **OpenMPT** Load_ult.cpp | OpenMPT fallback |
| `.rtm` | Reality Tracker | RTMParser.ts | **OpenMPT** Load_rtm.cpp | OpenMPT fallback |
| `.dsm` | DSIK Sound Module | DSMParser.ts | **OpenMPT** Load_dsm.cpp | OpenMPT fallback |
| `.dtm` | Digital Tracker | DTMParser.ts | **OpenMPT** Load_dtm.cpp | OpenMPT fallback |
| `.stm` | ScreamTracker 2 | STMParser.ts | **OpenMPT** Load_stm.cpp | OpenMPT fallback |
| `.nru` | NoiseRunner | NRUParser.ts | **OpenMPT** Load_nru.cpp | OpenMPT fallback |
| `.ptm` | PolyTracker | PTMParser.ts | **OpenMPT** Load_ptm.cpp | OpenMPT fallback |
| `.gdm` | General DigiMusic | GDMParser.ts | **OpenMPT** Load_gdm.cpp | OpenMPT fallback |
| `.dss` | Digital Sound Studio | DigitalSoundStudioParser.ts | NostalgicPlayer + DSS.txt spec | UADE fallback |
| `.dsym` | Digital Symphony | DigitalSymphonyParser.ts | **OpenMPT** Load_dsym.cpp | UADE fallback |
| `.ims` | Images Music System | IMSParser.ts | **OpenMPT** Load_ims.cpp | heuristic; UADE fallback |
| `.ice` | Ice Tracker / SoundTracker 2.6 | ICEParser.ts | **OpenMPT** Load_ice.cpp | MTN/IT10 magic; UADE fallback |
| `.kris` | ChipTracker / KRIS | KRISParser.ts | **OpenMPT** Load_kris.cpp | KRIS magic at +952; UADE fallback |
| `.pt36` | ProTracker 3.6 | PT36Parser.ts | **OpenMPT** Load_pt36.cpp | FORM/MODL IFF; OpenMPT fallback |
| `.ss` | SpeedySystem / SoundSmith | SpeedySystemParser.ts | **OpenMPT** Load_ss.cpp | DOC RAM samples → UADE |
| `.stk` | Ultimate SoundTracker | STKParser.ts | **OpenMPT** Load_stk.cpp | structural heuristic; OpenMPT fallback |
| `.imf`, `.imff` | Imago Orpheus | ImagoOrpheusParser.ts | **OpenMPT** Load_imf.cpp | IM10/IM20 magic at +60; OpenMPT fallback |
| `.stp` | Sampler Tracker Plus | STPParser.ts | **OpenMPT** Load_stp.cpp | STP3 magic; OpenMPT fallback |
| `.dbm` | DigiBooster Pro | DigiBoosterProParser.ts | **OpenMPT** Load_dbm.cpp | DBM0 IFF; OpenMPT fallback |
| `.amf` | ASYLUM/DSMI AMF | AMFParser.ts | **OpenMPT** Load_amf.cpp | ASYLUM sig or AMF+version; OpenMPT fallback |
| `.mdl` | DigiTrakker | MDLParser.ts | **OpenMPT** Load_mdl.cpp | DMDL magic + version; OpenMPT fallback |
| `.trc`, `.dp`, `.tro` | Tronic | TronicParser.ts | UADE eagleplayer | no magic; extension-only; UADE |
| `.dmf` | X-Tracker DMF | XTrackerParser.ts | **OpenMPT** Load_dmf.cpp | DDMF magic; must precede Furnace .dmf; UADE fallback |
| `.fmt` | FM Tracker | FMTrackerParser.ts | **OpenMPT** Load_fmt.cpp | FM Tracker by Davey W Taylor; OpenMPT fallback |
| `.xmf` | Astroidea XMF | XMFParser.ts | **OpenMPT** Load_xmf.cpp | Imperium Galactica; OpenMPT fallback |
| `.uax` | Unreal Audio Package | UAXParser.ts | custom | Unreal Engine 1 sound ripper |
| `.mt2` | Mad Tracker 2 | MadTracker2Parser.ts | **OpenMPT** Load_mt2.cpp | MT20 magic; OpenMPT fallback |
| `.psm` | PSM / PSM16 (MASI) | PSMParser.ts | **OpenMPT** Load_psm.cpp | "PSM " or "PSM\xFE" magic; OpenMPT fallback |
| `.ams` | AMS (Extreme's / Velvet) | AMSParser.ts | **OpenMPT** Load_ams.cpp | "Extreme" or "AMShdr" magic; UADE fallback |
| `.gt2`, `.gtk` | Graoumf Tracker 2 | GraoumfTracker2Parser.ts | **OpenMPT** Load_gt2.cpp | GT2.0 magic; UADE fallback |
| `.667` | Composer 667 | Composer667Parser.ts | NostalgicPlayer | 6-channel; UADE fallback |
| `.cba` | Chuck Biscuits / Black Artist | ChuckBiscuitsParser.ts | NostalgicPlayer | UADE fallback |
| `.dm`, `.dm1` | Delta Music 1.0 | DeltaMusic1Parser.ts | NostalgicPlayer | "ALL " magic; UADE fallback |
| `.smus`, `.snx`, `.tiny` | IFF SMUS / Sonix | IffSmusParser.ts | NostalgicPlayer | FORM+SMUS IFF; UADE fallback |
| `mfp.*` | Magnetic Fields Packer | MFPParser.ts | NostalgicPlayer | prefix naming; companion smp.* file; UADE fallback |
| `.c67` | CDFM Composer 670 | CDFM67Parser.ts | **OpenMPT** Load_c67.cpp | OpenMPT fallback |
| `.etx` | EasyTrax | EasyTraxParser.ts | NostalgicPlayer | Amiga; UADE fallback |
| `.mus` | Karl Morton Music | KarlMortonParser.ts | NostalgicPlayer | OpenMPT fallback |
| `.rjp`, `.sng`, `RJP.*` | Richard Joseph Player | RichardJosephParser.ts | UADE eagleplayer asm | Two-file (song+SMP); UADE fallback |
| `.ufo`, `.mus` | UFO / MicroProse | UFOParser.ts | UADE eagleplayer asm | IFF FORM+DDAT magic; two-file; UADE fallback |
| `.dl`, `.dl_deli`, `DL.*` | Dave Lowe | DaveLoweParser.ts | UADE eagleplayer asm | Three 68k opcode magic bytes; UADE fallback |
| `.lme`, `LME.*` | Leggless Music Editor | LMEParser.ts | UADE eagleplayer | "LME" magic + zero check; UADE fallback |
| `.fp`, `FP.*` | Future Player | FuturePlayerParser.ts | UADE eagleplayer | 0x000003F3 + "F.PLAYER" magic; UADE fallback |
| `.ml` | Medley | MedleyParser.ts | UADE eagleplayer | "MSOB" magic; subsong count at offset word; UADE fallback |
| `jpn.*`, `jpnd.*`, `jp.*` | Jason Page | JasonPageParser.ts | UADE eagleplayer asm | 3 sub-variants; binary signature heuristic; UADE fallback |
| `.symmod` | Symphonie Pro | SymphonieProParser.ts | **OpenMPT** Load_symmod.cpp | "SymM" magic; chunk-based; custom AudioWorklet synth; UADE fallback |
| `.fur`, `.dmf` (non-DDMF) | Furnace Tracker Song | FurnaceSongParser.ts | furnace-master src + format spec | multi-chip synthesis; subsong support; OpenMPT fallback |
| `jt.*`, `mon_old.*` | Jeroen Tel | JeroenTelParser.ts | UADE eagleplayer asm | ANDI.B 68k scan; 3-file variant; UADE fallback |
| `mc.*`, `mcr.*`, `mco.*` | Mark Cooksey | MarkCookseyParser.ts | UADE eagleplayer asm | 3 sub-variants (Old/New/Rare); binary sig; UADE fallback |
| `qpa.*`, `sqt.*`, `qts.*` | Quartet / Quartet PSG / Quartet ST | QuartetParser.ts | UADE eagleplayer | 3 sub-variants; BRA-pattern detection; UADE fallback |
| `sm.*`, `sm1.*`, `sm2.*`, `sm3.*`, `smpro.*` | Sound Master | SoundMasterParser.ts | UADE eagleplayer asm | 3×BRA + LEA/RTS + 0x00BFE001 sentinel; UADE fallback |
| `sng.*` | ZoundMonitor | ZoundMonitorParser.ts | UADE eagleplayer asm | computed offset + "df?:"/"?amp" tag; sng.* prefix only; UADE fallback |
| `.psa`, `PSA.*` | Professional Sound Artists | PSAParser.ts | UADE eagleplayer asm | "PSA\0" magic; subsong/instrument counts; UADE fallback |
| `.mmdc`, `MMDC.*` | MMDC (MED Packer) | MMDCParser.ts | UADE eagleplayer asm | "MMDC" magic + structural check; UADE fallback |
| `.jpo`, `.jpold`, `JPO.*` | Steve Turner | SteveTurnerParser.ts | UADE eagleplayer asm | 4×0x2B7C + 68k instruction pattern; UADE fallback |
| `.tme`, `TME.*` | The Musical Enlightenment | TMEParser.ts | UADE eagleplayer asm | buf[0]==0 + size>=7000 + longword checks; UADE fallback |
| `.dum` | Infogrames (DUM) | InfogramesParser.ts | UADE eagleplayer asm | header-offset + rel-offset + null+0x0F tag; UADE fallback |
| `TMK.*` | TimeTracker | TimeTrackerParser.ts | UADE eagleplayer asm | 'TMK' magic + non-zero 4th byte; UADE fallback |
| `SG.*` | TomyTracker | TomyTrackerParser.ts | UADE eagleplayer asm | size>1728 + structural offset checks; UADE fallback |
| `EX.*` | Fashion Tracker | FashionTrackerParser.ts | UADE eagleplayer asm | 5 specific 68k instruction patterns at fixed offsets; UADE fallback |
| `MMS.*`, `SFX20.*` | MultiMedia Sound | MultiMediaSoundParser.ts | UADE eagleplayer asm | 31 even longs <= 0x20000 + 'SO31' magic; UADE fallback |
| `KRIS.*` | ChipTracker (KRIS prefix) | ChipTrackerParser.ts | UADE eagleplayer asm | 'KRIS' magic at offset 952; UADE fallback |
| `CIN.*` | Cinemaware | CinemawareParser.ts | UADE eagleplayer asm | 'IBLK'+'ASEQ' magic; UADE fallback |
| `NTP.*` | NovoTrade Packer | NovoTradePackerParser.ts | UADE eagleplayer asm | 'MODU'+'BODY'+'SAMP' chunks; UADE fallback |
| `ALP.*` | Alcatraz Packer | AlcatrazPackerParser.ts | UADE eagleplayer asm | 'PAn\x10' magic + size check; UADE fallback |
| `UDS.*` | Blade Packer | BladePackerParser.ts | UADE eagleplayer asm | 0x538F4E47 magic; 8-channel; UADE fallback |
| `IMS.*` | Images Music System (prefix) | ImagesMusicSystemParser.ts | UADE eagleplayer asm | offset-arithmetic detection; UADE fallback |
| `SCR.*` | Sean Conran | SeanConranParser.ts | UADE eagleplayer asm | 3-path 68k signature + 128-word scan; UADE fallback |
| `THM.*` | Thomas Hermann | ThomasHermannParser.ts | UADE eagleplayer asm | relocation table offset arithmetic; UADE fallback |
| `TITS.*` | Titanics Packer | TitanicsPackerParser.ts | UADE eagleplayer asm | 128-word scan at offset 180; UADE fallback |
| `KH.*` | Kris Hatlelid | KrisHatlelidParser.ts | UADE eagleplayer asm | 11 fixed-offset checks; UADE fallback |
| `TWO.*` | NTSP System | NTSPParser.ts | UADE eagleplayer asm | 'SPNT' magic + non-zero; UADE fallback |
| `MUS.*`, `UFO.*` | UFO / MicroProse (prefix) | UFOParser.ts | UADE eagleplayer asm | IFF FORM+DDAT+BODY+CHAN; UADE fallback |
| `MOSH.*` | Mosh Packer | MoshPackerParser.ts | UADE eagleplayer asm | 31 sample headers + M.K. at 378; UADE fallback |
| `MUG.*` | Mugician (prefix) | DigitalMugicianParser.ts | UADE eagleplayer asm | reuses DigitalMugician; UADE fallback |
| `MUG2.*` | Mugician II (prefix) | DigitalMugicianParser.ts | UADE eagleplayer asm | reuses DigitalMugician; UADE fallback |
| `CORE.*` | Core Design | CoreDesignParser.ts | UADE eagleplayer asm | 0x000003F3 + 'S.PH'+'IPPS' + 5 non-zero ptrs; UADE fallback |
| `JMF.*` | Janko Mrsic-Flogel | JankoMrsicFlogelParser.ts | UADE eagleplayer asm | 0x000003F3 + 'J.FL'+'OGEL'; UADE fallback |
| `JD.*` | Special FX (Jonathan Dunn) | SpecialFXParser.ts | UADE eagleplayer asm | 4×BRA opcode + even offsets; UADE fallback |
| `SJS.*` | Sound Player (Steve Barrett) | SoundPlayerParser.ts | UADE eagleplayer asm | byte constraints at offsets 1–14; UADE fallback |
| `NPP.*` | Nick Pelling Packer | NickPellingPackerParser.ts | UADE eagleplayer asm | 'COMP' + size range + decompSize check; UADE fallback |
| `PVP.*` | Peter Verswyvelen Packer | PeterVerswyvelenPackerParser.ts | UADE eagleplayer asm | 31 sample headers + step validation; UADE fallback |
| `WB.*` | Wally Beben | WallyBebenParser.ts | UADE eagleplayer asm | BRA + MOVEM.L + BSR opcodes; UADE fallback |
| `SB.*` | Steve Barrett | SteveBarrettParser.ts | UADE eagleplayer asm | 4×BRA loop + MOVE.L DMA register; UADE fallback |
| `SNK.*` | Paul Summers | PaulSummersParser.ts | UADE eagleplayer asm | 0x46FC2700 scan + RTE check; UADE fallback |
| `DSR.*` | Desire | DesireParser.ts | UADE eagleplayer asm | 4×0x00010101 + code scan; UADE fallback |
| `DLN.*` | Dave Lowe New | DaveLoweNewParser.ts | UADE eagleplayer asm | table-based detection; UADE fallback |
| `AVP.*`, `MW.*` | Martin Walker (prefix) | MartinWalkerParser.ts | UADE eagleplayer asm | 5 sub-variants; LSLW + LEA + MOVEM checks; UADE fallback |
| `PS.*` | Paul Shields | PaulShieldsParser.ts | UADE eagleplayer asm | 10 zero bytes + 3 sub-variants; UADE fallback |
| `DAT.*` | Paul Robotham | PaulRobothamParser.ts | UADE eagleplayer asm | structured header + 127×0x3F3F check; UADE fallback |
| `PAP.*` | Pierre Adane Packer | PierreAdaneParser.ts | UADE eagleplayer asm | 4-word offset header + gap equality; UADE fallback |
| `HOT.*` | Anders 0land | Anders0landParser.ts | UADE eagleplayer asm | 3-chunk chain (mpl+mdt+msm); UADE fallback |
| `BYE.*` | Andrew Parton | AndrewPartonParser.ts | UADE eagleplayer asm | 'BANK' magic + 20+40 word range checks; UADE fallback |
| `CM.*`, `RK.*`, `RKB.*` | Custom Made | CustomMadeParser.ts | UADE eagleplayer asm | JMP/JSR/BRA.W + CLR.B scan; UADE fallback |
| `BD.*` | Ben Daglish (prefix) | BenDaglishParser.ts | NostalgicPlayer | 3×BRA + branch target checks; UADE fallback |
| `BDS.*` | Ben Daglish SID | BenDaglishSIDParser.ts | UADE eagleplayer asm | 0x000003F3 + 'DAGL'+'ISH!' magic; UADE fallback |
| `MFP.*` | Magnetic Fields Packer (prefix) | MagneticFieldsPackerParser.ts | UADE eagleplayer asm | pattern count + restart byte checks; UADE fallback |
| `DSC.*` | Digital Sonix Chrome | DigitalSonixChromeParser.ts | UADE eagleplayer asm | nLengths/nSamples + song size + sample loop; UADE fallback |
| `SMUS.*`, `SNX.*`, `TINY.*` | Sonix Music Driver | SonixMusicDriverParser.ts | UADE eagleplayer asm | 3-path (IFF SMUS, tiny binary, snx binary); UADE fallback |
| `JO.*` | Jesper Olsen | JesperOlsenParser.ts | UADE eagleplayer asm | 2-branch (new pointer table; old 3×BRA/marker scan); UADE fallback |
| `KIM.*` | Kim Christensen | KimChristensenParser.ts | UADE eagleplayer asm | MOVEA.L scan + 6-opcode sequence; UADE fallback |
| `ASH.*` | Ashley Hogg | AshleyHoggParser.ts | UADE eagleplayer asm | 4-pair BRA + new/old format check; UADE fallback |
| `ADPCM.*` | ADPCM Mono | ADPCMmonoParser.ts | UADE eagleplayer asm | extension check, excludes ADPC magic; UADE fallback |
| `JS.*` | Janne Salmijarvi Optimizer | JanneSalmijarviParser.ts | UADE eagleplayer asm | 'JS92' at offset 1080 + size > 2112; UADE fallback |
| `HIP7.*`, `S7G.*` | Jochen Hippel 7V | JochenHippel7VParser.ts | UADE eagleplayer asm | loader stub or bare TFMX + mulu #28 structure; UADE fallback |
| `HST.*` | Jochen Hippel ST | JochenHippelSTParser.ts | UADE eagleplayer asm | MCMD or SOG/TFMX-ST + mulu #12 structure; UADE fallback |
| `MAX.*` | Maximum Effect | MaximumEffectParser.ts | UADE eagleplayer asm | sub-song count 1–15 + pointer divisibility; UADE fallback |
| `MIDI.*` | MIDI Loriciel | MIDILoricielParser.ts | UADE eagleplayer asm | Standard MIDI MThd + MTrk validation; UADE fallback |
| `ONE.*` | onEscapee | OnEscapeeParser.ts | UADE eagleplayer asm | 24× $AA55FF00 or $55AA00FF sentinel; UADE fallback |
| `PAT.*` | Paul Tonge | PaulTongeParser.ts | UADE eagleplayer asm | $000C header + 3 indirect $80/$8F byte checks; UADE fallback |
| `RHO.*` | Rob Hubbard ST | RobHubbardSTParser.ts | UADE eagleplayer asm | 3 hardcoded 68k instruction longs; UADE fallback |

---

## 🔄 In Progress (agents currently implementing)

| Format | Parser File | Reference | Extensions |
|---|---|---|---|

---

## 🎯 Queued (NostalgicPlayer reference already downloaded)

| Format | Parser File (planned) | Reference | Notes |
|---|---|---|---|

---

## 🔧 Good Candidates (reference not yet downloaded)

| Extension(s) | Format | OpenMPT Loader | Notes |
|---|---|---|---|


## ❌ Not Parseable (compiled 68k executables — UADE only)

| Extension(s) | Format |
|---|---|
| `.hip`, `.sog` | Jochen Hippel (standard .hip extension — compiled loader, not prefix-based) |
| `.gray` | Fred Gray |
| `.dlm1`, `.dlm2` | Delta Music Loader variants (compiled 68k loader binary) |

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
| 2026-02-26 | Rob Hubbard | RobHubbardParser.ts | UADE eagleplayer asm |
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
| 2026-02-26 | UNIC Tracker | UNICParser.ts | **OpenMPT** Load_unic.cpp |
| 2026-02-26 | MultiTracker | MTMParser.ts | **OpenMPT** Load_mtm.cpp |
| 2026-02-26 | Composer 669 | Format669Parser.ts | **OpenMPT** Load_669.cpp |
| 2026-02-26 | Farandole Composer | FARParser.ts | **OpenMPT** Load_far.cpp |
| 2026-02-26 | Disorder Tracker 2 | PLMParser.ts | **OpenMPT** Load_plm.cpp |
| 2026-02-26 | Ultra Tracker | ULTParser.ts | **OpenMPT** Load_ult.cpp |
| 2026-02-26 | Reality Tracker | RTMParser.ts | **OpenMPT** Load_rtm.cpp |
| 2026-02-26 | DSIK Sound Module | DSMParser.ts | **OpenMPT** Load_dsm.cpp |
| 2026-02-26 | Digital Tracker | DTMParser.ts | **OpenMPT** Load_dtm.cpp |
| 2026-02-26 | ScreamTracker 2 | STMParser.ts | **OpenMPT** Load_stm.cpp |
| 2026-02-26 | NoiseRunner | NRUParser.ts | **OpenMPT** Load_nru.cpp |
| 2026-02-26 | PolyTracker | PTMParser.ts | **OpenMPT** Load_ptm.cpp |
| 2026-02-26 | General DigiMusic | GDMParser.ts | **OpenMPT** Load_gdm.cpp |
| 2026-02-26 | Digital Sound Studio | DigitalSoundStudioParser.ts | NostalgicPlayer + DSS.txt spec |
| 2026-02-26 | Digital Symphony | DigitalSymphonyParser.ts | **OpenMPT** Load_dsym.cpp |
| 2026-02-26 | Images Music System | IMSParser.ts | **OpenMPT** Load_ims.cpp |
| 2026-02-26 | Ice Tracker / SoundTracker 2.6 | ICEParser.ts | **OpenMPT** Load_ice.cpp |
| 2026-02-26 | ChipTracker / KRIS | KRISParser.ts | **OpenMPT** Load_kris.cpp |
| 2026-02-26 | ProTracker 3.6 | PT36Parser.ts | **OpenMPT** Load_pt36.cpp |
| 2026-02-26 | SpeedySystem / SoundSmith | SpeedySystemParser.ts | **OpenMPT** Load_ss.cpp |
| 2026-02-26 | Ultimate SoundTracker | SoundTrackerParser.ts | **OpenMPT** Load_stk.cpp |
| 2026-02-26 | Imago Orpheus | ImagoOrpheusParser.ts | **OpenMPT** Load_imf.cpp |
| 2026-02-26 | Sampler Tracker Plus | SamplerTrackerPlusParser.ts | **OpenMPT** Load_stp.cpp |
| 2026-02-26 | DigiBooster Pro | DigiBoosterProParser.ts | **OpenMPT** Load_dbm.cpp |
| 2026-02-26 | ASYLUM/DSMI AMF | AMFParser.ts | **OpenMPT** Load_amf.cpp |
| 2026-02-26 | Digitrakker / Madness | MadnessParser.ts | **OpenMPT** Load_mdl.cpp |
| 2026-02-26 | Tronic | TronicParser.ts | UADE eagleplayer |
| 2026-02-26 | X-Tracker DMF | XTrackerParser.ts | **OpenMPT** Load_dmf.cpp |
| 2026-02-26 | FM Tracker | FMTrackerParser.ts | **OpenMPT** Load_fmt.cpp |
| 2026-02-26 | Astroidea XMF | XMFParser.ts | **OpenMPT** Load_xmf.cpp |
| 2026-02-26 | Unreal Audio Package | UAXParser.ts | custom |
| 2026-02-26 | Mad Tracker 2 | MadTracker2Parser.ts | **OpenMPT** Load_mt2.cpp |
| 2026-02-26 | PSM / PSM16 (MASI) | PSMParser.ts | **OpenMPT** Load_psm.cpp |
| 2026-02-26 | AMS (Extreme's / Velvet) | AMSParser.ts | **OpenMPT** Load_ams.cpp |
| 2026-02-26 | Graoumf Tracker 2 | GraoumfTracker2Parser.ts | **OpenMPT** Load_gt2.cpp |
| 2026-02-26 | Composer 667 | Composer667Parser.ts | NostalgicPlayer |
| 2026-02-26 | Chuck Biscuits / Black Artist | ChuckBiscuitsParser.ts | NostalgicPlayer |
| 2026-02-26 | Delta Music 1.0 | DeltaMusic1Parser.ts | NostalgicPlayer |
| 2026-02-26 | IFF SMUS / Sonix | IffSmusParser.ts | NostalgicPlayer |
| 2026-02-26 | Magnetic Fields Packer | MFPParser.ts | NostalgicPlayer |
| 2026-02-26 | CDFM Composer 670 | CDFM67Parser.ts | **OpenMPT** Load_c67.cpp |
| 2026-02-26 | EasyTrax | EasyTraxParser.ts | NostalgicPlayer |
| 2026-02-26 | Karl Morton Music | KarlMortonParser.ts | NostalgicPlayer |
| 2026-02-26 | Richard Joseph Player | RichardJosephParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Leggless Music Editor | LMEParser.ts | UADE eagleplayer |
| 2026-02-26 | Future Player | FuturePlayerParser.ts | UADE eagleplayer |
| 2026-02-26 | Medley | MedleyParser.ts | UADE eagleplayer |
| 2026-02-26 | Jason Page | JasonPageParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Symphonie Pro | SymphonieProParser.ts | **OpenMPT** Load_symmod.cpp |
| 2026-02-26 | Furnace Tracker Song | FurnaceSongParser.ts | furnace-master src + format spec |
| 2026-02-26 | Jeroen Tel | JeroenTelParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Mark Cooksey | MarkCookseyParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Quartet / Quartet PSG / ST | QuartetParser.ts | UADE eagleplayer |
| 2026-02-26 | Sound Master | SoundMasterParser.ts | UADE eagleplayer asm |
| 2026-02-26 | ZoundMonitor | ZoundMonitorParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Professional Sound Artists | PSAParser.ts | UADE eagleplayer asm |
| 2026-02-26 | MMDC (MED Packer) | MMDCParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Steve Turner | SteveTurnerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | The Musical Enlightenment | TMEParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Infogrames DUM | InfogramesParser.ts | UADE eagleplayer asm |
| 2026-02-26 | TimeTracker | TimeTrackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | TomyTracker | TomyTrackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Fashion Tracker | FashionTrackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | MultiMedia Sound | MultiMediaSoundParser.ts | UADE eagleplayer asm |
| 2026-02-26 | ChipTracker (KRIS prefix) | ChipTrackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Cinemaware | CinemawareParser.ts | UADE eagleplayer asm |
| 2026-02-26 | NovoTrade Packer | NovoTradePackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Alcatraz Packer | AlcatrazPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Blade Packer | BladePackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Images Music System (prefix) | ImagesMusicSystemParser.ts | UADE eagleplayer asm |
| 2026-02-26 | UFO / MicroProse | UFOParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Dave Lowe | DaveLoweParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Sean Conran | SeanConranParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Thomas Hermann | ThomasHermannParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Titanics Packer | TitanicsPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Kris Hatlelid | KrisHatlelidParser.ts | UADE eagleplayer asm |
| 2026-02-26 | NTSP System | NTSPParser.ts | UADE eagleplayer asm |
| 2026-02-26 | UFO prefix routing (MUS.*, UFO.*) | UFOParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Mosh Packer | MoshPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Mugician prefix routing (MUG.*, MUG2.*) | DigitalMugicianParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Core Design | CoreDesignParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Janko Mrsic-Flogel | JankoMrsicFlogelParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Special FX (Jonathan Dunn) | SpecialFXParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Sound Player (Steve Barrett) | SoundPlayerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Nick Pelling Packer | NickPellingPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Peter Verswyvelen Packer | PeterVerswyvelenPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Wally Beben | WallyBebenParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Steve Barrett | SteveBarrettParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Paul Summers | PaulSummersParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Desire | DesireParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Dave Lowe New | DaveLoweNewParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Martin Walker | MartinWalkerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Paul Shields | PaulShieldsParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Paul Robotham | PaulRobothamParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Pierre Adane Packer | PierreAdaneParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Anders Oland | Anders0landParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Andrew Parton | AndrewPartonParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Custom Made | CustomMadeParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Ben Daglish prefix routing (BD.*) | BenDaglishParser.ts | NostalgicPlayer |
| 2026-02-26 | Ben Daglish SID | BenDaglishSIDParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Magnetic Fields Packer prefix routing (MFP.*) | MagneticFieldsPackerParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Digital Sonix Chrome | DigitalSonixChromeParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Sonix Music Driver | SonixMusicDriverParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Jesper Olsen | JesperOlsenParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Kim Christensen | KimChristensenParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Ashley Hogg | AshleyHoggParser.ts | UADE eagleplayer asm |
| 2026-02-26 | ADPCM Mono | ADPCMmonoParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Janne Salmijarvi | JanneSalmijarviParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Jochen Hippel 7V | JochenHippel7VParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Jochen Hippel ST | JochenHippelSTParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Maximum Effect | MaximumEffectParser.ts | UADE eagleplayer asm |
| 2026-02-26 | MIDI Loriciel | MIDILoricielParser.ts | UADE eagleplayer asm |
| 2026-02-26 | onEscapee | OnEscapeeParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Paul Tonge | PaulTongeParser.ts | UADE eagleplayer asm |
| 2026-02-26 | Rob Hubbard ST | RobHubbardSTParser.ts | UADE eagleplayer asm |
| 2026-02-27 | Routing audit: 108 silent stub parsers rerouted | — | All metadata-only native parser paths removed; formats now correctly fall through to UADE/libopenmpt instead of returning silent placeholder TrackerSongs |
