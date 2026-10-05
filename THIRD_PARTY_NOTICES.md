# Third-Party Notices

DEViLBOX is licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later).
See the [LICENSE](LICENSE) file for the full license text.

Copyright (C) 2025-2026 spotUP

DEViLBOX incorporates code, libraries, and assets from many open-source projects.
This document gives credit to their authors and lists applicable licenses.
All third-party components are compatible with GPL-3.0-or-later.

---

## Synthesizers & Instruments

### Surge XT
- **Source:** https://github.com/surge-synthesizer/surge
- **License:** GPL-3.0
- **Used for:** Polyphonic synthesizer engine (compiled to WASM)

### Vital
- **Author:** Matt Tytel
- **Source:** https://github.com/mtytel/vital
- **License:** GPL-3.0
- **Used for:** Spectral wavetable synthesizer (compiled to WASM)

### Dexed
- **Author:** Pascal Gauthier (asb2m10)
- **Source:** https://github.com/asb2m10/dexed
- **License:** GPL-3.0
- **Used for:** Yamaha DX7 FM synthesizer emulation (compiled to WASM)

### Helm
- **Author:** Matt Tytel
- **Source:** https://github.com/mtytel/helm
- **License:** GPL-3.0
- **Used for:** Polyphonic synthesizer (compiled to WASM)

### Monique Monosynth
- **Author:** Thomas Arndt
- **Source:** https://github.com/surge-synthesizer/monique-monosynth
- **License:** GPL-3.0
- **Used for:** Monophonic synthesizer (compiled to WASM)

### Odin 2
- **Author:** TheWaveWarden
- **Source:** https://github.com/TheWaveWarden/odin2
- **License:** GPL-3.0
- **Used for:** Hybrid synthesizer (compiled to WASM)

### OB-Xf
- **Author:** reales (fork of OB-Xd by discoDSP)
- **Source:** https://github.com/reales/OB-Xf
- **License:** GPL-3.0
- **Used for:** Oberheim OB-X emulation (compiled to WASM)

### AMSynth
- **Author:** Nick Dowell
- **Source:** https://github.com/amsynth/amsynth
- **License:** GPL-2.0
- **Used for:** Analog-modelling synthesizer (compiled to WASM)

### SynthV1
- **Author:** Rui Nuno Capela (rncbc)
- **Source:** https://github.com/rncbc/synthv1
- **License:** GPL-2.0+
- **Used for:** Polytonic synthesizer (compiled to WASM)

### WaveSabre
- **Source:** https://github.com/logicomacorp/WaveSabre
- **License:** MIT
- **Used for:** Demoscene synthesizer (compiled to WASM)

### RaffoSynth
- **Author:** Julien Pommier, Philip Thrasher
- **Source:** https://github.com/pthrasher/RaffoSynth
- **License:** GPL-2.0+
- **Used for:** Minimoog-style synthesizer (compiled to WASM)

### Sorcer
- **Author:** OpenAV
- **Source:** https://github.com/openav/sorcer
- **License:** GPL-3.0
- **Used for:** FM/waveguide synthesizer (compiled to WASM)

### Tunefish
- **Author:** Brain Control
- **Source:** https://github.com/paynebc/tunefish
- **License:** GPL-3.0
- **Used for:** Wavetable synthesizer (compiled to WASM)

### Aeolus
- **Author:** Fons Adriaensen (2003-2022)
- **Source:** https://kokkinizita.linuxaudio.org/linuxaudio/aeolus/
- **License:** GPL-3.0+
- **Used for:** Pipe organ synthesizer (compiled to WASM)

### Aelapse
- **Author:** smiarx
- **Source:** https://github.com/smiarx/aelapse
- **License:** GPL-3.0
- **Used for:** Tape delay and spring reverb effects (compiled to WASM, WebGL springs shader ported)

### Geonkick
- **Author:** Iurie Nistor
- **Source:** https://github.com/Geonkick-Synthesizer/geonkick
- **License:** GPL-3.0
- **Used for:** Percussion synthesizer (compiled to WASM)

### FluidSynth
- **Source:** https://github.com/FluidSynth/fluidsynth
- **License:** LGPL-2.1
- **Used for:** SoundFont (SF2) sample playback (compiled to WASM)

### SFizz
- **Source:** https://github.com/sfztools/sfizz
- **License:** BSD-2-Clause
- **Used for:** SFZ sampler format playback (compiled to WASM)

