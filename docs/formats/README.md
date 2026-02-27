# Format descriptions
This directory contains all the descriptions for different module formats, that I have created by myself in my research for the different players. I think others can use information as well. Some of the documents are more like notes than a real format description.

---

## DEViLBOX Format Documentation Index

Format docs below are authored for DEViLBOX reverse engineering. Each documents binary
layout, instrument structures, synth type, and implementation status.

**Status key:**
- `FULLY_NATIVE` — custom WASM synth (no UADE needed)
- `NATIVE_SAMPLER` — PCM extracted, plays via Sampler engine
- `DETECTION_ONLY` — parser identifies format, UADE synthesizes audio

| File | Format | Status |
|------|--------|--------|
| [Actionamics.md](Actionamics.md) | Actionamics Sound Tool | DETECTION_ONLY |
| [ActivisionPro.md](ActivisionPro.md) | Activision Pro | DETECTION_ONLY |
| [ADPCMmono.md](ADPCMmono.md) | ADPCM Mono | DETECTION_ONLY |
| [AlcatrazPacker.md](AlcatrazPacker.md) | Alcatraz Packer | DETECTION_ONLY |
| [AMF.md](AMF.md) | AMF (Advanced Music Format / ASYLUM Music Format) | NATIVE_SAMPLER |
| [AMOSMusicBank.md](AMOSMusicBank.md) | AMOS Music Bank | NATIVE_SAMPLER |
| [AMS.md](AMS.md) | AMS (Extreme's Tracker / Velvet Studio) | NATIVE_SAMPLER |
| [Anders0land.md](Anders0land.md) | Anders 0land | DETECTION_ONLY |
| [AndrewParton.md](AndrewParton.md) | Andrew Parton | DETECTION_ONLY |
| [ArtOfNoise.md](ArtOfNoise.md) | Art Of Noise | DETECTION_ONLY |
| [AshleyHogg.md](AshleyHogg.md) | Ashley Hogg | DETECTION_ONLY |
| [AY.md](AY.md) | AY / YM (ZX Spectrum AY-emul / ZXAYEMUL) | FULLY_NATIVE (Z80 emu + FurnaceAY) |
| [BenDaglish.md](BenDaglish.md) | Ben Daglish | DETECTION_ONLY |
| [BenDaglishSID.md](BenDaglishSID.md) | Ben Daglish SID (3-voice) | DETECTION_ONLY |
| [BladePacker.md](BladePacker.md) | Blade Packer | DETECTION_ONLY |
| [BPSoundMon.md](BPSoundMon.md) | BP SoundMon 2.0/2.2 (V1/V2/V3) | FULLY_NATIVE (V2/V3 SoundMonSynth) / NATIVE_SAMPLER (V1) |
| [CDFM67.md](CDFM67.md) | CDFM67 (7-channel DOS OPL2+PCM tracker) | NATIVE_SAMPLER |
| [ChipTracker.md](ChipTracker.md) | ChipTracker / KRIS | NATIVE_SAMPLER |
| [ChuckBiscuits.md](ChuckBiscuits.md) | Chuck Biscuits | NATIVE_SAMPLER |
| [Cinemaware.md](Cinemaware.md) | Cinemaware | DETECTION_ONLY |
| [Composer667.md](Composer667.md) | Composer 669 / UNIS 669 (Composer667Parser) | NATIVE_SAMPLER |
| [CoreDesign.md](CoreDesign.md) | Core Design ("S.PHIPPS") | DETECTION_ONLY |
| [CustomMade.md](CustomMade.md) | CustomMade (Delitracker Custom) | DETECTION_ONLY |
| [DavidWhittaker.md](DavidWhittaker.md) | David Whittaker | FULLY_NATIVE |
| [DaveLowe.md](DaveLowe.md) | Dave Lowe / Dave Lowe New | DETECTION_ONLY |
| [DaveLoweNew.md](DaveLoweNew.md) | Dave Lowe New | DETECTION_ONLY |
| [DefleMask.md](DefleMask.md) | DefleMask (.dmf) | FULLY_NATIVE (routes to Furnace chip synth) |
| [DeltaMusic.md](DeltaMusic.md) | Delta Music 1.0 + 2.0 (combined overview) | v1: DETECTION_ONLY / v2: NATIVE_SAMPLER |
| [DeltaMusic1.md](DeltaMusic1.md) | Delta Music 1.0 (detailed) | DETECTION_ONLY |
| [DeltaMusic2.md](DeltaMusic2.md) | Delta Music 2.0 (detailed) | NATIVE_SAMPLER |
| [Desire.md](Desire.md) | Desire (Dentons) | DETECTION_ONLY |
| [DigiBooster.md](DigiBooster.md) | DigiBooster 1.x (DBMX) / Pro 2.x (DBM0) | NATIVE_SAMPLER |
| [DigiBoosterPro.md](DigiBoosterPro.md) | DigiBooster Pro (DBM0) | NATIVE_SAMPLER |
| [DigitalMugician.md](DigitalMugician.md) | Digital Mugician 1/2 | FULLY_NATIVE |
| [DigitalSonixChrome.md](DigitalSonixChrome.md) | Digital Sonix & Chrome | DETECTION_ONLY |
| [DigitalSoundStudio.md](DigitalSoundStudio.md) | Digital Sound Studio (DSS/MMU2) | DETECTION_ONLY |
| [DigitalSymphony.md](DigitalSymphony.md) | Digital Symphony | NATIVE_SAMPLER |
| [DSM.md](DSM.md) | DSM (DSIK Sound Module / Dynamic Studio) | NATIVE_SAMPLER |
| [DTM.md](DTM.md) | DTM (Digital Tracker) | NATIVE_SAMPLER |
| [EasyTrax.md](EasyTrax.md) | EasyTrax (EarAche) | DETECTION_ONLY |
| [FaceTheMusic.md](FaceTheMusic.md) | Face The Music | NATIVE_SAMPLER |
| [FAR.md](FAR.md) | FAR (Farandole Composer) | NATIVE_SAMPLER |
| [FashionTracker.md](FashionTracker.md) | Fashion Tracker | DETECTION_ONLY |
| [FC.md](FC.md) | Future Composer 1.3 / 1.4 (FC13/FC14/SMOD) | FULLY_NATIVE (FCSynth) |
| [FMTracker.md](FMTracker.md) | FMTracker (Tim Follin Player) | DETECTION_ONLY |
| [Format669.md](Format669.md) | 669 (Composer 669 / UNIS 669) | NATIVE_SAMPLER |
| [FredEditor.md](FredEditor.md) | Fred Editor | FULLY_NATIVE |
| [FredGray.md](FredGray.md) | Fred Gray | DETECTION_ONLY |
| [Furnace.md](Furnace.md) | Furnace Tracker Instrument/Wavetable (.fui/.fuw) | FULLY_NATIVE |
| [FurnaceSong.md](FurnaceSong.md) | Furnace Tracker Song (.fur) | FULLY_NATIVE |
| [FurnaceWavetable.md](FurnaceWavetable.md) | Furnace Wavetable (.fuw) | FULLY_NATIVE |
| [FutureComposer.md](FutureComposer.md) | Future Composer 1.0-1.4 | FULLY_NATIVE |
| [FuturePlayer.md](FuturePlayer.md) | Future Player | DETECTION_ONLY |
| [GameMusicCreator.md](GameMusicCreator.md) | Game Music Creator | NATIVE_SAMPLER |
| [GDM.md](GDM.md) | GDM (General Digital Music / BWSB 2GDM) | NATIVE_SAMPLER |
| [GMC.md](GMC.md) | GlueMon / Game Music Creator (.glue/.gm) | NATIVE_SAMPLER |
| [GraoumfTracker.md](GraoumfTracker.md) | Graoumf Tracker 1/2 (GTK/GT2) | NATIVE_SAMPLER |
| [GraoumfTracker2.md](GraoumfTracker2.md) | Graoumf Tracker 1/2 GTK/GT2 (detailed) | NATIVE_SAMPLER |
| [HippelCoSo.md](HippelCoSo.md) | Hippel CoSo (Cosmetic Synthesizer) | FULLY_NATIVE |
| [HivelyTracker.md](HivelyTracker.md) | Hively Tracker / AHX | FULLY_NATIVE |
| [ICE.md](ICE.md) | ICE Tracker / SoundTracker 2.6 (MTN/IT10) | NATIVE_SAMPLER |
| [IffSmus.md](IffSmus.md) | IFF-SMUS (Standard Music, EA) | NATIVE_SAMPLER (silent placeholders) |
| [ImagoOrpheus.md](ImagoOrpheus.md) | Imago Orpheus | NATIVE_SAMPLER |
| [ImagesMusicSystem.md](ImagesMusicSystem.md) | Images Music System | DETECTION_ONLY |
| [IMS.md](IMS.md) | Images Music System (.ims) | NATIVE_SAMPLER |
| [Infogrames.md](Infogrames.md) | Infogrames / RobHubbard2 | DETECTION_ONLY |
| [InStereo1.md](InStereo1.md) | InStereo! 1.0 (ISM) | NATIVE_SAMPLER |
| [InStereo2.md](InStereo2.md) | InStereo! 2.0 | DETECTION_ONLY |
| [IT.md](IT.md) | IT (Impulse Tracker) | NATIVE_SAMPLER |
| [JamCracker.md](JamCracker.md) | JamCracker | NATIVE_SAMPLER |
| [JankoMrsicFlogel.md](JankoMrsicFlogel.md) | Janko Mrsic-Flogel | DETECTION_ONLY |
| [JanneSalmijarvi.md](JanneSalmijarvi.md) | Janne Salmijarvi | DETECTION_ONLY |
| [JasonBrooke.md](JasonBrooke.md) | Jason Brooke | DETECTION_ONLY |
| [JasonPage.md](JasonPage.md) | Jason Page | DETECTION_ONLY |
| [JeroenTel.md](JeroenTel.md) | Jeroen Tel | DETECTION_ONLY |
| [JesperOlsen.md](JesperOlsen.md) | Jesper Olsen | DETECTION_ONLY |
| [JochenHippel.md](JochenHippel.md) | Jochen Hippel (7 Voice + TFMX-ST) | DETECTION_ONLY |
| [JochenHippel7V.md](JochenHippel7V.md) | Jochen Hippel 7V (TFMX-7V) | DETECTION_ONLY |
| [JochenHippelST.md](JochenHippelST.md) | Jochen Hippel ST (TFMX-ST) | DETECTION_ONLY |
| [KarlMorton.md](KarlMorton.md) | Karl Morton Music Format | NATIVE_SAMPLER |
| [KimChristensen.md](KimChristensen.md) | Kim Christensen | DETECTION_ONLY |
| [KRIS.md](KRIS.md) | KRIS (ChipTracker) | NATIVE_SAMPLER |
| [KrisHatlelid.md](KrisHatlelid.md) | Kris Hatlelid | DETECTION_ONLY |
| [Laxity.md](Laxity.md) | Laxity | DETECTION_ONLY |
| [LME.md](LME.md) | Leggless Music Editor (LME) | DETECTION_ONLY |
| [MadTracker2.md](MadTracker2.md) | MadTracker 2 (MT2) | NATIVE_SAMPLER |
| [MagneticFieldsPacker.md](MagneticFieldsPacker.md) | Magnetic Fields Packer (MFP) | NATIVE_SAMPLER |
| [ManiacsOfNoise.md](ManiacsOfNoise.md) | Maniacs Of Noise | DETECTION_ONLY |
| [MarkCooksey.md](MarkCooksey.md) | Mark Cooksey / Mark Cooksey Old | DETECTION_ONLY |
| [MarkII.md](MarkII.md) | Mark II (Mark I Sound System) | DETECTION_ONLY |
| [MartinWalker.md](MartinWalker.md) | Martin Walker | DETECTION_ONLY |
| [MaximumEffect.md](MaximumEffect.md) | Maximum Effect / MaxTrax | DETECTION_ONLY |
| [MDL.md](MDL.md) | MDL (Digitrakker) | NATIVE_SAMPLER |
| [MED.md](MED.md) | MED 2/3/4 | FULLY_NATIVE (OctaMEDSynth) |
| [Medley.md](Medley.md) | Medley (PV Synth) | DETECTION_ONLY |
| [MFP.md](MFP.md) | Magnetic Fields Packer (.mfp) | NATIVE_SAMPLER |
| [MIDILoriciel.md](MIDILoriciel.md) | MIDI Loriciel | DETECTION_ONLY |
| [MMDC.md](MMDC.md) | MMDC (MED Packer) | DETECTION_ONLY |
| [MOD.md](MOD.md) | MOD (ProTracker / Amiga MOD) | NATIVE_SAMPLER |
| [MoshPacker.md](MoshPacker.md) | Mosh Packer | DETECTION_ONLY |
| [MTM.md](MTM.md) | MTM (MultiTracker) | NATIVE_SAMPLER |
| [MultiMediaSound.md](MultiMediaSound.md) | MultiMedia Sound (MMS) | DETECTION_ONLY |
| [MusicAssembler.md](MusicAssembler.md) | Music Assembler | NATIVE_SAMPLER |
| [MusicLineEditor.md](MusicLineEditor.md) | MusicLine Editor | NATIVE_SAMPLER |
| [MusicMaker.md](MusicMaker.md) | Music Maker 4V / 8V | NATIVE_SAMPLER |
| [MusicMakerV8.md](MusicMakerV8.md) | Music Maker V8 (4V/8V) detailed | NATIVE_SAMPLER |
| [NickPellingPacker.md](NickPellingPacker.md) | Nick Pelling Packer | DETECTION_ONLY |
| [NovoTradePacker.md](NovoTradePacker.md) | NovoTrade Packer | DETECTION_ONLY |
| [NRU.md](NRU.md) | NRU (NoiseRunner) | NATIVE_SAMPLER |
| [NSF.md](NSF.md) | NSF (NES Sound Format) | FULLY_NATIVE |
| [NTSP.md](NTSP.md) | NTSP-System | DETECTION_ONLY |
| [Oktalyzer.md](Oktalyzer.md) | Oktalyzer | NATIVE_SAMPLER |
| [OnEscapee.md](OnEscapee.md) | onEscapee | DETECTION_ONLY |
| [PaulRobotham.md](PaulRobotham.md) | Paul Robotham | DETECTION_ONLY |
| [PaulShields.md](PaulShields.md) | Paul Shields | DETECTION_ONLY |
| [PaulSummers.md](PaulSummers.md) | Paul Summers | DETECTION_ONLY |
| [PaulTonge.md](PaulTonge.md) | Paul Tonge | DETECTION_ONLY |
| [PeterVerswyvelenPacker.md](PeterVerswyvelenPacker.md) | Peter Verswyvelen Packer | DETECTION_ONLY |
| [PierreAdane.md](PierreAdane.md) | Pierre Adane Packer | DETECTION_ONLY |
| [PLM.md](PLM.md) | PLM (Disorder Tracker 2) | NATIVE_SAMPLER |
| [PSA.md](PSA.md) | Professional Sound Artists (PSA) | DETECTION_ONLY |
| [PSM.md](PSM.md) | PSM (ProTracker Studio / Epic MegaGames MASI) | NATIVE_SAMPLER |
| [PT36.md](PT36.md) | PT36 (ProTracker 3.6 IFF container) | NATIVE_SAMPLER |
| [PTM.md](PTM.md) | PTM (PolyTracker) | NATIVE_SAMPLER |
| [PumaTracker.md](PumaTracker.md) | Puma Tracker | NATIVE_SAMPLER |
| [QuadraComposer.md](QuadraComposer.md) | Quadra Composer | NATIVE_SAMPLER |
| [Quartet.md](Quartet.md) | Quartet / Quartet PSG / Quartet ST | DETECTION_ONLY |
| [RichardJoseph.md](RichardJoseph.md) | Richard Joseph Player (RJP/SNG+SMP) | DETECTION_ONLY |
| [RobHubbard.md](RobHubbard.md) | Rob Hubbard | FULLY_NATIVE (RobHubbardSynth) |
| [RobHubbardST.md](RobHubbardST.md) | Rob Hubbard ST | DETECTION_ONLY |
| [RonKlaren.md](RonKlaren.md) | Ron Klaren Sound Module | NATIVE_SAMPLER |
| [RTM.md](RTM.md) | RTM (Real Tracker 2) | NATIVE_SAMPLER |
| [S3M.md](S3M.md) | S3M (ScreamTracker 3) | NATIVE_SAMPLER |
| [SamplerTrackerPlus.md](SamplerTrackerPlus.md) | Sampler Tracker Plus / SoundTracker Pro II | NATIVE_SAMPLER |
| [SAP.md](SAP.md) | SAP (Slight Atari Player) | FULLY_NATIVE |
| [Sawteeth.md](Sawteeth.md) | Sawteeth (software synth tracker) | NATIVE_SAMPLER (software synth) |
| [SeanConran.md](SeanConran.md) | Sean Conran | DETECTION_ONLY |
| [SID.md](SID.md) | SID (PSID / RSID) | FULLY_NATIVE |
| [SidMon1.md](SidMon1.md) | SidMon 1.0 | FULLY_NATIVE |
| [SidMon2.md](SidMon2.md) | SidMon 2.0 | FULLY_NATIVE |
| [SonicArranger.md](SonicArranger.md) | Sonic Arranger | NATIVE_SAMPLER |
| [SonixMusicDriver.md](SonixMusicDriver.md) | Sonix Music Driver (SMUS/TINY/SNX) | DETECTION_ONLY |
| [SoundControl.md](SoundControl.md) | Sound Control | NATIVE_SAMPLER |
| [SoundFactory.md](SoundFactory.md) | Sound Factory | DETECTION_ONLY |
| [SoundFX.md](SoundFX.md) | SoundFX 1.0/2.0 | NATIVE_SAMPLER |
| [SoundMaster.md](SoundMaster.md) | Sound Master (Michiel Soede, v1.0-3.0) | DETECTION_ONLY |
| [SoundMon.md](SoundMon.md) | SoundMon (Brian Postma Sound Monitor) | FULLY_NATIVE |
| [SoundPlayer.md](SoundPlayer.md) | Sound Player (Wanted Team) | DETECTION_ONLY |
| [SpecialFX.md](SpecialFX.md) | Special FX | DETECTION_ONLY |
| [SpeedySystem.md](SpeedySystem.md) | Speedy System / Speedy A1 System | DETECTION_ONLY |
| [StarTrekker.md](StarTrekker.md) | StarTrekker / Ultimate SoundTracker | NATIVE_SAMPLER |
| [SteveBarrett.md](SteveBarrett.md) | Steve Barrett | DETECTION_ONLY |
| [SteveTurner.md](SteveTurner.md) | Steve Turner | DETECTION_ONLY |
| [STK.md](STK.md) | STK (Ultimate SoundTracker / early MOD) | NATIVE_SAMPLER |
| [STM.md](STM.md) | STM (ScreamTracker 2) | NATIVE_SAMPLER |
| [STP.md](STP.md) | STP (SoundTracker Pro II) | NATIVE_SAMPLER |
| [Symphonie.md](Symphonie.md) | Symphonie / Symphonie Pro | FULLY_NATIVE (SymphonieSynth) |
| [SymphoniePro.md](SymphoniePro.md) | Symphonie Pro (.symmod) | NATIVE_SAMPLER |
| [Synthesis.md](Synthesis.md) | Synthesis + InStereo! 1.0 | DETECTION_ONLY |
| [SynthPack.md](SynthPack.md) | SynthPack | DETECTION_ONLY |
| [TCBTracker.md](TCBTracker.md) | TCB Tracker | DETECTION_ONLY |
| [TFMX.md](TFMX.md) | TFMX Professional / TFHD | FULLY_NATIVE (TFMXSynth) |
| [ThomasHermann.md](ThomasHermann.md) | Thomas Hermann | DETECTION_ONLY |
| [TimeTracker.md](TimeTracker.md) | TimeTracker | DETECTION_ONLY |
| [TitanicsPacker.md](TitanicsPacker.md) | Titanics Packer | DETECTION_ONLY |
| [TME.md](TME.md) | TME (The Musical Enlightenment) | DETECTION_ONLY |
| [TomyTracker.md](TomyTracker.md) | Tomy Tracker | DETECTION_ONLY |
| [Tronic.md](Tronic.md) | Tronic | DETECTION_ONLY |
| [UADE.md](UADE.md) | UADE -- Unix Amiga Delitracker Emulator (catch-all, 130+ formats) | DETECTION_ONLY |
| [UAX.md](UAX.md) | UAX (Unreal Audio Package) | NATIVE_SAMPLER |
| [UFO.md](UFO.md) | UFO / MicroProse | DETECTION_ONLY |
| [ULT.md](ULT.md) | ULT (UltraTracker) | NATIVE_SAMPLER |
| [UNIC.md](UNIC.md) | UNIC Tracker | NATIVE_SAMPLER |
| [VGM.md](VGM.md) | VGM (Video Game Music) | FULLY_NATIVE |
| [WallyBeben.md](WallyBeben.md) | Wally Beben | DETECTION_ONLY |
| [XM.md](XM.md) | XM (FastTracker II) | NATIVE_SAMPLER |
| [XMF.md](XMF.md) | XMF (Astroidea XMF / Imperium Galactica) | NATIVE_SAMPLER |
| [XTracker.md](XTracker.md) | XTracker (DMF) | NATIVE_SAMPLER |
| [YM.md](YM.md) | YM (Atari ST AY/YM Register Dump) | FULLY_NATIVE |
| [ZoundMon.md](ZoundMon.md) | ZoundMonitor (C replayer ref) | DETECTION_ONLY |
| [ZoundMonitor.md](ZoundMonitor.md) | ZoundMonitor (asm detection ref) | DETECTION_ONLY |

## Original NostalgicPlayer .txt specs in this directory

These are the raw format spec files sourced from NostalgicPlayer research:

`Actionamics.txt`, `Activision Pro.txt`, `Ben Daglish.txt`, `Delta Music 1.0.txt`,
`Delta Music 2.0.txt`, `Digital Mugician.txt`, `DSS.txt`, `Fred Editor.txt`,
`Future Composer.txt`, `Game Music Creator.txt`, `InStereo! 1.0.txt`,
`InStereo! 2.0.txt`, `JamCracker.txt`, `MED2.txt`, `MED3.txt`, `MED4.txt`,
`PumaTracker.txt`, `SidMon 2.0.txt`, `Sonic Arranger.txt`, `Sound Control.txt`,
`Sound Factory.txt`, `Synthesis.txt`

## Replayer Assembly Sources

`docs/formats/Replayers/` -- original Amiga assembly replayer source code, organized
by format. Use as the definitive binary reference for format reverse engineering.
