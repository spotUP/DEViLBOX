# N14 result: format locks the instrument types

Status: implemented and tested; ledger row N14 left unticked (see open issues).

## Files changed
- src/lib/formats/EditableFormatRegistry.ts: `instruments.allowed` descriptor field, `setFormatInstruments`, `allowedSynthTypes`, `isSynthAllowed`, `formatDisplayName`, `lockFormatId` (songFormatId plus engine-field fallback for benDaglish, sawteeth, monotone).
- src/lib/formats/EditableFormatRegistry.builtins.ts: per-format sets (appended block).
- src/stores/useFormatStore.ts: `activeFormatId`, set in `applyEditorMode` (called by applySong), cleared in reset.
- src/stores/useInstrumentStore.ts: `synthRefusal`, gates in updateInstrument (type change), createInstrument, addInstrument, cloneInstrument, loadPreset, loadFurnaceInstrument, loadDefleMaskInstrument, transformInstrument. `loadInstruments`, `reset`, `revertToSample` ungated.
- src/bridge/handlers/writeHandlers.ts: create/update/clone_instrument return `{ ok:false, error }`.
- src/hooks/useAllowedSynthTypes.ts (new); CategorizedSynthSelector, SynthTypeSelector, EditorHeader disable disallowed types with a tooltip naming the format.
- Tests: src/lib/formats/__tests__/formatInstrumentSets.test.ts, src/stores/__tests__/formatLocksSynthTypes.test.ts.

## Allowed sets
All locked formats allow Sampler and Player, plus:
- Sample only: c67, chuckBiscuits, composer667, digiBoosterPro, digitalSymphony, dsm_dyn, iffSmus, ims, kris, mod, stp, tcbTracker, unic, xmf, amosMusicBank.
- gameMusicCreator +GmcWasmSynth; soundfx +SoundFxWasmSynth; activisionPro +ActivisionProWasmSynth; actionamics +ActionamicsWasmSynth; benDaglish +BenDaglishSynth; davidWhittaker +DavidWhittakerSynth, DavidWhittakerWasmSynth.
- deltaMusic1 +DeltaMusic1Synth, DeltaMusic1WasmSynth, Synth; deltaMusic2 +DeltaMusic2Synth, DeltaMusic2WasmSynth; digitalMugician +DigMugSynth, DigMugWasmSynth; digitalSonixChrome +SonixSynth; faceTheMusic +FaceTheMusicWasmSynth.
- fredEditor +FredSynth, FredReplayerWasmSynth2; futureComposer +FCSynth, FutureComposerWasmSynth; futurePlayer +FuturePlayerSynth; hippelCoSo +HippelCoSoSynth, HippelSynth; jochenHippelST +HippelStSynth, HippelSynth.
- inStereo2 +InStereo2Synth, InStereo2WasmSynth; jamCracker +JamCrackerSynth; monotone +MonotoneWasmSynth; musicAssembler +MusicAssemblerSynth; musicLine +MusicLineSynth; octamed_mmd0 and med_mmd0 +OctaMEDSynth.
- pumaTracker +PumaTrackerSynth; quadraComposer +QuadraComposerWasmSynth; robHubbard +RobHubbardSynth; sawteeth +SawteethSynth; sidmon1 +SidMon1Synth; sidMon2 +SidMonSynth, SidMon2Synth.
- sonicArranger +SonicArrangerSynth, SonicArrangerWasmSynth; soundControl +SoundControlWasmSynth; soundMon +SoundMonSynth, SoundMonWasmSynth, Synth; sunTronic +SunTronicSynth, Synth; tfmx +TFMXSynth, TFMXModuleSynth.
- Unlocked (unclassified): adplug, ansiMusic, earAche, nru, scumm, soundFactory, soundMaster, synthesis, zoundMonitor, Furnace and all non-New-Song formats.

## Tests (vitest, 2 workers, nice 19)
- formatInstrumentSets: pure functions plus every locked New Song template (except davidWhittaker) parses to instruments inside its set and resolves a lock id. 51 of 51 pass together with the reachability test.
- formatLocksSynthTypes (the one reachability test): parse protracker.mod, applyEditorMode, `activeFormatId` = mod, MCP createInstrument TB303 refused (ok false, count unchanged), store returns -1, Sampler accepted, reset unlocks. Pass.
- Existing: src/lib/formats/__tests__, src/bridge, instrument store tests: 37 files passed, 283 tests, no breakage.
- Revert check: `synthRefusal` forced to return null -> reachability test fails ("expected true to be false"); restored.
- `npm run type-check`: clean.

## Open issues
- Parsers emit generic `Synth` for deltaMusic1, soundMon, sunTronic templates; `Synth` is allowed there to match. Parsers should emit native types.
- Templates for benDaglish, sawteeth, monotone carry no layout; lock id comes from `lockFormatId` engine-field fallback (bdFileData, sawteethFileData, format MON). `octamed` parses as med_mmd0, so both ids are set.
- Unclassified formats listed above stay unlocked until their sets are verified.
- builtins file header says AUTO-GENERATED; no generator was checked. If one exists, move the block into it.
- Not UI-disabled (store gate refuses with a warning): LoadPresetModal, FurnacePresetBrowser, InstrumentList.tsx:96-104, EditInstrumentModal.tsx:187. LoadPresetModal NKS path may still stash preset data after a refused create.
- `addInstrument` callers (App.tsx:809, UnifiedFileLoader.ts:153/201/229) are now gated: a single dropped instrument file into a locked format is refused.
- davidWhittaker template not parsed in tests (WASM; other agents edit it); its set is untested against the fixture.
- Lock id is derived in applyEditorMode, not in startFormatSong; any load path bypassing applyEditorMode stays unlocked.