### setBfree
- **Author:** Robin Gareus
- **Source:** https://github.com/pantherb/setBfree
- **License:** GPL-2.0
- **Used for:** Tonewheel organ / Mellotron emulation (compiled to WASM)

### ZynAddSubFX
- **Author:** Mark McCurry, Nasca Octavian Paul
- **Source:** https://github.com/zynaddsubfx/zynaddsubfx
- **License:** GPL-2.0+
- **Used for:** Additive/subtractive/pad synthesizer (compiled to WASM)

### Oidos
- **Author:** Aske Simon Christensen (Blueberry / Loonies)
- **Source:** https://github.com/askeksa/Oidos
- **License:** Public Domain / MIT
- **Used for:** Demoscene additive synthesizer (compiled to WASM)

### JC303 / DB303 / Open303
- **Author:** David Lowenfels (Lowen Labs), Robin Schmidt (rosic)
- **Source:** https://github.com/dfl/lowenlabs-audio
- **License:** MIT
- **Used for:** TB-303 acid bass synthesizer with Devil Fish modifications (compiled to WASM). DSP engine based on Robin Schmidt's rosic::Open303.

### RdPiano
- **Author:** Giulio Zausa
- **Source:** https://github.com/niclasr/rdpiano
- **License:** MIT
- **Used for:** Roland D-50 style piano engine (TypeScript port)

### OpenWurli
- **Source:** retromulator / openWurliLib
- **License:** GPL-3.0
- **Used for:** Wurlitzer electric piano emulation (TypeScript port)

### Pink Trombone
- **Author:** Neil Thapen
- **Source:** https://dood.al/pinktrombone/
- **License:** MIT (via pink-trombone-mod npm package)
- **Used for:** Vocal tract physical model synthesis

---

## Trackers, Sequencers & Module Players

### Furnace
- **Author:** tildearrow and contributors
- **Source:** https://github.com/tildearrow/furnace
- **License:** GPL-2.0 (GPL-3.0 for ASIO support)
- **Used for:** Multi-system chiptune tracker — sequencer, chip emulation, and .fur format playback (compiled to WASM). DEViLBOX's FurnaceSequencer.cpp is adapted from Furnace's playback.cpp.

### OpenMPT / libopenmpt
- **Source:** https://github.com/OpenMPT/openmpt
- **License:** BSD-3-Clause
- **Used for:** MOD/XM/IT/S3M and 100+ tracker module format playback (compiled to WASM)

### PT2-Clone
- **Author:** Olav Sorensen (8bitbubsy)
- **Source:** https://github.com/8bitbubsy/pt2-clone
- **License:** BSD-3-Clause
- **Copyright:** 2010-2025 Olav Sorensen
- **Used for:** ProTracker 2 accurate emulation — sample editor UI extracted to WASM, BLEP synthesis routines

### FT2-Clone
- **Author:** Olav Sorensen (8bitbubsy)
- **Source:** https://github.com/8bitbubsy/ft2-clone
- **License:** BSD-3-Clause
- **Used for:** FastTracker II accurate emulation — sample editor UI extracted to WASM

### UADE
- **Authors:** Heikki Orsila, Michael Doering, and contributors
- **Source:** https://gitlab.com/uade-music-player/uade
- **License:** GPL-2.0+
- **Used for:** Universal Amiga Delitracker Emulator — plays 200+ Amiga music formats (compiled to WASM)

### Hively Tracker
- **Author:** Pete Gordon (Dexter / Abyss)
- **Source:** https://github.com/pete-gordon/hivelytracker
- **License:** BSD-3-Clause
- **Copyright:** 2006-2018 Pete Gordon
- **Used for:** AHX/HVL chiptune format playback (compiled to WASM)

### chiptune3
- **Source:** https://github.com/niclasr/chiptune3
- **License:** LGPL
- **Used for:** Chiptune playback (npm package wrapping libopenmpt WASM)

### Klystrack
- **Author:** kometbomb
- **Source:** https://github.com/kometbomb/klystrack
- **License:** MIT
- **Used for:** Chiptune tracker format support

---

## Chip Emulation Cores (from MAME)

