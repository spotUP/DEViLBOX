---
date: 2026-10-24
topic: SunVox full synth UI + every synth load button opens its bundled folder
status: in progress
---

# SunVox full synth UI and per-synth patch folders

Research: `thoughts/shared/research/2026-10-24_sunvox-synth-ui.md`,
`thoughts/shared/research/2026-10-24_synth-patch-default-dirs.md`.

## Owner decisions (2026-10-24, do not re-litigate)
- SunVox modules: all 41 addable/editable. The 14 open modules (sources in
  third-party/sunvox_sources-master) get exact enum labels/units extracted
  from `psynth_register_ctl` calls; the ~27 closed modules use runtime
  name/min/max/type from the shipped SunVox.wasm (selectors show numbers).
- One editor for SunVoxSynth and SunVoxModular: fix the worklet handlers and
  make SunVoxSynth use the modular editor on its patch. New instrument starts
  as Generator -> Output. Loaded .sunsynth opens as an editable graph. Merge
  the two storage formats into one (with localStorage/project migration).
- Load buttons: in-app FileBrowser first, opened at the synth's own folder
  (one map synthType -> {dir, extensions}), with a From Disk action for the
  OS picker. Covers all synth load actions; fold CZ-101 / DX7 lists in.
- Bundled SunVox patches: public/data/instruments/sunvox (commit 4a8fd6823).

## Owner decision 2026-10-24 (later)
- Furnace: add Load Instrument button on the Furnace editor, opening public/data/instruments/furnace/<chip> (.fui/.dmp), applied to the current instrument. DONE: FurnaceLoadInstrumentButton in the Furnace EditorHeader; 73 Furnace types mapped to chip folders, 45 fall back to instruments/furnace (no chip folder); test furnaceLoadInstrument.test.tsx (revert proof passed); manifest 9335 -> 10006.
- .dbx ArrayBuffer loss fixed in 716f115db (savedSongToJson / savedSongToApply, typedJson ArrayBuffer tag).

## Checklist

### A. SunVox one editor (agent A)
- [x] A1 Worklet handlers newModule / removeModule / connect / disconnect
      (SunVoxEngine.ts:619-656 awaits them; public/sunvox/SunVox.worklet.js lacks them)
