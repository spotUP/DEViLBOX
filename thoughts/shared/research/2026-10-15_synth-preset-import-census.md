---
date: 2026-10-15
topic: Synth patch/preset import census and a universal import design
tags: [presets, import, sysex, fxp, soundfont, synths, research, design]
status: final
---

# Synth preset import census

Question: for every synth/engine DEViLBOX emulates or hosts, which patch/preset
import formats make sense, what exists, and what a universal import needs.
Read-only research; no source edited. "UNVERIFIED" marks anything not read in a
vendored source or in this repo; each such item says where I looked.

## 1. What I counted (and from which structure)

| Structure | Count | File |
|---|---|---|
| `SynthType` union members (unique, after removing 2 duplicate lines: `ToneAM`, `SunVoxModular`) | 302 (304 lines) | `src/types/instrument/base.ts:6` |
| `SYNTH_INFO` entries (keyed records across the 9 category data files) | 245 keys, 242 distinct `type:` values | `src/constants/synthCategories/{amiga,buzz,classic,furnace,fx,percussion,mame,plugin,sample}*.ts` |
| Picker categories | 24 | `src/constants/synthCategories/categories.ts` |
| `SYNTH_LAYOUTS` keys (panel layouts) | 141 (76 of them are the shared `FURNACE_LAYOUT`) | `src/constants/synthLayouts/index.ts` |
| VSTBridge (JUCE WASM) descriptors | 9: Vital, Odin2, Surge, TonewheelOrgan, Melodica, Monique, Helm, Sorcer, OBXf | `src/engine/vstbridge/synth-registry.ts:59-262` |
| `SynthRegistry` builtin descriptor files | 11 files, about 20 descriptors (`tone.ts` 9, `sampler.ts` 3, one each for cinter4, dx7, geonkick, opl3, openwurli, sonix, tb303, supercollider; Furnace registers in a loop, not counted) | `src/engine/registry/builtin/*.ts` |

The 302 union is the real superset. Of those, roughly 130 are tracker-format
replayers (`*Synth` for UADE/WASM song engines), 76 are Furnace chips, ~43 MAME
chips, 13 Buzz machines. Only ~60 are synths a user would load a *patch* into.
Note: `SF2Synth` is SID Factory II, not SoundFont. SoundFont is `FluidSynth`.

## 2. Existing import and preset infrastructure (file:line)

### 2.1 Entry points that exist today

- Global drop: `src/components/ui/GlobalDragDropHandler.tsx:26-41` holds a hard
  extension set (`.dbx .dbi .sunsynth .sunvox .xml .sqs .seq .mid` + audio +
  tracker formats). Routing is in `src/lib/file/UnifiedFileLoader.ts:88-104`
  (`.dbi` -> `loadInstrumentFile` :143, `.sunsynth` -> `setPendingSunVoxFile` :95,
  `.xml` -> `loadXMLFile` :170 -> DB303 preset). Anything else: "Unsupported".
  No `.syx`, `.fxp`, `.fxb`, `.vital`, `.helm`, `.odin`, `.sfz`, `.sf2`,
  `.synthv1`, `.xmz/.xiz`, `.fui` here (checked: grep of both files).
- Per-synth ad-hoc file inputs (each re-implements picker + parse + apply):
  - DX7: `DX7Controls.tsx:339` (accept `.syx`, drop zone :325), `DexedHardwareUI.tsx:154,506`.
  - MAME VFX: `MAMEVFXVoiceMatrix.tsx:66-74,91` sends the raw file bytes to the chip as a MIDI event (`engine.addMidiEvent`), no parse.
  - Sfizz: `SfizzControls.tsx:87` (`.sfz,.wav,.flac,.ogg,.aiff` + folder), `SfizzSynth.ts:326,375`.
  - SunVox: `SunVoxImportDialog.tsx:88`, `SunVoxModularEditor.tsx:111` (`.sunsynth`).
  - Hively: `HivelyImportDialog.tsx:67` (`.hvl,.ahx`, extracts instruments out of a whole song via `extractInstrumentsFromHvl`, `HivelyParser.ts`).
  - Furnace: `FurnaceEditor.tsx:634` (wavetables only, `.wav,.fuw`); `FurnacePresetBrowser.tsx` lists bundled `public/data/instruments/furnace/**` (20 chip folders, `.fui`).
  - NKS: `LoadPresetModal.tsx:724-732` (`.nksf`), `usePresetStore.ts` `importNKSFFiles`; Library browser `NKSLibraryBrowser.tsx:323` fetches `/api/devilbox-presets/preset-data` (server route, not in static deploy).
  - User preset JSON: `LoadPresetModal.tsx:314` calls `importPresets` for a `UserPreset[]` JSON.
  - TD-3 patterns: `TD3PatternDialog.tsx:580` (pattern, not a patch).
- Instrument file round trip: `.dbi` export `src/lib/export/exporters.ts:393-408`, import `UnifiedFileLoader.ts:143`. This is DEViLBOX's own interchange format and the natural universal container.

### 2.2 Parsers that exist but are unreachable or partial