The following chip emulators are ported from the **MAME** project (https://github.com/mamedev/mame).
MAME is licensed under **GPL-2.0+** (with BSD-3-Clause for certain components).

| Chip | MAME Author(s) | Used For |
|------|----------------|----------|
| ES5503 | R. Belmont | Apple IIGS / Ensoniq wavetable |
| ES5506 (VFX) | R. Belmont | Ensoniq VFX/SD-1 rompler |
| CEM3394 | Aaron Giles | Curtis analog synth chip |
| ICS2115 | Alex Marshall, nimitz, austere | Wavetable synthesis |
| K054539 | Olivier Galibert | Konami ADPCM/PCM |
| HC55516 | Aaron Giles, Jonathan Gevaryahu | CVSD speech codec |
| Votrax SC-01 | Olivier Galibert | Votrax speech synthesis |
| S14001A | Ed Bernard, Jonathan Gevaryahu, hap | Speech synthesis |
| VLM5030 | Tatsuyuki Satoh | Voice synthesis |
| MEA8000 | Antoine Mine | Philips speech synthesis |
| Astrocade | Aaron Giles, Frank Palazzolo | Bally Astrocade sound |
| SP0250 | Olivier Galibert | GI speech synthesis |
| SN76477 | Zsolt Vasvari, Derrick Renaud | Complex sound generation |
| TMS36XX | Juergen Buchmueller | TI organ chip |
| TMS5220 | Frank Palazzolo, Aaron Giles | TI speech synthesis |
| YMF271 (OPX) | R. Belmont, Olivier Galibert, hap | Yamaha FM synthesis |
| UPD933 | Devin Acker | NEC speech synthesis |
| SNK Wave | Nicola Salmoria | SNK custom wavetable |
| C352 | R. Belmont, superctr | Namco wavetable |
| RF5C400 | Ville Linde | Ricoh PCM |
| SCSP | ElSemi, R. Belmont | Sega Saturn sound |
| SWP30 (MU-2000) | Olivier Galibert | Yamaha rompler/DSP |
| Roland SA (D-50) | Olivier Galibert | Roland rompler |
| TR-707 | MAME contributors | Roland drum machine |

### ymfm
- **Author:** Aaron Giles
- **Source:** https://github.com/aarongiles/ymfm
- **License:** BSD-3-Clause
- **Used for:** Yamaha FM synthesis cores (OPN, OPM, OPL, OPQ, OPLL, etc.)

### ReSID / ReSID-fp
- **Author:** Dag Lem
- **License:** GPL-2.0+
- **Used for:** MOS 6581/8580 SID chip emulation (C64 sound, compiled to WASM)

---

## Transpiled & Ported Amiga/Retro Replayers

### NostalgicPlayer Ports (C# to C)
- **Original Author:** Thomas Neumann
- **Source:** https://github.com/neumatho/NostalgicPlayer
- **License:** MIT
- **Formats ported:** Art of Noise (AON4/AON8), SidMon 2, Ben Daglish, David Whittaker, and others

### PumaTracker
- **Used for:** .puma format playback
- **Notes:** Transpiled from 68k assembly to C via custom asm68k-to-c toolchain

### StartTrekker AM
- **Original Author:** Bjorn Wesen (Exolon / Fairlight)
- **Used for:** StarTrekker AM synth-sample format playback (transpiled from 68k assembly)

### PreTracker
- **Used for:** .prt Amiga format playback (compiled to WASM)

### Music-Assembler
- **Used for:** .ma Amiga format playback (compiled to WASM)

### Hippel (Jochen Hippel)
- **Used for:** Jochen Hippel / TFMX / Future Composer format playback (compiled to WASM)

### Sonix Music Driver
- **Used for:** .snx / .smus / .tiny format playback (compiled to WASM)

### TFMX Audio Decoder
- **Source:** https://github.com/mrolappe/libtfmxaudiodecoder
- **License:** GPL-2.0
- **Used for:** TFMX (The Final Musicsystem eXtended) format playback

---

## Additional Format Engines

### Musicline Playback (C++ port)
- **Source:** `third-party/musicline_playback-main` (port of the Musicline Editor 1.16 Amiga replayer, with UADE as the reference backend)
- **License:** GPL-2.0-or-later by inheritance from UADE, which it embeds; the port carries no licence statement of its own
- **Used for:** Musicline (.ml) playback engine
- **Note:** the original `Mline116.asm` is not in the repository (see `third-party/PRIVATE_SOURCES.md`)

### SC68
- **Author:** Benjamin Gerard (wothke port)
- **Source:** https://github.com/wothke/sc68-2.2.1
- **License:** GPL-3.0
- **Used for:** Atari ST .sc68/.sndh playback — 68000 + YM2149 + Paula emulation (compiled to WASM)

### ZXTune
- **Source:** https://github.com/niclasr/niclasr.github.io (ayumi core)
- **License:** MIT (ayumi AY-3-8910 core)
- **Used for:** ZX Spectrum formats (.pt3, .pt2, .stc, .vtx, .psg, and 30+ more)

### aylet
- **Authors:** Russell Marks, Ian Collier (Z80 core from xz80)
- **Source:** `third-party/aylet-0.5` (aylet 0.5, from the Debian `aylet_0.5.orig.tar.gz`); wasm bridge in `aylet-wasm/`
- **License:** GPL-2.0-or-later (`third-party/aylet-0.5/COPYING`)
- **Used for:** ZX Spectrum .ay / .emul (ZXAY EMUL) playback — the tune's own Z80 code with AY and beeper emulation (compiled to WASM). `aylet-wasm/src/z80_frame.c` is aylet's `z80.c` made re-entrant one frame at a time; `sound.c` and the opcode tables are used unchanged.

### ZXTune TFM Music Maker player
- **Author:** Vitamin (vitamin.caig@gmail.com)
- **Source:** https://github.com/vitamin-caig/zxtune (master, 2026-10-05): `src/formats/chiptune/fm/tfmmusicmaker.cpp`, `src/module/players/tfm/tfmmusicmaker.cpp`, `src/module/players/tfm/tfm_base_track.cpp`
- **License:** GPL-3.0
- **Used for:** TFM Music Maker (.tfe, ZX Spectrum TurboFM) playback. The parser, frame player and YM2203 register builder are extracted from ZXTune's framework into `tfm-wasm/src/tfm_player.cpp` (logic kept line for line) and drive two ymfm YM2203 (compiled to WASM, `public/tfm/`).

### StonePlayer (StoneTracker player)
- **Authors:** Michael Lavaire and Emmanuel Marty (StonePlayer V1.98, 1995)
- **Source:** Aminet `mus/edit/stonefree2.lha` (`Players.LHS`, unpacked with the archive's own `StoneEx`): `third-party/stonetracker/StonePlayer_Hard.bin`, the no-OS player binary; DeltaHuffman bank depacker ported from `Libs/StonePacker.library` (Aminet `mus/edit/stonefree1.lha`) into `stonetracker-wasm/src/st_dhuf.c`
- **License:** freeware - re-released free in 2001 by Emmanuel Marty with Michael Lavaire's agreement: "Feel free to provide these archives for download on your own site, as long as you retain this document." The readme is kept as `third-party/stonetracker/stonefree.readme`.
- **Used for:** StoneTracker (.spm + .sps) playback - the player binary runs unmodified except for a reordered three-instruction tail of its SOFT-interrupt handler (a lost-request race, see `stonetracker-wasm/src/st_machine.c`), compiled to WASM (`public/stonetracker/`).

### Musashi
- **Author:** Karl Stenerud
- **Source:** https://github.com/kstenerud/Musashi (commit 313ebf1, v4.60), vendored in `third-party/musashi/` with John R. Hauser's SoftFloat 2b (`third-party/musashi/softfloat/`)
- **License:** MIT (Musashi); SoftFloat's own permissive terms (`softfloat/README.txt`)
- **Used for:** the 68020 core that runs StonePlayer in `stonetracker-wasm`.

### piyopiyo-rs
- **Author:** crumblingstatue
- **Source:** https://github.com/crumblingstatue/piyopiyo-rs (player algorithm ported to `public/piyopiyo/PiyoPiyo.worklet.js`; drum samples copied to `public/piyopiyo/drums/`)
- **License:** 0BSD (`public/piyopiyo/drums/LICENSE-0BSD.txt`)
- **Used for:** Studio Pixel PiyoPiyo .pmd playback

### PxTone
- **Author:** Studio Pixel (Daisuke "Pixel" Amaya)
- **Source:** https://studiopixel.sakura.ne.jp/pxtone/
- **License:** MIT
- **Used for:** .ptcop / .pttune playback (compiled to WASM)

### Organya
- **Author:** Studio Pixel (Daisuke "Pixel" Amaya)
- **Used for:** .org (Cave Story music format) playback (compiled to WASM)

### EUP Mini
- **Used for:** .eup (FM Towns) format playback (compiled to WASM)

### Ixalance
- **Used for:** .ixs format playback (compiled to WASM)

### Cpsycle
- **Used for:** .psy (Psycle tracker) format playback (compiled to WASM)

### V2 Synthesizer / V2M Player
- **Author:** Tammo "kb" Hinrichs (Farbrausch)
- **License:** Public Domain
- **Used for:** V2M (Farbrausch demoscene synth) format playback. V2 code written 2000-2008.

### SunVox
- **Author:** Alexander Zolotov (NightRadio)
- **Source:** https://warmplace.ru/soft/sunvox/
- **License:** MIT (library)
- **Used for:** SunVox modular tracker format playback (compiled to WASM)

### AdPlug
- **Source:** https://github.com/adplug/adplug
- **License:** LGPL-2.1
- **Used for:** OPL2/3 (AdLib/Sound Blaster) music format playback

---

## Drum Machine Engines

### IO-808
- **Author:** Vincent Riemer
- **Source:** https://github.com/vincentriemer/io-808
- **License:** MIT
- **Copyright:** 2016 Vincent Riemer
- **Used for:** Roland TR-808 drum machine (1:1 TypeScript port)

### TR-909
- **Author:** Andre Michelle
- **Source:** https://github.com/andremichelle/tr-909
- **License:** MIT
- **Used for:** Roland TR-909 drum machine (adapted to TypeScript)

---

## DSP & Audio Libraries

### demucs.cpp
- **Source:** https://github.com/sevagh/demucs.cpp (vendored as `third-party/demucs.cpp-main`)
- **License:** MIT
- **Used for:** stem separation

### FFTW
- **Source:** https://www.fftw.org/ (vendored as `third-party/fftw-3.3.10`)
- **License:** GPL-2.0-or-later
- **Used for:** FFTs in the analysis and separation paths

### Shrinkler (size probe)
- **Source:** `third-party/shrinkler-wasm/shrinkler_size.cpp` - DEViLBOX's own glue around Shrinkler (https://github.com/askeksa/Shrinkler)
- **License:** GPL-3.0-or-later (DEViLBOX); Shrinkler itself under its own permissive licence
- **Used for:** Amiga executable size estimates

### rtosc
- **Source:** https://github.com/fundamental/rtosc
- **License:** MIT
- **Used for:** OSC plumbing for the ZynAddSubFX port; only build output lived in the tree and it is no longer tracked

### SunVox / SunDog engine (2002-2009 sources)
- **Source:** `third-party/sunvox_sources-master` (`sunvox_engine`, `sundog_engine`)
- **Author:** Alex Zolotov
- **License:** BSD (`sunvox_engine/docs/license.txt`, `sundog_engine/docs/license.txt`)
- **Used for:** the SunVox modular engine port

### Tone.js
- **Author:** Yotam Mann
- **Source:** https://github.com/Tonejs/Tone.js
- **License:** MIT
- **Used for:** Web Audio API framework — scheduling, synthesis, and effects

### Essentia.js
- **Source:** https://github.com/niclasr/niclasr.github.io (MTG port)
- **License:** AGPL-3.0
- **Used for:** Music information retrieval and audio analysis (WASM)

### Basic Pitch
- **Author:** Spotify
- **Source:** https://github.com/spotify/basic-pitch
- **License:** Apache-2.0
- **Used for:** Polyphonic pitch detection (ONNX model in browser)

### FFTW
- **Author:** Matteo Frigo, Steven G. Johnson
- **Source:** https://www.fftw.org/
- **License:** GPL-2.0
- **Used for:** Fast Fourier Transform computations

### BLEP Synthesis
- **Author:** aciddose (via PT2-Clone)
- **License:** BSD-3-Clause
- **Used for:** Band-Limited step (BLEP) anti-aliasing for waveform generation

### rosic AcidSequencer
- **Author:** Robin Schmidt
- **Used for:** TB-303 style acid sequencer pattern engine (TypeScript port)

### MXML (Mini-XML)
- **Author:** Michael R Sweet
- **Source:** https://github.com/michaelrsweet/mxml
- **License:** MIT
- **Used for:** XML parsing in WASM modules

### mpg123
- **Source:** https://www.mpg123.de/
- **License:** LGPL-2.1
- **Used for:** MP3 decoding (WASM, via mpg123-decoder npm package)

### FlodJS
- **Author:** Christian Corti (Neoart)
- **Used for:** Reference implementations for Amiga music replayer synthesis models (David Whittaker player port)

---

## Audio Effects (WASM)

### Buzz machines
- **Source:** https://github.com/Buzztrax/buzzmachines (vendored as `third-party/buzzmachines-master`)
- **License:** per machine - "There is no single license that applies to all machines. Please check individual author directories or machine sources." Each machine DEViLBOX ships is credited in its own directory's README.
- **Used for:** Buzz effect and generator machines compiled to WASM

### Calf Studio Gear
- **Source:** https://github.com/calf-studio-gear/calf
- **License:** GPL-2.0+ / LGPL-2.1
- **Used for:** Collection of audio effects — reverb, EQ, compressor, delay, and more (compiled to WASM)

### DISTRHO Ports
- **Source:** https://github.com/DISTRHO/DISTRHO-Ports
- **License:** Various (per plugin)
- **Used for:** Ported LADSPA/LV2 audio plugins (compiled to WASM)

### MDA Plugins
- **Author:** Paul Kellett
- **Source:** https://github.com/free-audio/mda-lv2
- **License:** MIT
- **Used for:** Classic effect and synthesizer plugins (compiled to WASM)

### Airwindows
- **Author:** Chris Johnson
- **Source:** https://github.com/airwindows/airwindows (via Surge XT)
- **License:** MIT
- **Used for:** High-quality audio effect algorithms

### Retromulator
- **Source:** https://github.com/mxmilkiwy/retromulator
- **License:** GPL-3.0
- **Used for:** Vintage hardware emulation effects

### Kiss of Shame
- **Source:** TheKissOfShame
- **Used for:** Tape deck saturation and degradation effects (ported to WASM)

### SpaceyDelayer
- **Author:** Will Pirkle (RackAFX)
- **Used for:** Stereo delay effect with modulation (DSP algorithm adapted to WASM)

### Voclib
- **Used for:** Vocoder effect processing (compiled to WASM)

---

## Speech Synthesis

### eSpeak NG
- **Source:** https://github.com/espeak-ng/espeak-ng
- **License:** GPL-3.0
- **Used for:** Text-to-speech synthesis (WASM, via @echogarden/espeak-ng-emscripten)

### DECtalk
- **License:** MIT (Emscripten port)
- **Used for:** Retro DECtalk speech synthesis (WASM, via @echogarden/dectalk-wasm)

---

## Visualization

### Three.js
- **Author:** Mr.doob and contributors
- **Source:** https://github.com/mrdoob/three.js
- **License:** MIT
- **Used for:** 3D WebGL rendering for visualizations

### Butterchurn
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT
- **Used for:** MilkDrop music visualization engine (WASM/WebGL port)

### projectM
- **Source:** https://github.com/projectM-visualizer/projectm
- **License:** LGPL-2.1
- **Used for:** Music visualization (MilkDrop compatible)

### p5.js
- **Source:** https://github.com/processing/p5.js
- **License:** LGPL-2.1
- **Used for:** Creative coding visualizations

### Interactive Shader Format (ISF)
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT
- **Used for:** Shader-based visual effects

### audiomotion-analyzer
- **Author:** Henrique Vianna
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT
- **Used for:** Audio frequency spectrum analyzer and visualizer

---

## UI Framework & Utilities

### React
- **Source:** https://github.com/facebook/react
- **License:** MIT
- **Used for:** UI component framework

### Zustand
- **Source:** https://github.com/pmndrs/zustand
- **License:** MIT
- **Used for:** Lightweight state management

### Immer
- **Author:** Michel Weststrate
- **Source:** https://github.com/immerjs/immer
- **License:** MIT
- **Used for:** Immutable state updates

### Tailwind CSS
- **Source:** https://github.com/tailwindlabs/tailwindcss
- **License:** MIT
- **Used for:** Utility-first CSS framework

### CodeMirror 6
- **Author:** Marijn Haverbeke
- **Source:** https://github.com/codemirror/dev
- **License:** MIT
- **Used for:** Code editor for SuperCollider SynthDef editing

### Lucide Icons
- **Source:** https://github.com/lucide-icons/lucide
- **License:** ISC
- **Used for:** Icon set for the DOM UI

### @dnd-kit
- **Source:** https://github.com/clauderic/dnd-kit
- **License:** MIT
- **Used for:** Drag-and-drop functionality

### @tanstack/react-virtual
- **Source:** https://github.com/TanStack/virtual
- **License:** MIT
- **Used for:** Virtualized scrolling for large lists

### JSZip
- **Source:** https://github.com/Stuk/jszip
- **License:** MIT
- **Used for:** ZIP file creation and extraction

### FileSaver.js
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT
- **Used for:** Browser-side file downloads

### @tonejs/midi
- **Source:** https://github.com/Tonejs/Midi
- **License:** MIT
- **Used for:** MIDI file parsing and generation

---

## Build Tools & Infrastructure

### Vite
- **Source:** https://github.com/vitejs/vite
- **License:** MIT
- **Used for:** Development server and production bundler

### TypeScript
- **Source:** https://github.com/microsoft/TypeScript
- **License:** Apache-2.0
- **Used for:** Type-safe JavaScript

### Emscripten
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT / University of Illinois
- **Used for:** Compiling C/C++/Rust to WebAssembly

### AssemblyScript
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** Apache-2.0
- **Used for:** TypeScript-to-WASM compiler for the native DSP engine

### Electron
- **Source:** https://github.com/niclasr/niclasr.github.io
- **License:** MIT
- **Used for:** Desktop application packaging

### JUCE
- **Source:** https://github.com/juce-framework/JUCE
- **License:** GPL-3.0 / Commercial
- **Used for:** Audio plugin framework (used by many synth WASM builds)

### ONNX Runtime Web
- **Source:** https://github.com/microsoft/onnxruntime
- **License:** MIT
- **Used for:** Machine learning model inference in browser

---

## Audio Decoders (WASM)

### FLAC Decoder
- **Source:** @wasm-audio-decoders/flac
- **License:** MIT
- **Used for:** FLAC audio decoding in browser

### Ogg Vorbis Decoder
- **Source:** @wasm-audio-decoders/ogg-vorbis
- **License:** MIT
- **Used for:** Ogg Vorbis audio decoding in browser

### Opus Decoder
- **Source:** @wasm-audio-decoders/opus-ml
- **License:** MIT
- **Used for:** Opus audio decoding in browser

---

## Reference Sources

These projects are used as reference implementations for format parsers and replayer accuracy:

### libxmp
- **Author:** Claudio Matsuoka
- **Source:** https://github.com/libxmp/libxmp
- **License:** MIT
- **Used for:** Reference format documentation for Amiga tracker formats

### NostalgicPlayer
- **Author:** Thomas Neumann
- **Source:** https://github.com/neumatho/NostalgicPlayer
- **License:** MIT
- **Used for:** Reference implementations for format parsers (C# source read for accuracy)

### RetrovertApp
- **Used for:** Comparison reference for format support coverage and magic-byte detection patterns

---

## Acknowledgments

Special thanks to the demoscene, chiptune, and open-source audio communities whose decades
of work make a project like DEViLBOX possible. In particular:

- **8bitbubsy** (Olav Sorensen) for meticulous ProTracker and FastTracker II clones
- **tildearrow** for Furnace, the most comprehensive chiptune tracker
- **MAME contributors** for preserving decades of audio hardware in software
- **Farbrausch** (kb, ryg, chaos) for V2 Synthesizer and the demoscene legacy
- **Thomas Neumann** for NostalgicPlayer's clean, well-documented format implementations
- **Robin Schmidt** for the Open303 DSP engine
- **The Surge Synth Team** for maintaining Surge XT and Monique as open source
- **Matt Tytel** for both Helm and Vital
- **Fons Adriaensen** for Aeolus and decades of Linux audio work
- **Studio Pixel** (Daisuke Amaya) for PxTone and Organya
- **The UADE team** for preserving Amiga music heritage
- **Aaron Giles** for ymfm and numerous MAME sound cores

---

## Sources not in the repository

Two original player sources we study but may not redistribute, and one
set of build objects, are kept on the maintainer's machine and ignored by
git. `third-party/PRIVATE_SOURCES.md` lists them.

*This file was last updated on 2026-10-04.*