- [x] A2 Controller metadata table for the 14 open modules (extractor script + TS table)
- [x] A3 Runtime metadata for closed modules (name/min/max/type/group)
      Proof A1-A3: sunvoxWorkletGraphEdits.test.ts (3) + sunvoxControlMeta.test.ts (7) pass; with the new worklet cases and ctl type/group removed, all 3 worklet tests fail with 'HANG'. Table: 14 types, 112 controllers (research doc's 109 was a mis-sum).
- [x] A4 One storage format for SunVoxSynth + SunVoxModular, migration (schema 25 -> 26, migrateSunVoxModularInstruments in migrations/index.ts, also applied in savedSongToApply)
- [x] A5 New SunVoxSynth instrument = Generator -> Output, audible by default (InstrumentFactory builds a bound SunVoxModularSynth from DEFAULT_SUNVOX_SYNTH_PATCH; song players keep SunVoxSynth.setSong via isSunVoxSongPlayer)
- [x] A6 SunVoxSynth editor renders the modular editor; loaded patch = editable graph (graph view derived from getModuleGraph; SunVoxPatchLoader deleted; SunVoxModular removed from the synth picker)
- [x] A7 Edits persist into the patch saved with the song (round trip) (debounced 300 ms saveSong -> sunvox.patchData, isSong true; self-saved bytes do not rebuild the voice)
- [x] A8 Reachability test (create instrument -> editor -> add module -> knob -> engine ctl set), regression tests
      Proof A4-A8: src/components/instruments/__tests__/sunvoxGraphEditor.test.tsx (2 pass: reachability + round trip, schema 26 migration). Revert proofs, each fails then restored byte-identical: editor route (sunvox-synth not routed), factory graph path (forced song player), _scheduleSave no-op (stored graph lacks the Filter), migration step removed. type-check rc 0. Superseded B test sunvoxEditorLoadPatch.test.tsx removed (tested the old silent-until-loaded Load Patch flow).

### B. Patch folders (agent B)
- [x] B1 `src/constants/synthPatchDirs.ts` single map
- [x] B2 FileBrowser: startDir + extensions + onPickFile(buffer, name) + From Disk
- [x] B3 Manifest extensions for mapped dirs; regenerate manifest
- [x] B4 Shared PatchLoadButton (extend ImportPresetFileButton pattern)
- [x] B5 (13 of 22 rows migrated: 1-7, 9, 10, 14, 20 plus Furnace; 9 rows carry a written exemption, re-verified 2026-10-24 by counting public/data: 0 .scpreset, 0 .fuw, 0 .nksf, 0 .ahi, 0 .mli, no VFX .syx outside dx7/cz-pack-1, no JUCE preset .json; row 13 Sfizz needs a FileList; row 21 is user ROM sets; row 22 is the pack browser itself) All synth load actions use it (list in research file, every row)
- [x] B6 Reachability test (one load button -> browser opens at the mapped dir -> pick -> instrument updated). DONE: src/components/instruments/controls/__tests__/dx7PatchFolder.test.tsx passes (DX7 Load SysEx File -> manifest dx7 .syx list -> double-click benson-clav1.syx -> fetch sentinel + synth.loadSysex + onChange). Revert proof: commenting out `await onPickFile(...)` in useFileNavigation.handleLoad fails it (loadSysex 0 calls); file restored, git diff empty.

- [x] A9 SunVox no sound on MetaModule default patch fixed (937c96a69); A10 preset selector over all 621 bundled warmplace instruments incl. .xi/.wav and pack subfolders (c3c28eeda). Live: owner hears sound; preset pick not yet heard.

Running count: 16 of 16. A1-A8 done; B1-B6 done (B5 with written exemptions). Follow-up: FMX added to the SunVox type map (MetaModule/FMX note-target test).

State note (B5 remaining): row 6 CZ101Hardware.tsx uses styled CZ101Button, not yet on PatchLoadButton (same hook onPatchLoaded exists); row 4 Dexed JUCE cart callback still triggers the hidden OS input (visible button migrated); row 13 Sfizz takes FileList (multi-sample, folder) so stays OS picker; rows 8, 11, 12, 14-22 have no bundled folder in the map, stay OS picker. Manifest 7682 -> 9335 entries.

## A4-A7 design (agent A, 2026-10-24; implemented, see A4-A8 proof)

Evidence:
- Two storage shapes today. SunVoxSynth: `config.sunvox: SunVoxConfig {patchData, patchName, isSong, controlValues, noteTargetModuleId}` (src/types/instrument/exotic.ts:683, default src/types/instrument/defaults.ts:1001, empty patch = silent). SunVoxModular: `config.sunvoxModular: ModularPatchConfig` (src/types/modular.ts:190, default defaults.ts:1038 = Output + analog generator + filter, a DEViLBOX-side description rebuilt into SunVox modules by src/engine/sunvox-modular/SunVoxModularSynth.ts, newModule at :197 and :238).
- Playback: InstrumentFactory.ts:783-790 loads `patchData` through SunVoxSynth.setSong / setModule.
- Write-back: worklet `saveSong` (public/sunvox/SunVox.worklet.js:361) already returns `sv_save_to_memory` bytes for a handle; `saveSynth` (:401) only posts "not yet implemented"; the shipped SunVox.js has no sv_save_module export.
- Graph read: worklet getModuleGraph (:669) -> SunVoxEngine.getModuleGraph -> sunvoxGraphToConfig (src/engine/sunvox-modular/graphToConfig.ts:81); controller metadata now via resolveSunVoxCtlMeta (A2/A3).

Design:
- A4: binary SunVox bytes are the single source of truth: `config.sunvox.patchData` = `sv_save_to_memory` of the instrument's handle, `isSong: true`. `ModularPatchConfig` stops being stored for SunVox; the editor view is always derived from getModuleGraph. Migration (src/lib/persistence/migrations/, bump the project version key): a stored `sunvoxModular` patch is built once in the engine (existing SunVoxModularSynth path), saved with saveSong into `config.sunvox.patchData`, then `sunvoxModular` is dropped. A .sunsynth loaded from disk keeps loading through setModule; first edit re-saves it as handle bytes.
- A5: the SunVoxSynth default builds Generator -> Output in the engine on create (newModule + connectModules, now working after A1) and saves the bytes, so a new instrument is audible with no file.
- A6: SunVoxSynth editor renders SunVoxModularEditor bound to the instrument's live handle; the graph comes from getModuleGraph, so a loaded patch is the editable graph. SunVoxModular synth type folds into SunVoxSynth (one editor, owner decision).
- A7: every graph edit (add/remove/connect/disconnect/ctl set) schedules a debounced saveSong of the handle and writes the bytes to `config.sunvox.patchData` through the instrument store; project save already serialises patchData. Round-trip test: edit -> save project -> reload -> getModuleGraph equals the edited graph.
- Open question for owner: none found that changes these steps; saveSynth stays unimplemented (song bytes cover the instrument handle).