| Item | Evidence | Gap |
|---|---|---|
| DX7 32-voice `.syx` -> VCED | `dx7sysex.ts:119 parseDX7Cartridge` accepts only >=4096 bytes (:123-130); `DexedHardwareUI.tsx:93` accepts exactly 4096/4104 | Single-voice dump (format 0, 163 bytes) rejected; DX7II/TX802 (formats 1-2 etc.), DX9 not handled |
| DX7 sysex framing (F0 43 00 09 20 00 ... checksum F7) | built three times: `DX7Synth.ts:144-156`, `DX7Controls.tsx:195-203`, `DexedHardwareUI.tsx:110-117` | Triplicated; violates single source |
| Surge `.fxp` | WASM `SurgeWASM.cpp:174-178` handles command `loadPatch` -> `synth_->loadRaw` (takes the "sub3" chunk, i.e. the .fxp minus its 60-byte VST header; see upstream `SurgeSynthesizerIO.cpp:210-240` header check `CcnK/FPCh/cjs3`) | `VSTBridgeSynth.sendCommand` (`VSTBridgeSynth.ts:301`) has zero callers; no UI, no header stripping |
| Vital/Odin2/Monique/Helm commands | `Vital WASM handleCommand` returns false (`VitalWASM.cpp:158-162`), Odin2 false (`Odin2WASM.cpp:907`), Monique/Helm only `setBPM`/`setStepSeq` | These need a TS-side parser + per-parameter apply; WASM has no state loader (descriptor claims `commands: ['loadWavetable','loadPreset']` for Vital, `synth-registry.ts:67`, but the C++ does not implement them) |
| Helm `.helm` JSON | `src/lib/helmPresetLoader.ts` (`HelmPresetFile {settings}`, `buildHelmParameterUpdates`) used by `HelmHardwareUI.tsx:103,193` | Reached only via the NKS Library path / `devilbox:load-helm-preset` window event; no file picker, no drop |
| OB-Xf | `OBXfHardwareUI.tsx:351` posts `loadPatch` with 45-value `OBXD_NATIVE_PRESETS` (`oberheimPresets.ts:26`) | Upstream `.fxp` (CcnK program-set with chunk, `OB-Xf-main/src/Utils.cpp:231,269-273,358-361`) not parsed |
| Furnace `.fui` | `FurnaceParser.ts:28` (FINS/INS2/INST) + `furnace/FurnaceInstrumentParser.ts`; store action `loadFurnaceInstrument` `useInstrumentStore.ts:1914` | No caller of `loadFurnaceInstrument` outside the store (grep `-v` the store: none). Furnace file dialogs accept 16 other FM formats (below) that are not parsed |
| Furnace `.fui` export | `FurnaceExporter.ts:1287` | Exists; good round-trip anchor |
| FluidSynth `.sf2` | `FluidSynthSynth.ts:262 loadSF2(data, filename)` | No UI caller; only `default.sf2` (:256). `FluidSynthControls.tsx` has program/bank/reverb knobs only |
| Geonkick `.gkick` | `GeonkickPresetLoader.ts:279` (JSON.parse), `GeonkickControls.tsx:280` | Only the 82 bundled presets (manifest fetch, `GeonkickControls.tsx:101-109`); no user-file path |
| ZynAddSubFX XML | `ZynAddSubFXSynth.ts:472 setPreset`, :453 fetch from `public/zynaddsubfx/presets/*.xml` (20 files); `CommunitySynthFactory.ts:1070` | Name-keyed bundled XML only; user `.xmz`/`.xiz` (gzip) not accepted |
| Ripped presets | `harvestSongPresets.ts`, `usePresetStore` `rippedPresets` cap 500 (:24) | Not import; harvests from loaded songs (fingerprint-deduped) |

### 2.3 Native-patch mechanism (reusable)

`src/engine/common/NativePatchLoader.ts`: `NativePatch {name, values:number[]}`
plus `loadNativePatch(worklet, values)` / `captureNativeState` for any worklet
that speaks `loadPatch`/`getState`. Used by synthv1, Calf Mono, TAL-NoiseMaker,
Raffo, setBfree (`useInstrumentStore.ts:858-864` maps `*NativePatch` config keys
to `loadNativePreset(name)`), and OB-Xf. All presets are name-keyed bundled
arrays; there is no path from "bytes of a file" to a `NativePatch`.

### 2.4 How presets are stored and listed

- Factory: `src/constants/factoryPresets/index.ts` aggregates ~30 arrays (`bass lead pad drum chip tr808 tr909 mame organ module ...`) plus per-synth files in `src/constants/*Presets.ts` (`zynthianPresets.ts` wraps 14 Zynthian-class engines via `makePresets`; `jucePresets.ts:11` makes DX7 presets from `DX7_VCED_PRESETS`). Type: `InstrumentPreset['config']`.
- User: `src/stores/usePresetStore.ts`, zustand persist, key `devilbox-user-presets`, `version: 2` (:313-314), inline `migrate` (:319-333). `UserPreset {id,name,category,synthType,tags,createdAt,updatedAt,config}` (:29). Cloud-synced under `SYNC_KEYS.INSTRUMENT_PRESETS` (`useCloudSync.ts:22`, subscribe at store bottom).
- Applying a preset: `useInstrumentStore.updateInstrument(id, {name, synthType, ...config})`; the `isPresetLoad` guard at `useInstrumentStore.ts:368` stops the "auto-apply first factory preset" path (:571-585). Engine-side hot-reload special-cases follow at :820 (DX7 `vcedPreset`), :853-890 (Zyn XML, native patches).
- Cross-component hand-off hack: `src/lib/pendingPresetData.ts` (module-global, 10 s expiry, types `'helm'|'dexed'` only) and window events `devilbox:load-dexed-preset` / `devilbox:load-helm-preset`.
- Attribution pattern already invented once: `src/engine/dx7/dx7Library.ts:15-22` manifest `{file,name,author,source,licence,voiceCount,voices}` + `public/data/sysex/ATTRIBUTION.md`. 13 of 33 Dexed banks ship in `public/data/sysex/dx7/`.
- Persistence-migration helper `src/lib/persistence/migrations/index.ts` is for the saved PROJECT schema (`CURRENT_SCHEMA = 25`, `MIN_LOADABLE_SCHEMA = 21`), not for the preset store. The preset store has its own inline migrate. A user-preset migration chain does not exist yet.
- Other preset stores with their own keys: `effectPresetStorage.ts` (`KEY_PREFIX + effectType`), `devilbox-mpc-presets`. Same pattern re-invented (effects only; out of scope).

