---
date: 2026-10-24
topic: Default directory for loading patches/sysex/instruments per synth
status: research
---

# Synth patch load actions and default directories

## 1. In-app browser of bundled files
- Listing layer: `src/lib/serverFS.ts` (`listManifestDirectory(dir)` :51 reads `@generated/file-manifest.json`; `listServerDirectory` :102; `readStaticFile` :193; `readServerFile` :154).
- UI: `src/components/dialogs/FileBrowser.tsx` (props :18-27: isOpen, onClose, onLoad, onLoadTrackerModule, mode, currentProjectData, suggestedFilename) + `useFileNavigation.ts` (listing :368/:382, read :612-:679) + `fileBrowserMemory.ts` (remembers `currentPath`, key `dvbx_file_browser_memory_v1`).
- NO start-dir prop. Start dir comes only from remembered `currentPath`. It is song/project oriented (onLoad gives project object or tracker module buffer); it has no "return raw bytes to a caller" path.
- Callers: App.tsx:1073 (via `useUIStore.showFileBrowser`, useUIStore.ts:260/859), FT2Toolbar.tsx:743 (local state). Both open at the remembered path; none pass a dir. Other lister: `lib/import/companionFetch.ts:110` (companion files, not UI). Other separate browsers with their own lists (not manifest): DJFileBrowser, FurnacePresetBrowser, KontaktInstrumentBrowser, SamplePackBrowser, LoadPresetModal, CZ101PatchBrowser, DX7 library (`engine/dx7/dx7Library.ts` fetchDX7LibraryManifest).

## 2. Load actions in synth/instrument editors (count)
Method: `grep -rn 'type="file"\|type = .file.' src` (*.ts/tsx, tests excluded) = 56 hits; each opened and classified. `.click()` on refs checked for DX7/Dexed/CZ/Sfizz. NONE of them opens the in-app browser; every one is an OS picker only (0 of N use FileBrowser). Synth/instrument-specific patch/sysex/instrument/sample loaders (22 distinct actions):

| # | file:line | synth | accept |
|---|---|---|---|
| 1 [DONE] | instruments/SunVoxPatchLoader.tsx:43 (used SynthTypeDispatcher.tsx:3945) | SunVox | .sunsynth (sunvoxPatchConfig.ts:8) |
| 2 [DONE] | instruments/SunVoxImportDialog.tsx:78 (TrackerView.tsx:785) | SunVox new inst | .sunsynth |
| 3 [DONE] | synths/modular/SunVoxModularEditor.tsx:110 (dynamic input) | SunVox modular | .sunsynth |
| 4 [DONE incl. JUCE cart callback via usePatchPicker('DX7'); Dexed is not a SynthType, DexedHardwareUI serves DX7] | hardware/DexedHardwareUI.tsx:498 (.click :363,:485) | Dexed/DX7 | .syx |
| 5 [DONE] | controls/DX7Controls.tsx:228 (.click :223) | DX7 | .syx |
| 6 [DONE: usePatchPicker from the styled CZ101Button; multi-file stays via drag-drop] | hardware/CZ101Hardware.tsx:198 (.click :193) | CZ-101 | .syx multi |
| 7 [DONE] | controls/CZ101PatchBrowser.tsx:152 (.click :136) | CZ-101 | .syx multi |
| 8 [OS picker only: no bundled folder / not migrated] | controls/MAMEVFXVoiceMatrix.tsx:91 | MAME VFX | .syx |
| 9 [DONE] | controls/ImportPresetFileButton.tsx:35 via Vital :261 | Vital | .vital |
| 10 [DONE] | same via Odin2Controls.tsx:284 | Odin2 | .odin |
| 11 [OS picker only: no bundled folder / not migrated] | presets/LoadPresetModal.tsx:724 | JUCE/VST presets | .json |
| 12 [OS picker only: no bundled folder / not migrated] | presets/LoadPresetModal.tsx:731 | NI presets | .nksf |
| 13 [OS picker only: .sfz needs its sample files together (FileList), single-file pick cannot load it] | controls/SfizzControls.tsx:87 (+folder :89, .click :71,:77) | Sfizz | .sfz,.wav,.flac,.ogg,.aiff,.aif ; folder |
| 14 [DONE: MAMECMI -> samples/packs/fairlight-cmi (.wav); cmi-disks holds disk images the loader cannot take] | controls/CMIControls.tsx:393 | Fairlight CMI | audio |
| 15 [OS picker only: no bundled wavetable folder] | editors/FurnaceEditor.tsx:634 | Furnace wavetable | .wav,.fuw |
| 16 [OS picker only: no bundled folder / not migrated] | editors/WavetableEditor.tsx:302 | Wavetable | .wav,.h,.fuw |
| 17 [OS picker only: no bundled folder / not migrated] | editors/jeskola/FMEditors.tsx:536 | Jeskola FM | .wav,.h |
| 18 [OS picker only: no bundled folder / not migrated] | instruments/SuperColliderEditor.tsx:1016 | SuperCollider | .scpreset |
| 19 [OS picker only: no bundled folder / not migrated] | instruments/InstrumentList.tsx:459 / :492 (dynamic) | AHX (.ahi) / MLI (.mli) | .ahi / .mli |
| 20 [DONE: PatchLoadButton HivelySynth -> songs/hivelytracker (.hvl/.ahx); the import takes a song, bundled songs exist] | instruments/HivelyImportDialog.tsx:67 | Hively | .hvl,.ahx |
| 21 [OS picker only: no bundled folder / not migrated] | controls/MAMEControls.tsx:128,:146; ChipSynthControls.tsx:503,:521; MAMERSAVoiceMatrix.tsx:92; hardware/ROMUploadPrompt.tsx:166; ui/RomUploadDialog.tsx:197 | MAME/chip ROM | .zip/.bin/.rom/.vsm (user ROM sets, not bundled-data patches) |
| 22 [OS picker only: SamplePackBrowser is itself the pack browser, SampleEditor has no single obvious folder] | SampleEditor.tsx:1612; SamplePackBrowser.tsx:720,727; AmigaPalModal.tsx:1031; midi/TD3PatternDialog.tsx:580 (.json,.sqs) | samples / TD-3 | audio, .zip, .json/.sqs |
Not synth-specific (excluded): ImportModule/Audio/Furnace/MIDI dialogs, DJ*, ExportDialog, FT2Toolbar:524, PadGrid:385, MIDIMapperModal:250, songBranches:942, useFileNavigation:536.
Count caveat: the 56 raw hits include ~15 non-instrument loaders; the table is a hand classification, so a few JSX inputs with unseen accept (CMIControls other inputs, ChipSynth) were not individually traced.

