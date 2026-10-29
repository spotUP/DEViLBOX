---
date: 2026-10-29
topic: Song-playback engines and their per-channel output class (isolation / dub)
status: research
---

# Song-playback engines: per-channel output classes

Classes: A = isolation + dub outputs. B = dub outputs only. C = isolation only. D = stereo mix only (numberOfOutputs 1). T = Tone path (voices through ctx.channelOutputs[ch]; UNVERIFIED as song players).

## Counts and cross-check

- Source 1: `WASM_ENGINES` in `src/engine/replayer/wasmEngineRegistry.ts` = 67 entries (`key:` lines; grep -c says 68 because one is a comment). 66 distinct engine classes (`Hippel` and `TFMXModule` both use `TFMXEngine`).
- Source 2: `WHOLE_SONG_SYNTH_TYPES` in `src/engine/wholeSongSynths.ts` = 72. Registry synthTypes (67) are a strict subset. The 5 extras: `UADESynth` (UADE engine, shares class with registry `UADEEditable`), `SunVoxSynth`, `SunVoxModular`, `SymphonieSynth`, `C64SID`. No other mismatch.
- Source 3 (output side): classes calling `addIsolation(`: ChannelRoutedEffects, UADEEngine, HivelyEngine, WASMSingletonBase, LibopenmptEngine, SunTronicSongEngine, FurnaceDispatchEngine, PreTrackerEngine. Engines reaching the isolation path outside the registry: Libopenmpt (classic MOD/XM/IT) and FurnaceDispatch (editor mode `furnace`), both class A. Total song engines = 67 registry keys + Libopenmpt + FurnaceDispatch = 69 (+ SunVox, Symphonie, C64SID outside, class D/UNVERIFIED).
- Class tally, registry keys: A = 26 (24 on WASMChannelOutputsEngine + Hively + UADEEditable), B = 5 keys (4 classes), C = 1, D = 35. 26+5+1+35 = 67 OK.
- Class tally, whole set: A = 28 (26 + Libopenmpt + FurnaceDispatch), B = 5, C = 1, D = 35 registry + SunVox, Symphonie, C64SID (3, UNVERIFIED) = 38.

Mechanism: `src/engine/wasm/WASMSingletonBase.ts` `channelOutputNodeOptions(voices)` gives `numberOfOutputs = min(37, 1+4+voices)` stereo outputs: 0 main, 1..4 isolation slots, 5.. dub per voice. Worklet `public/worklets/channel-outputs.js` for base-class engines. Overrides: `supportsIsolationSlots()` false in TFMX (TFMXEngine.ts:241), Cinter4 (:177), Sonix (:171), SunTronicSong (:209); `supportsDubSends()` false in PreTracker (:483). Playing engine reaches isolation via `registerPlayingEngine` -> `setPlayingIsolationEngine(asIsolationCapable(...))`; `getActiveIsolationEngine()` at `src/engine/tone/ChannelRoutedEffects.ts` ~1439.

## Table (class A, base mechanism; TS `src/engine/<dir>/<Name>Engine.ts`, worklet `public/<dir>/<Name>.worklet.js`, build dir `<name>-wasm/`)

Voices = argument to `channelOutputNodeOptions(n)`; outputs = min(37, 1+4+n).

| Registry key | Class | Voices | Outputs | WASM dir / build | Mixer flag location |
|---|---|---|---|---|---|
| SoundControlReplayer | A | 4 | 9 | soundcontrol-wasm / build.sh | C mixer in dir (file UNVERIFIED) |
| DeltaMusic1Replayer | A | 4 | 9 | deltamusic1-wasm / build.sh | same |
| DeltaMusic2Replayer | A | 4 | 9 | deltamusic2-wasm / build.sh | same |
| SoundFxReplayer | A | 4 | 9 | soundfx-wasm / build.sh | same |
| GmcReplayer | A | 4 | 9 | gmc-wasm / build.sh | same |
| RonKlarenReplayer | A | 4 | 9 | ronklaren-wasm / build.sh | same |
| ActionamicsReplayer | A | 4 | 9 | actionamics-wasm / build.sh | same |
| ActivisionProReplayer | A | 4 | 9 | activisionpro-wasm / build.sh | same |
| SynthesisReplayer | A | 4 | 9 | synthesis-wasm / build.sh | same |
| DssReplayer | A | 4 | 9 | dss-wasm / build.sh | same |
| SoundFactory2Replayer | A | 4 | 9 | soundfactory-wasm / build.sh | same |
| FaceTheMusicReplayer | A | 4 | 9 | facethemusic-wasm / build.sh | same |
| FredReplayer2 | A | 4 | 9 | fred-replayer-wasm / build.sh | same |
| OktalyzerReplayer | A | 8 | 13 | oktalyzer-wasm / build.sh | same |
| InStereo1Replayer | A | 4 | 9 | instereo1-wasm / build.sh | same |
| InStereo2Replayer | A | 4 | 9 | instereo2-wasm / build.sh | same |
| FutureComposerReplayer | A | 4 | 9 | futurecomposer-wasm / build.sh | same |
| QuadraComposerReplayer | A | 4 | 9 | quadracomposer-wasm / build.sh | same |
| SoundMonReplayer | A | 4 | 9 | soundmon-wasm / build.sh (+CMake) | same |
| DigMugReplayer | A | 4 | 9 | digmug-wasm / build.sh (+CMake) | same |
| DavidWhittakerReplayer | A | 4 | 9 | davidwhittaker-wasm / build.sh (+CMake) | same |
| SonicArranger | A | 4 | 9 | sonic-arranger-wasm / build.sh (+CMake) | same |
| EaglePlayer | A | 4 | 9 | eagleplayer-wasm / CMake | same |
| Nuade | A | variable (`_nodeVoices`) | 5+n | nuade-wasm / build.sh (+CMake) | same |
| Hively | A (own) | 4 + instrument output | `INSTRUMENT_OUTPUT_INDEX+1` | hively-wasm / CMake | HivelyEngine.ts own wiring |
| UADEEditable (and UADESynth) | A (own) | MAX_DUB_CHANNELS | `1+MAX_ISOLATION_SLOTS+MAX_DUB_CHANNELS` | uade-wasm / build.sh | UADE C player in dir (UNVERIFIED) |
| (outside registry) Libopenmpt | A (own) | per module | same formula, worklet chiptune3 | openmpt-soundlib / CMake | libopenmpt render |
| (outside registry) FurnaceDispatch | A (own) | per chip | same formula | furnace-wasm / CMake (+scripts/build-furnace-wasm.sh) | furnace dispatch |

