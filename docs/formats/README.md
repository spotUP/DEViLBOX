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
| [ArtOfNoise.md](ArtOfNoise.md) | Art Of Noise | DETECTION_ONLY |
| [BenDaglish.md](BenDaglish.md) | Ben Daglish | DETECTION_ONLY |
| [BPSoundMon.md](BPSoundMon.md) | BP SoundMon 2.0/2.2 (V1/V2/V3) | FULLY_NATIVE (V2/V3 SoundMonSynth) / NATIVE_SAMPLER (V1) |
| [DavidWhittaker.md](DavidWhittaker.md) | David Whittaker | FULLY_NATIVE |
| [DeltaMusic.md](DeltaMusic.md) | Delta Music 1.0 + 2.0 (combined overview) | v1: DETECTION_ONLY / v2: NATIVE_SAMPLER |
| [DeltaMusic1.md](DeltaMusic1.md) | Delta Music 1.0 (detailed) | DETECTION_ONLY |
| [DeltaMusic2.md](DeltaMusic2.md) | Delta Music 2.0 (detailed) | NATIVE_SAMPLER |
| [DigitalMugician.md](DigitalMugician.md) | Digital Mugician 1/2 | FULLY_NATIVE |
| [DigitalSoundStudio.md](DigitalSoundStudio.md) | Digital Sound Studio (DSS/MMU2) | DETECTION_ONLY |
| [DaveLowe.md](DaveLowe.md) | Dave Lowe / Dave Lowe New | DETECTION_ONLY |
| [FaceTheMusic.md](FaceTheMusic.md) | Face The Music | NATIVE_SAMPLER |
| [FredEditor.md](FredEditor.md) | Fred Editor | FULLY_NATIVE |
| [FredGray.md](FredGray.md) | Fred Gray | DETECTION_ONLY |
| [FutureComposer.md](FutureComposer.md) | Future Composer 1.0–1.4 | FULLY_NATIVE |
| [GameMusicCreator.md](GameMusicCreator.md) | Game Music Creator | NATIVE_SAMPLER |
| [GraoumfTracker.md](GraoumfTracker.md) | Graoumf Tracker 1/2 (GTK/GT2) | NATIVE_SAMPLER |
| [HippelCoSo.md](HippelCoSo.md) | Hippel CoSo (Cosmetic Synthesizer) | FULLY_NATIVE |
| [HivelyTracker.md](HivelyTracker.md) | Hively Tracker / AHX | FULLY_NATIVE |
| [IffSmus.md](IffSmus.md) | IFF-SMUS (Standard Music, EA) | NATIVE_SAMPLER (silent placeholders) |
| [InStereo2.md](InStereo2.md) | InStereo! 2.0 | DETECTION_ONLY |
| [JamCracker.md](JamCracker.md) | JamCracker | NATIVE_SAMPLER |
| [JasonBrooke.md](JasonBrooke.md) | Jason Brooke | DETECTION_ONLY |
| [JasonPage.md](JasonPage.md) | Jason Page | DETECTION_ONLY |
| [JeroenTel.md](JeroenTel.md) | Jeroen Tel | DETECTION_ONLY |
| [JesperOlsen.md](JesperOlsen.md) | Jesper Olsen | DETECTION_ONLY |
| [JochenHippel.md](JochenHippel.md) | Jochen Hippel (7 Voice + TFMX-ST) | DETECTION_ONLY |
| [Laxity.md](Laxity.md) | Laxity | DETECTION_ONLY |
| [ManiacsOfNoise.md](ManiacsOfNoise.md) | Maniacs Of Noise | DETECTION_ONLY |
| [MarkCooksey.md](MarkCooksey.md) | Mark Cooksey / Mark Cooksey Old | DETECTION_ONLY |
| [MarkII.md](MarkII.md) | Mark II (Mark I Sound System) | DETECTION_ONLY |
| [MaximumEffect.md](MaximumEffect.md) | Maximum Effect / MaxTrax | DETECTION_ONLY |
| [MED.md](MED.md) | MED 2/3/4 | FULLY_NATIVE (OctaMEDSynth) |
| [MIDILoriciel.md](MIDILoriciel.md) | MIDI Loriciel | DETECTION_ONLY |
| [MusicLineEditor.md](MusicLineEditor.md) | MusicLine Editor | NATIVE_SAMPLER |
| [MusicMakerV8.md](MusicMakerV8.md) | Music Maker V8 (4V/8V) | NATIVE_SAMPLER |
| [Oktalyzer.md](Oktalyzer.md) | Oktalyzer | NATIVE_SAMPLER |
| [PumaTracker.md](PumaTracker.md) | Puma Tracker | NATIVE_SAMPLER |
| [Quartet.md](Quartet.md) | Quartet / Quartet PSG / Quartet ST | DETECTION_ONLY |
| [RichardJoseph.md](RichardJoseph.md) | Richard Joseph Player (RJP/SNG+SMP) | DETECTION_ONLY |
| [KrisHatlelid.md](KrisHatlelid.md) | Kris Hatlelid | DETECTION_ONLY |
| [RobHubbard.md](RobHubbard.md) | Rob Hubbard | FULLY_NATIVE (RobHubbardSynth) |
| [SidMon1.md](SidMon1.md) | SidMon 1.0 | FULLY_NATIVE |
| [SidMon2.md](SidMon2.md) | SidMon 2.0 | FULLY_NATIVE |
| [SonicArranger.md](SonicArranger.md) | Sonic Arranger | NATIVE_SAMPLER |
| [SoundControl.md](SoundControl.md) | Sound Control | NATIVE_SAMPLER |
| [SoundFactory.md](SoundFactory.md) | Sound Factory | DETECTION_ONLY |
| [SoundFX.md](SoundFX.md) | SoundFX 1.0/2.0 | NATIVE_SAMPLER |
| [StarTrekker.md](StarTrekker.md) | StarTrekker / Ultimate SoundTracker | NATIVE_SAMPLER |
| [Symphonie.md](Symphonie.md) | Symphonie / Symphonie Pro | FULLY_NATIVE (SymphonieSynth) |
| [Synthesis.md](Synthesis.md) | Synthesis + InStereo! 1.0 | DETECTION_ONLY |
| [TFMX.md](TFMX.md) | TFMX Professional / TFHD | FULLY_NATIVE (TFMXSynth) |
| [WallyBeben.md](WallyBeben.md) | Wally Beben | DETECTION_ONLY |
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

`docs/formats/Replayers/` — original Amiga assembly replayer source code, organized
by format. Use as the definitive binary reference for format reverse engineering.