## 3. Per-synth census: native formats and what makes sense

Verification legend: [V] read in vendored source under `third-party/` or repo
engine code; [M] known from outside knowledge, not confirmed in this tree.

### 3.1 FM / phase-distortion / sampled-ROM hardware emulations (SysEx world)

| Synth (SynthType) | Native format [verification] | Notes |
|---|---|---|
| DX7 (`DX7`, Dexed UI) | `.syx`: 32-voice bulk (F0 43 0n 09 20 00, 4096 B packed, checksum, F7; 4104 B) [V `dx7sysex.ts:119`, `DX7Synth.ts:144`]. Single voice dump format 0 (F0 43 0n 00 01 1B + 155 B VCED + cs + F7, 163 B) [M, standard DX7 spec; parser lacks it]. | Biggest ecosystem: thousands of free banks. Raw 4096 B and 4104 B accepted today. Add single-voice and DX7II/TX7 variations; Dexed `.fxp/.fxb` also wraps a 161-B cart [M]. |
| MAME YM/OPN synths with VFX, SWP, MU2000, ES5503, ICS2115, C352, K054539, YMF271 | VFX `.syx` (Ensoniq VFX 60/120 program dump) [V loader just forwards bytes `MAMEVFXVoiceMatrix.tsx:73`; format itself M]. Ensoniq EPS/ASR/SQ `.syx` [M]. | `VFXSynth.ts:333 loadPatch(VFXPatch)` is a patch model with no sysex decoder, so the file loader in the UI is a raw passthrough, not an import. |
| CZ-101 (`CZ101`) | Casio CZ single-tone `.syx` (F0 44 00 00 7n 20..; tone dump 264 B) [M]; 16-tone bank files [M]. App model `CZPatch` (`cz101Types.ts`), `CZ101Synth.ts:231 loadPatch`. | Preset bank of 59 exists (commit 0cf744a1d). Decoder needed: sysex tone -> `CZPatch`. Small, well documented format. |
| D-50 (`D50`) | Roland D-50 `.syx` patch/ bulk (F0 41 .. 14 ..) [M]; model `D50Patch`, `D50Synth.ts:316 loadPatch`. | Needs ROM (`public/roms/d50`). Decoder: sysex -> `D50Patch`. Mid effort (Tone/Common/Partial blocks). |
| JX-10 / Juno / JP-8000 (retromulator in `public/roms/gearmulator`; app wiring: `DX7Synth.ts` mentions only) | Roland sysex dumps, Access Virus `.mid/.syx` single/bank [M]. | UNVERIFIED which gearmulator synths the app actually exposes: `src/constants/synthCategories/categories.ts` mentions it; no `SynthType` named Virus/JP8000 found in the union list. Not worth importing until exposed. |
| Rolland GP/SA, SWP00/20 (MAME `MAMERolandGP`, `MAMESWP*`) | ROM-based, parameters mostly bank/program index. | Not a patch-import target. |
| OPL3 (`OPL3`), Furnace `FurnaceOPL*` | OPL: `.sbi`, `.ibk`, `.bnk`, `.opli`, `.wopl` (Furnace file filter in `third-party/furnace-master/src/gui/gui.cpp:1994` lists `.sbi .opli .bnk .wopl`) [V]. | See Furnace row. |
| YM2612/OPN family | `.tfi .vgi .y12 .gyb .opni .wopn .dmp .eif .opm` [V same filter line]. | One FM-patch converter feeds the 12 OPN/OPM/OPL/OPLL/OPZ/OPNA/OPNB Furnace types. |

### 3.2 Subtractive/wavetable/hybrid plugin ports (JUCE WASM VSTBridge)