## Class B (dub only, isolation off)

| Registry key | Voices | Outputs | WASM dir | Note |
|---|---|---|---|---|
| Hippel, TFMXModule (one class TFMXEngine) | 8 | 13 | tfmx-wasm / CMake | C decoder mixes; `hippel-wasm` has no build file (UNVERIFIED mapping) |
| Cinter4 | 4 | 9 | cinter4-wasm / CMake | C mixes Paula channels |
| Sonix | 4 | 9 | sonix-wasm / CMake | |
| SunTronicSong | 4 | 9 | no `suntronic-wasm` dir found (UNVERIFIED); worklet `public/suntronic/SunTronicResampler.worklet.js` | resampler worklet |

## Class C

| PreTracker | `1 + MAX_ISOLATION_SLOTS`, no dub | pretracker-wasm / CMake | PreTracker.worklet.js |

## Class D (35 registry keys, numberOfOutputs 1; per-channel flag would need new outputs + C change)

Klystrack (klystrack-wasm), JamCracker (jamcracker-wasm), FuturePlayer (futureplayer-wasm), MusicAssembler (ma-wasm), BenDaglish (bd-wasm), MaxTrax (maxtrax-wasm), Pxtone (pxtone-wasm), Organya (organya-wasm), Sawteeth (sawteeth-wasm), Eupmini (eupmini-wasm), Ixalance (ixalance-wasm), Cpsycle (cpsycle-wasm), Sc68 (sc68-wasm), Qsf (qsf-wasm), Zxtune (zxtune-wasm), Aylet (aylet-wasm), PiyoPiyo (no wasm dir found, UNVERIFIED), TFM (tfm-wasm), Psgplay (psgplay-wasm), Gme (game-music-emu), S98 (s98-wasm), StoneTracker (stonetracker-wasm), MusicMaker (no wasm dir found, UNVERIFIED), PumaTracker (pumatracker-wasm), SteveTurner (steve-turner-wasm), SidMon1Replayer (sidmon1-wasm), ArtOfNoise (artofnoise-wasm), Pmdmini (pmdmini-wasm), Fmplayer (fmplayer-wasm), SidMon2 (sidmon2-wasm), Mdxmini (mdxmini-wasm), MusicLine (musicline-wasm, build.sh+CMake), Asap (asap-wasm), HippelSt (hippelst-wasm), V2M (v2m-wasm). Count 35.
Voice counts per format: UNVERIFIED (not read). Outside registry, also stereo mix only: SunVox (sunvox-wasm), Symphonie (symphonie-wasm), C64SID (no worklet found), UNVERIFIED.

## Class T / not song players (UNVERIFIED)

Per-note replayer instrument synths, numberOfOutputs 1, voices routed via Tone path: OctaMED, PT2, FC, Fred, StartrekkerAM, CheeseCutter, SidMon, RobHubbard, HippelCoSo, Voodoo (VoodooEngine extends WASMChannelOutputsEngine but is an instrument synth), Jingle, GTUltra (role UNVERIFIED), SF2.

## Gaps

- Exact C/C++ mixer source file per engine not identified, only the `<name>-wasm/` dir.
- Voice counts for class D not read.
- Master build: `scripts/build-all-wasm.sh` (169 modules, `--list`, module filter, `-j`); several build.sh dirs print "No build system found" in --list (build.sh not detected by the lister).