## 3. Correct bundled folder per synth
- SunVox -> public/data/instruments/sunvox/{instruments/<cat>,effects/<cat>} (763 .sunsynth)
- Furnace (+ FM chip editors) -> public/data/instruments/furnace/<chip> (.fui/.dmf/.dmp, tfi, opni, ...)
- DX7 / Dexed -> public/data/sysex/dx7 ; (ROMs public/roms/dx7)
- CZ-101 -> public/data/sysex/cz-pack-1
- Vital -> public/data/presets/vital ; Odin2 -> public/data/presets/odin2 (indexes: constants/vitalPresetIndex.ts, odin2PresetIndex.ts)
- Sfizz / SoundFont -> public/data/samples/sfz, public/data/presets/soundfonts
- Fairlight CMI -> public/data/cmi-disks (IIx Library.zip, SYSV19.IMD); samples public/data/samples/packs/fairlight-cmi
- Samples/drum machines -> public/data/samples/{packs,tr505,tr707}
- ROM synths (D50, MAME chips, VFX, GearMulator, etc.) -> public/roms/<chip> (user-uploaded ROMs)
- Tracker-format synths (AHX/Hively/MLI, SuperCollider .scpreset, TD-3, Jeskola FM, Wavetable): NO bundled folder (songs/ holds modules; `public/data/songs/*`). MAME VFX .syx: none (public/roms/vfx is ROM only).

## 4. Manifest extensions
`scripts/generate-file-manifest.js:17-29` EXTENSIONS = .dbx .dbi .json .xml, tracker module exts, .fur .fui, .mid .midi, .sqs .seq, .wav .mp3 .ogg .flac .aif .aiff. Missing: .sunsynth (763 files), .syx (266), .xi (65), .imd, .zip, .vital (228), .odin (319), .sfz (49), .sf2, .dmf/.dmp are in file-manifest only via tracker list? (.dmf 1810 present; .dmp 671 NOT in list), .tfi (39), .opni, .fuw, .hvl/.ahx, .nksf, .scpreset, .instr, .bin. Manifest count by ext: wav 4704, dmf 1810, fui 516, fur 452 (src/generated/file-manifest.json). So SunVox, sysex, XI and CMI disks are invisible to listManifestDirectory today. Large trees (instr 7111, ss 3475) are not patch-loader targets; adding all would bloat the manifest, so add per-dir.

## 5. Pattern to extend
- Reuse `FileBrowser` + `useFileNavigation` + `listManifestDirectory`/`readStaticFile`; add (a) `startDir` and `extensions` filter props, (b) an "onPickFile(buffer, filename)" raw-bytes mode (alongside onLoad), (c) per-call remembered path keyed by dir.
- Single source of truth for dir: new `src/constants/synthPatchDirs.ts` exporting `SYNTH_PATCH_DIRS: Partial<Record<SynthType, {dir, extensions}>>` (sunvox-synth -> instruments/sunvox, DX7/Dexed -> sysex/dx7, CZ101 -> sysex/cz-pack-1, vital/odin2 -> presets/..., furnace chips -> instruments/furnace/<chip>, CMI -> cmi-disks). Unlisted synths keep the OS picker. Then one shared `<PatchLoadButton synthType>` replaces the hidden-input pattern (precedent for sharing: `ImportPresetFileButton.tsx` already serves Vital and Odin2).
- Manifest: extend EXTENSIONS for listed dirs only; regenerate src/generated/file-manifest.json.
- Keep OS picker as a "From disk" tab inside the browser.

## Furnace instruments
No UI action loads a .fui/.dmp/.tfi/.opni file: useInstrumentStore.loadFurnaceInstrument/loadDefleMaskInstrument have no component caller (grep of src, tsx and ts); FurnaceEditor:634 is wavetable only; FurnacePresetBrowser has its own chip list. Nothing to migrate; adding a Furnace import button would be new scope (folders: data/instruments/furnace/<AY|C64|ESFM|GB|Lynx|NES|OPL|OPL3|OPLL|OPM|OPN|OPZ|SAA|SN7|TIA|VERA|VIC>).