| Synth | Native format [verification] | Notes |
|---|---|---|
| Surge XT (`Surge`) | `.fxp` VST2 program: header `CcnK`/`FPCh`/`cjs3` [V `SurgeSynthesizerIO.cpp:229-238`], chunk = "sub3" header + XML + embedded wavetables [V `SurgePatch.cpp:1138`]. `surge-xt/resources/data/patches_factory` and `patches_3rdparty` hold 3492 `.fxp` files in the vendored tree [V `find`]. | Largest high-quality library (free, GPLv3 factory + CC0/3rd-party). WASM already has `loadPatch` taking the chunk; only TS glue missing: strip the 60-byte header, call `sendCommand('loadPatch', chunk)`. Best value/effort in the plugin ports. |
| Vital (`Vital`) | `.vital` = JSON; extension constant `kPresetExtension = "vital"` [V `synth_constants.h:52`]; JSON fields `preset_name`, `author`, `settings`, `modulations` [V `load_save.cpp:141-142,228`]. Banks `.vitalbank` (zip) [M], wavetables `.vitaltable` [M]. | WASM does not load state (`VitalWASM.cpp:158`). Need TS: JSON `settings` key -> parameter id via the existing param list (`getParamName`). Wavetable data inside `.vital` is base64 float frames [M] (needs `loadWavetable`, not implemented). Large community library. |
| Odin2 (`Odin2`) | `.odin` = JUCE `ValueTree` binary stream (`ValueTree::writeToStream`, `PatchBrowser.cpp:222,672-682`; read `ValueTree::readFromStream` `PluginProcessorReadPatch.cpp:47`) [V]. | Binary ValueTree parsing in TS is real work (JUCE format: varint property count, typed `var` encoding) [M for byte layout]. Parameters then map by name to `m_value_tree`. Effort L. `Odin2WASM.cpp:907` implements no loader. |
| Helm (`Helm`) | `.helm` = JSON (`PATCH_EXTENSION = "helm"` `helm_common.h:186`; `settings` map + `modulations` + `synth_version` `load_save.cpp:54-79`) [V]. | TS loader exists (`helmPresetLoader.ts`, `buildHelmParameterUpdates`) and the UI applies it; needs file wiring only. Effort S. Free patches widely available (Helm's factory CC). |
| OB-Xf (`OBXf`, plus OB-Xd) | `.fxp` VST2 program-set with chunk [V `OB-Xf-main/src/Utils.cpp:269-273,358-361`; `isMemoryBlockAPatch`]; chunk body format = XML/plain program [UNVERIFIED, did not open `Utils.cpp:231-300`]. | OB-Xd `.fxb` banks widely shared (hundreds of free OB-X/Xa/8 patches) [M]. App holds 45-value `NativePatch`. Need chunk -> 45 values. Effort M. |
| Monique (`Monique`) | `.mlprog` XML (root `PROJECT-1.0` with attribute map `OSC_0_wave="..."`) [V `monique-monosynth/resources/files/A/*.mlprog`; loader `monique_core_Datastructures.cpp:3057`]. Banks are folders A/B/C... | Attribute names -> parameter ids; Monique is already a VSTBridge synth. Effort M. Factory bank shipped in vendored tree (GPL). |
| Sorcer | LV2-only, no on-disk preset format found [V: `sorcer-master` tree has `faust/gui/CMake`, no preset dir]. | Not worth importing. |
| Tonewheel organ, Melodica | none | Not worth importing. |
| amsynth (`Amsynth`) | `.bank` text: `<preset> <name> X` followed by `<parameter> name value` lines [V `amsynth-master/data/banks/BriansBank01.amSynth.bank`, `Preset.cpp:106-122`: header `amSynth1.0preset`]. Bank files `*.bank` and `amSynth.bank` suffix [V `PresetController.cpp:496`]. | Trivial text parser; tens of free banks in-tree (`data/banks`). Effort S. |
| synthv1 (`SynthV1`) | `.synthv1` XML (`<preset>` tag, `synthv1_param.cpp:342,408`; mime glob `*.synthv1` `mimetypes/*.xml`) [V]. Presets also as bank programs [V `synthv1_programs.cpp`]. | Maps to `NativePatch` values by param list. Effort S-M. |
| Calf Monosynth (`CalfMono`) | `presets.xml` with `<preset plugin="monosynth" name=...><param name value/>` (78 presets in vendored tree) [V `calf-studio-gear/presets.xml`]. | App already parses the 21 factory ones. User presets are the same XML. Effort S. |
| TAL-NoiseMaker (`TalNoizeMaker`) | In-app 256 presets "parsed from upstream ProgramChunk.h" (`talNativePresets.ts:2`) [V]. On-disk user format `.noisemakerpreset`/`.fxp` [M, UNVERIFIED]: TAL source not vendored (looked in `third-party/`, none). | Do not build a file parser from guesses. |
| Raffo (`RaffoSynth`) | No preset file; `third-party/RaffoSynth` is source only (checked `ls`) | Skip. |
| setBfree (`SetBfree`) | `.pgm` text programme files (`# comments`, one program per line) [V `setBfree/pgm/default.pgm`, `popular.pgm`] and `.cfg` configs [V dir `cfg`]. | 128 factory already imported as `NativePatch`. A `.pgm` parser would let users add banks. Effort S. |
| mda JX10 / DX10 / EPiano | Built-in program tables in source (`MdaJX10Synth.ts JX10_PRESETS`); VST host files are `.fxp/.fxb` of raw float params [M]. | Tiny float arrays; `.fxp` parse covered by the common FXP reader. Low demand. |
| ZynAddSubFX (`ZynAddSubFX`) | `.xmz` (gzipped XML master), `.xiz` (gzipped XML instrument), `.xsz` scale, `.xlz` layer [M: zyn source not in `third-party/`; looked: only `public/zynaddsubfx/*` wasm]. App parses plain XML from `public/zynaddsubfx/presets` (20 files) [V]. | Gunzip with `DecompressionStream('gzip')` then reuse the existing XML-load path (`ZynAddSubFXSynth.ts` `loadPresetXML`). Large public library (Zyn/Yoshimi banks). Effort M. |
| Aeolus (`Aeolus`) | `~/.aeolus-presets` and `<instrdir>/presets` (binary stop registration file) [V `aeolus/source/model.cc:1316-1321,1395`]. | Niche. Skip. |
| VL1 (`VL1`) | none found [V grep `src/engine/vl1`: preset table only] | Skip. |

### 3.3 Sampler / soundfont hosts

| Synth | Format | Notes |
|---|---|---|
| FluidSynth (`FluidSynth`) | `.sf2` (RIFF sfbk), `.sf3` (compressed) [M]; engine `loadSF2` exists [V `FluidSynthSynth.ts:262`] | Add the missing UI/drop path; patch selection = bank+program already in the controls. Effort S for load; listing the SoundFont's presets (name table) needs an sfbk `phdr` parse, S-M. Also `.dls` is not supported by fluidsynth. |
| Sfizz (`Sfizz`) | `.sfz` + samples [V `SfizzControls.tsx:87`, `SfizzSynth.ts:326`] | Exists (file+folder). Needs drop-handler routing. Browser has no folder-relative resolution beyond `webkitdirectory`. |
| Sampler / Player / Granular / DrumKit | audio `.wav .aiff .flac .ogg .mp3` [V `isAudioFile` `UnifiedFileLoader.ts:131`], `.sfz`, `.sf2`-sample extraction (DLS/SF2 -> samples) [M] | Audio drop exists. SF2/SFZ/DLS as instrument-bank import into Sampler is the real gap. Kontakt/`.nksf` for `Kontakt` bridge exists. |

### 3.4 Chip, tracker-native and "instrument file" worlds

| Synth family | Format | Notes |
|---|---|---|
| Furnace (76 chip types) | `.fui` (FINS/INS2) [V `furnace-master/src/engine/instrument.cpp:1728,4222`; `FurnaceParser.ts:28`]; also DMP, TFI, VGI, EIF, S3I, SBI, OPLI, OPNI, Y12, BNK, FF, GYB, OPM, WOPL, WOPN [V `furnace-master/src/gui/gui.cpp:1994-1996`]. Wavetable `.fuw` [V `FurnaceEditor.tsx:634`]. | The single biggest multiplier: one importer set serves ~35 FM chip types and the NES/GB/C64/etc. types via `.fui`. Bundled: 20 folders of `.fui`. |
| HivelyTracker/AHX (`HivelySynth`) | Instrument file magic `HVLI` (`replay.c:657`) / AHX `THXI` (`replay.c:777`) [V `hivelytracker-master/replay.c`]; also full `.hvl/.ahx` songs (already importing instruments from songs). | Standalone instrument load missing; the song path exists (`HivelyImportDialog`). File extension of instrument files UNVERIFIED (looked in `gui.c`, `replay.c`). |
| SunVox / SunVox Modular | `.sunsynth` (module), `.sunvox` (project) [V accepted at `GlobalDragDropHandler.tsx:32`; SunVox sources in `third-party/sunvox_sources-master`]. | Exists end to end. |
| TB-303 / DB303 (`TB303`) | DB303 XML preset (`Db303PresetConverter.ts:12,179`, route `UnifiedFileLoader.ts:101`); TD-3 `.sqs/.seq` patterns and sysex (`TD3SysExDecoder.ts`) [V]. | Exists. TD-3 patterns are patterns, not patches. |
| Geonkick (`Geonkick`) | `.gkick` JSON [V `GeonkickPresetLoader.ts:1-12,279`] | Loader exists; user-file path missing. Effort S. |
| Klystrack (`KlysSynth`) | instrument `.ki`, song `.kt` [M for `.ki`; `.kt` in `KlysEngine.ts:4`] | `.ki` UNVERIFIED (not found by grep in `src/engine/klystrack`, `src/components/klystrack`). Bank has factory presets (`src/constants/klysPresets.ts`). |
| Cinter4, Sonix, SunTronic, DeltaMusic, FC, Fred, Hippel, etc. (about 100 `*Synth` replayers) | Instruments live inside song files; some have standalone files (Sonix `.instr/.ss` companion already routed at `GlobalDragDropHandler.tsx:160-170`). | Their "preset" is a song-level instrument. Not an independent preset import; handled by song import. Skip. |
| V2 (`V2`, `V2Speech`, `V2MSynth`) | V2 patch/bank `.v2p/.v2b` [M; V2 player code is in `src/engine/v2/`, patch struct in `sounddef.cpp`, but the bank file layout was not read]. | UNVERIFIED. `V2_FACTORY_PRESETS` exists (`v2FactoryPresets/*.ts`). `src/types/v2Instrument.ts:529` already converts config to raw patch bytes, so a `.v2b` reader (or reader of a v2m instrument) would be small. |
| WaveSabre (`WaveSabreSynth`) | VST2 chunk (`getChunk/setChunk` `VstPlug.h:32-33`) [V]; project `.wsp` [M]. | Chunk is a raw param block; no public bank library. Skip. |
| Oidos (`OidosSynth`) | Renoise `.xrns` converted by `OidosConvert.py` [V `oidos-master/README.md:66-71`]. | Extremely niche. Skip. |
| Tunefish (`TunefishSynth`) | `tf4programs/programN.txt`, text `Key;value` per line [V `third-party/tunefish/patches/tf4programs/program0.txt`, 92 files]. | App has presets? UNVERIFIED (not grepped for a Tunefish preset table). Text parser trivial, S, but only 92 patches ship. |
| Speech (SAM, DECtalk, PinkTrombone, TMS5220, Votrax...) | none (text-to-speech strings) | Not importable; scripts, not patches. |
| TR-808/909/707/505, Drum machines, DubSiren, SpaceLaser, Synare, WobbleBass, Buzz machines | no interchange format | Skip; their value is the existing factory lists. |
| Tone.js group (Synth, MonoSynth, FM, AM, Pluck, Metal, Membrane, Noise, Poly, SuperSaw, Wavetable, PWM, Organ, StringMachine, Formant, ChipSynth, Harmonic) | none; DEViLBOX-native config JSON only | Round-trip via `.dbi`/`UserPreset` only. |
| WAM plugins (`WAM*`), `AUPlugin`, `Kontakt` | host-owned state / `.nksf` / `.fxp` [M] | `.nksf` import exists; leave WAM/AU state to the plugin UI. |

### 3.5 Format families that cut across many synths (the real multipliers)

1. VST2 `.fxp` / `.fxb` envelope (`CcnK`; `FxCk` raw floats; `FPCh/FBCh` opaque chunk) [V from `Utils.cpp:273`, `SurgeSynthesizerIO.cpp:233`]. Covers Surge, OB-Xf/OB-Xd, mda (raw floats), Dexed, Odin2 (`.fxp` on top of `.odin`) [M], TAL [M].
2. Yamaha/Casio/Roland/Ensoniq SysEx (`.syx`): needs a manufacturer/model sniffer on byte 1-4.
3. XML/JSON/text patch dialects: `.vital .helm .gkick .synthv1 .mlprog presets.xml amsynth.bank .pgm tf4`.
4. Sample-set formats: `.sf2 .sfz` (+ `.dls .sf3` [M]).
5. FM instrument formats read by Furnace (16 extensions).

## 4. Recommended design: one registry, one entry point, one store

### 4.1 Registry (new `src/lib/presetImport/`, keyed by synth type)

```ts
interface PresetFormat {
  id: string;                         // 'dx7-sysex', 'surge-fxp', 'vital-json'
  label: string;                      // full English: 'Yamaha DX7 SysEx bank'
  extensions: readonly string[];      // ['.syx'] (lowercase, with dot)
  synthTypes: readonly SynthType[];   // targets; 1..n (Furnace FM -> 12)
  sniff(bytes: Uint8Array, name: string): number;  // 0..1 confidence, never throws
  parse(bytes: Uint8Array, name: string): ParsedPreset[];  // pure; 1 file -> N presets
  serialize?(p: ParsedPreset): Uint8Array;         // only where lossless
}
interface ParsedPreset {
  name: string; synthType: SynthType; category?: PresetCategory;
  payload:
    | { kind: 'config'; config: Partial<InstrumentConfig> }      // goes through updateInstrument
    | { kind: 'native'; values: number[] }                       // NativePatch route (existing)
    | { kind: 'blob'; format: string; bytes: Uint8Array };       // sysex/fxp chunk/sf2, engine consumes
  meta: { author?: string; source?: string; licence?: string; comment?: string; originalFile: string };
}
```

- One entry `importPresetFiles(files: File[], ctx: {targetInstrumentId?, synthType?})`. It reads bytes, asks every format whose extension matches (plus content sniffers for ambiguous `.syx` and `.xml`), picks the highest `sniff`, `parse`s, and returns `ImportResult {presets, skipped, errors}`.
- Three callers, no per-synth file inputs any more: (a) the preset picker (`LoadPresetModal.tsx` + `PresetDropdown.tsx`) with an "Import" button and a `<input accept>` computed from the registry (current instrument's `synthType` first); (b) `GlobalDragDropHandler.tsx` (extend its `SUPPORTED_EXTENSIONS` from the registry and route in `UnifiedFileLoader` before "Unsupported"); (c) the instrument editors' "Load" buttons (replace `DX7Controls.tsx:339`, `DexedHardwareUI.tsx:506`, `MAMEVFXVoiceMatrix.tsx:91`).
- Apply step lives with the format owner, not in components: `apply(preset, instrumentId)` - `config` -> `updateInstrument` (keeps the `isPresetLoad` guard at `useInstrumentStore.ts:368`); `native` -> `loadNativePatch`; `blob` -> an engine method (`DX7Synth.loadSysex`, `VSTBridgeSynth.sendCommand('loadPatch', chunk)`, `FluidSynth.loadSF2`). This retires `pendingPresetData.ts` and the two `devilbox:load-*-preset` window events (replace by storing the parsed preset in the instrument config so the hardware UI reads it on mount like any other config).
- Multi-preset files (DX7 cartridge of 32, Vital bank, Monique folder, amsynth bank, Calf `presets.xml`) return N `ParsedPreset`s; the UI imports all into the user store, grouped by a `bank` field, and loads the first/selected into the instrument.

### 4.2 One user-preset store

Extend `usePresetStore` (do not add a second store). New fields on `UserPreset`:
`source: { kind: 'user'|'import'|'ripped'|'factory'; originalFile?: string; format?: string }`,
`attribution: { author?: string; sourceUrl?: string; licence?: string }`,
`bank?: string`, `payload` (union above; today only `config`). Bump `version` 2 -> 3 and
write a migration (`config` -> `payload: {kind:'config', config}`) in a new
`src/lib/persistence/migrations/userPresets.ts` that the persist `migrate` calls.
Reuse the `dx7Library.ts` manifest fields (author, source, licence) as the attribution shape so
bundled libraries and user imports share one type. Dedupe with `presetFingerprint`
(`harvestSongPresets.ts`) extended to hash `blob` bytes.

Constraints that matter:
- localStorage budget: a Surge patch is 20-200 KB (embedded wavetables), a Vital preset 100 KB+, a soundfont is megabytes. Keep `blob` payloads over ~64 KB in IndexedDB (`persistentStorage.ts` exists in `src/lib/persistence/`) and keep only the id in the zustand record. `RIPPED_PRESET_CAP = 500` shows the store is already size-sensitive.
- Licence gate: refuse to auto-bundle a file lacking a recorded licence; user imports are private and not shipped. Attribution travels with the preset into `.dbi` and cloud sync.

### 4.3 Export counterpart (round trip)

Where lossless: DX7 cartridge/single `.syx` (build once in `dx7sysex.ts`, delete the three copies), `.fui` (exists: `FurnaceExporter.ts:1287`), `.gkick` JSON, `.helm` JSON, `.vital` JSON, amsynth bank, `.synthv1` XML, `.fxp` for Surge (header + chunk is easy once the chunk is captured; needs `getChunk` from WASM, UNVERIFIED if exposed), `.sunsynth`. Always: `.dbi` and `UserPreset[]` JSON (exists). No export for Odin2 `.odin`, `.xmz` unless the engine can serialise state.

### 4.4 Tests (house rules)

One reachability test per feature: drop a real fixture through `importPresetFiles` -> instrument gets the preset -> a sentinel proves the engine received it (the `DX7Synth.loadSysex` call-count, the `SurgeWASM` `loadPatch` command). Per-format parse tests on small real files (the shipped `public/data/sysex/dx7/*.syx`, vendored Surge `.fxp`, `third-party/monique-monosynth/resources/files/A/*.mlprog`, `amsynth-master/data/banks/*.bank`, `tunefish/patches/tf4programs/program0.txt`). Add to `test:ci`.

## 5. Order of work (user value x effort)

1. DX7/Dexed: harden parser (single voice, odd lengths, checksum report), one framing builder, route through the registry. S. Highest value: ecosystem is enormous, partly there, and removes three duplicate framers.
2. Registry + single entry point + drop-handler/picker wiring (no new format). M. Everything below depends on it; reachability test lives here.
3. Surge `.fxp`/`.fxb`: header strip + `sendCommand('loadPatch')`. S (WASM side done). 3492 patches ship in the vendored tree.
4. Furnace instrument import family: wire existing `.fui` (store action has no caller) and add `.dmp .tfi .vgi .eif .s3i .sbi .opli .opni .y12 .ff .opm`. M. One importer set serves ~35 FM chips.
5. SoundFont `.sf2` for FluidSynth (UI + preset-name table) and `.sfz` through the drop handler. S-M. Instant general-purpose content.
6. Text/JSON dialects in one batch: Helm `.helm` (loader exists), Vital `.vital`, amsynth `.bank`, Geonkick `.gkick`, synthv1, Calf `presets.xml`, setBfree `.pgm`, Tunefish `tfN programs`. S each, M together. Vital needs the parameter-name table; others map to existing config/`NativePatch`.
7. ZynAddSubFX `.xmz/.xiz` (gunzip + existing XML path), Monique `.mlprog`, OB-Xf/OB-Xd `.fxp` (after reading `Utils.cpp:231-300` for the chunk body). M each.
8. Hardware sysex decoders into existing patch models: CZ-101 single/bank (small), D-50 (medium), VFX (medium). M each; only if the users own the hardware libraries.

## 6. Not worth importing

- ~130 tracker-replayer `*Synth` types (instrument is part of the song; song import covers it).
- Speech synths, TR-808/909/707/505 drum voices, Buzz machines, Tone.js-based generic synths (no interchange format).
- Sorcer, Tonewheel Organ, Melodica, Raffo, VL1 (no file format in the vendored sources).
- Odin2 `.odin` until a TS ValueTree decoder is justified (L; library is small).
- WaveSabre, Oidos, Aeolus (no libraries or niche formats).
- `gearmulator` synths until they are actually exposed as SynthTypes (not confirmed).
- WAM/AU/Kontakt state (the host owns it; `.nksf` already imported).
- Format guesses where the upstream source is not vendored: TAL `.fxp`, Dexed `.fxb` details, `.v2b`, Klystrack `.ki`. Read the upstream first.

## 7. Summary table

| Synth | Format | Ext | Existing support (Y/N + file:line) | Effort | Notes |
|---|---|---|---|---|---|
| DX7 / Dexed | 32-voice bulk, single voice | .syx | Y partial `dx7sysex.ts:119`, `DX7Controls.tsx:339`, `DexedHardwareUI.tsx:154`; single-voice N | S | Triplicated framer `DX7Synth.ts:144`, `DX7Controls.tsx:195`, `DexedHardwareUI.tsx:110` |
| Surge XT | VST2 program, "sub3" chunk | .fxp | N (WASM `SurgeWASM.cpp:176` ready; `VSTBridgeSynth.ts:301` no callers) | S | 3492 vendored patches |
| Vital | JSON | .vital | N (WASM loader absent `VitalWASM.cpp:158`) | M | Wavetable payload separate |
| Odin2 | JUCE ValueTree binary | .odin | N | L | Skip until demanded |
| Helm | JSON | .helm | Y partial `helmPresetLoader.ts`, `HelmHardwareUI.tsx:103,193` (Library path only) | S | No file picker |
| OB-Xf / OB-Xd | VST2 program set | .fxp / .fxb | N (45-value natives `oberheimPresets.ts:26`) | M | Read `Utils.cpp:231-300` first |
| Monique | XML attributes | .mlprog | N | M | Bank folders |
| amsynth | text bank | .bank | N | S | `PresetController.cpp:496` |
| synthv1 | XML | .synthv1 | N (natives only) | S | `synthv1_param.cpp:342` |
| Calf Monosynth | XML | presets.xml | Y bundled only (21) | S | User file path missing |
| TAL-NoiseMaker | unverified | .fxp? | Bundled 256 | - | Source not vendored |
| setBfree | text programme | .pgm | Y bundled only (128) | S | `pgm/default.pgm` |
| mda JX10/DX10/EPiano | float arrays | .fxp | Bundled tables | S | Low demand |
| ZynAddSubFX | gzip XML | .xmz .xiz | Y bundled plain XML only `ZynAddSubFXSynth.ts:472` | M | Gunzip then reuse |
| FluidSynth | SoundFont | .sf2 (.sf3) | Y engine only `FluidSynthSynth.ts:262`; no UI | S | Add preset name table |
| Sfizz | SFZ + samples | .sfz | Y `SfizzControls.tsx:87` | S | Route from drop handler |
| Furnace (FM+PSG chips) | Furnace instrument | .fui | Y parser `FurnaceParser.ts:28`; N caller `useInstrumentStore.ts:1914` | S | Export exists `FurnaceExporter.ts:1287` |
| Furnace FM | DMP/TFI/VGI/EIF/S3I/SBI/OPLI/OPNI/Y12/OPM/WOPL/WOPN/BNK/FF/GYB | many | N | M | List from `furnace gui.cpp:1994` |
| OPL3 | SBI/IBK/BNK/OPLI | .sbi etc | N | S | Same converter as Furnace OPL |
| Hively / AHX | instrument file `HVLI` / `THXI` | unverified | Y song-level `HivelyImportDialog.tsx:67`; standalone N | S | Ext unverified |
| SunVox | module / project | .sunsynth .sunvox | Y `UnifiedFileLoader.ts:95`, `SunVoxImportDialog.tsx:88` | - | Done |
| TB-303 / DB303 | XML preset; TD-3 seq | .xml .sqs .seq | Y `UnifiedFileLoader.ts:101`, `Db303PresetConverter.ts:12` | - | Done |
| Geonkick | JSON | .gkick | Y bundled only `GeonkickPresetLoader.ts:279` | S | User file path missing |
| CZ-101 | Casio sysex tone | .syx | N (model `CZ101Synth.ts:231`) | M | Format from memory [M] |
| D-50 | Roland sysex | .syx | N (model `D50Synth.ts:316`) | M | Needs ROM |
| VFX / Ensoniq | sysex | .syx | Raw passthrough `MAMEVFXVoiceMatrix.tsx:66` | M | Not a real decoder |
| V2 | patch / bank | .v2p .v2b | N | M | Unverified layout |
| Tunefish | text key;value | program*.txt | N (92 patches vendored) | S | Preset table in app unverified |
| Klystrack | instrument | .ki? | N | M | Unverified |
| NKS libraries | NI container | .nksf | Y `LoadPresetModal.tsx:724`, `usePresetStore.ts` | - | Server-side library route |
| DEViLBOX | native instrument | .dbi | Y `exporters.ts:408`, `UnifiedFileLoader.ts:143` | - | Universal container candidate |
| User preset set | JSON array | .json | Y `LoadPresetModal.tsx:314` | - | Needs payload union + attribution |

## 8. Unverified items and where I looked

- DX7 single-voice and CZ-101/D-50/VFX sysex layouts: from general knowledge; the repo has no decoders and I did not open a spec.
- Odin2 ValueTree byte layout; Vital `.vitalbank/.vitaltable` and inline wavetable encoding; Zynaddsubfx `.xmz` internals: upstream sources not in `third-party/` (checked `ls third-party`).
- OB-Xf chunk body format: only `Utils.cpp:231-273,350-361` skimmed.
- TAL-NoiseMaker, Dexed `.fxb`, `.v2b`, Klystrack `.ki`, HivelyTracker instrument extension: greps of `third-party/`, `src/engine/klystrack`, `src/engine/v2` returned nothing.
- Whether Surge `getChunk` is exposed by the WASM for export: not checked (`juce-wasm/surge/SurgeWASM.cpp` has only `loadPatch`).
- `gearmulator` synths exposure in the app: `categories.ts` mentions it; no matching SynthType in the union.
- Tunefish factory table presence in the app: not grepped.
- Counts were taken from the `SynthType` union (`base.ts`), key patterns in the 9 `synthCategories` files, the `SYNTH_LAYOUTS` object and the 9 VSTBridge descriptors; the Registry count is by `id:` per builtin file, so Furnace's loop-registered descriptors are not in it.
