---
date: 2026-09-29
topic: One song-load path and one song-snapshot path for every load, save and export
tags: [load, save, export, single-source-of-truth, refactor]
status: draft
---

# One load path, one snapshot path

Research: `thoughts/shared/research/2026-09-29_load-save-export-paths.md`
(25 hand-rolled full song replaces, 7 of them never set the editor mode; 6
project loaders; 2 project serializers).

## The invariant

A song enters the app through exactly one function, and "the current song"
leaves it through exactly one snapshot. Loaders differ only in how they PARSE;
exporters differ only in how they ENCODE.

```
parse (per format)  ─┐                           ┌─> buildSavedProject (autosave/recovery/revisions)
parse (.dbx/JSON)   ─┼─> applySong(song, source) │
parse (MIDI, V2M..) ─┘     stores = the song ──> snapshotSong() ─┼─> .dbx download / Export dialog
                                                  ├─> tabs, collaboration full_sync
                                                  └─> native / MOD / audio export input
```

## Design

### D1 `applySong(song: LoadedSong, source: SongSource, opts?)` - `src/lib/song/applySong.ts`

The only caller of the song-replacing setters. In order:
1. `stopActivePlaybackForIncomingSong` (moved from `UnifiedFileLoader.ts:66`), native engines stopped.
2. Reset: transport, automation, instruments (`disposeAllInstruments`), tracker, dub sends, automation capture.
3. `applyEditorMode(song)` with the WHOLE song (never a hand-picked subset: branches #1, #2, #11, #12 pass subsets today).
4. Instruments (`skipPreload`), patterns, current pattern 0, order, originalModuleData (or null), BPM, speed, groove, metadata.
5. Project extras when the source is a saved project: automation curves, dub bus, auto dub, master FX, mixer, send buses, native engine data (`restoreNativeEngineData`), replaced instruments.
6. Preload when needed; post-load hooks (Modland hash check, classifier/auto-name, `clearExplicitlySaved`, isDirty false, undo history cleared).

`LoadedSong` = `TrackerSong` plus the optional project fields (one type, from
`SavedProject` and `SongExport`, see D3). `SongSource` = `'import' | 'project' |
'recovery' | 'revision' | 'tab' | 'sync' | 'tour' | 'mcp'` - for logs and the
few source-specific choices (recovery keeps the recovery prompt state).

### D2 `applyEditorMode` classic branch clears native data

`useFormatStore.ts:1115`: the classic branch calls `clearNative(state)` like
every other branch. Fix at the root; D1 relies on it.

### D3 `snapshotSong(): SongSnapshot` - `src/lib/song/snapshotSong.ts`

The one reader of "the current song" from the stores; the union of what
`buildSavedProject` and `exportSong` write today (performanceJournal,
editorState, automationCurves, restartPosition included). `buildSavedProject`,
`exportSong`, tab save, `SongSyncLayer` full_sync send and the native-export
router's store rebuild all call it. One parser (`parseSavedSong`) reads both
file shapes back into `LoadedSong` for D1.

### D4 Native export input

`exportNativeSong` takes its song from `snapshotSong()` when the caller has no
parsed song of its own, and the Export dialog and MCP `export_native` stop
passing `getTrackerReplayer().getSong()` unless P5's check shows the replayer
song always equals the stores (then either is fine; pick the stores, the
editable truth).

## Phases (ordered by risk; each ends green on type-check + its tests)

### P0 - Tests first (must FAIL on today's code)
- **L0.1** Reachability, headless, through the real loader: load `public/data/songs/ahx/<an .ahx>` then `src/__tests__/fixtures/micro15-goto80.mod` through `loadFile` + `importTrackerModule` (engine mocked at the ToneEngine boundary only); assert `editorMode === 'classic'`, `hivelyNative === null`, `hivelyFileData === null`. File: `src/lib/file/__tests__/modAfterAhxIsClassic.test.ts`. Also logs which branch ran (answers the research's open question).
- **L0.2** Unit: `applyEditorMode({})` after an AHX clears every native field (`useFormatStore` test).
- **L0.3** Round-trip: `snapshotSong()` -> `parseSavedSong()` -> `applySong()` -> `snapshotSong()` is equal (fields from both serializers).

### P1 - Core (low risk, additive)
- **L1.1** D2 in `src/stores/useFormatStore.ts`.
- **L1.2** `src/lib/song/applySong.ts` (D1) + `LoadedSong`/`SongSource` types.
- **L1.3** `src/lib/song/snapshotSong.ts` + `parseSavedSong` (D3).

### P2 - Import paths in `src/lib/file/UnifiedFileLoader.ts`
- **L2.1** `importTrackerModule` branches #1-#5 -> build `LoadedSong`, call `applySong`. Removes the #5 fallback's hand-apply (the micro15 class).
- **L2.2** `loadSongFile`: `.dbx` #6, MIDI #7, SunVox #8/#9 -> `applySong`.
- **L2.3** `loadV2MFile` #10, `loadAdPlugFile` #11/#12 (merge the duplicate) -> `applySong`.

### P3 - Duplicate importers outside the loader
- **L3.1** `src/App.tsx:1194-1235` file-browser auto-import #13 -> `loadFile` + `importTrackerModule` (the dialog-free option), no local apply.
- **L3.2** `src/bridge/handlers/writeHandlers.ts` MCP load_file #14-#16 -> same.
- **L3.3** `src/engine/tour/tourScript.ts` #25 -> same.
- **L3.4** `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` own MIDI #17 and JSON #18 importers deleted; the toolbar's Load calls `loadFile`. Its XML append (`:841`) calls the loader's DB303 append.

### P4 - Project loaders and restores
- **L4.1** `src/hooks/useProjectPersistence.ts` `applySavedProject` #19, `loadProjectFromObject` #20, `loadLocalRevision` #21 -> `parseSavedSong` + `applySong(source)`; the three copies collapse into one.
- **L4.2** `src/hooks/dialogs/useExportDialog.ts:305-330` import #22 -> `loadFile`.
- **L4.3** `src/stores/useTabsStore.ts:120` #24 and `src/lib/collaboration/SongSyncLayer.ts:55` #23 -> `applySong(snapshot, 'tab' | 'sync')`; their SAVE side -> `snapshotSong()`.

### P5 - Save and export
- **L5.1** `buildSavedProject` and `exportSong` become thin wrappers over `snapshotSong()` (envelope/version only).
- **L5.2** Measure whether `getTrackerReplayer().getSong()` equals the store snapshot after an edit; apply D4.
- **L5.3** MCP `exportMod` (`writeHandlers.ts:2738`) takes `snapshotSong()`.

### P6 - Guard
- **L6.1** Contract test `src/lib/song/__tests__/singleLoadPath.contract.test.ts`: scans `src/` for `loadPatterns(`, `loadInstruments(`, `setPatternOrder(`, `applyEditorMode(`, `setOriginalModuleData(` outside `src/lib/song/applySong.ts`; an allowlist names each legit partial update with its reason (the 10 in the research). A new song-replace path fails CI.
- **L6.2** Same for serializers: no module outside `snapshotSong.ts` reads `useTrackerStore.getState().patterns` + `useInstrumentStore.getState().instruments` together to build a song (allowlist for the live editors).
- **L6.3** Wire L0.1-L0.3, L6.1, L6.2 into `test:ci` (package.json).

## Verification

Automated (per phase): `npm run type-check`; the P0 tests; the existing loader
contract tests (`src/lib/file/__tests__/*`, `nativeEngineRoundtrip.test.ts`,
`useFormatStore.sunTronicSongData.test.ts`); L6 guards.

Manual (owner, at http://localhost:5174, after P2 and after P4):
1. Play an AHX, then drag `micro15.mod` in: classic pattern editor, MOD plays.
2. Drag a `.dbx` saved before the change: same song, dub bus and master FX restored.
3. Crash-recovery restore and the revision browser restore the same song.
4. Export dialog native export of an edited song contains the edit.

## Success criteria

- Full song-replace sequences outside `applySong`: 25 -> 0 (L6.1 enforces).
- Paths that skip the editor mode: 7 -> 0; that skip dub-send reset: 24 -> 0.
- Project serializers: 2 -> 1 (`snapshotSong`); project loaders: 6 -> 1 (`parseSavedSong` + `applySong`).
- L0.1 passes: MOD after AHX is `classic` with no native data.

## Checklist

- [x] L0.1 [x] L0.2 [ ] L0.3
- [x] L1.1 [x] L1.2 [ ] L1.3
- [x] L2.1 [x] L2.2 [x] L2.3
- [x] L3.1 [x] L3.2 [x] L3.3 [x] L3.4
- [x] L4.1 [ ] L4.2 [ ] L4.3
- [ ] L5.1 [ ] L5.2 [ ] L5.3
- [ ] L6.1 [ ] L6.2 [ ] L6.3

## Owner questions

1. Loading a song: should it also reset the master FX chain and dub bus to
   defaults, or keep the user's current master chain across songs (today it
   depends on the path)? Recommended: keep the master chain (it is a
   performance setup), reset per-song state (dub sends, automation) - unless
   the loaded file is a saved project that carries its own.
2. Undo history across a load: cleared (recommended - undoing into the
   previous song is not meaningful) or kept?

## Decisions (2026-09-29, owner said "proceed" with the questions open - recommendations taken)

- Q1: a load KEEPS the master FX chain; per-song state (dub sends, automation,
  channel settings) resets; a saved project restores its own master chain.
- Q2: a load CLEARS undo history.

## Progress

- 2026-09-29: L0.1, L0.2, L1.1, L1.2, L2.1 done (5 of 22). applySong at
  src/lib/song/applySong.ts; importTrackerModule's five branches only parse now.
  L0.1 runs the real importTrackerModule headless (dialog-shaped ModuleInfo:
  the libopenmpt metadata worklet cannot run in node; OpenMPT WASM fails and
  falls back to the native parser, as it would on a real failure). Reverting
  the classic-branch clearNative makes it fail (hivelyNative left behind) -
  the likely real cause of the owner's AHX layout, since something downstream
  derives the editor from hivelyNative. preloadRace.contract re-pointed to
  scan applySong.ts as well.
- L4.1 done + the .dbx branch of L2.2 + the parse half of L1.3: savedSongToApply
  (src/lib/song/savedSong.ts) reads both saved shapes (SavedProject and .dbx
  SongExport); applySong gained ProjectExtras (automation, master chain, groove,
  mixer, dub bus, Auto Dub, journal, hybrid instruments). The three persistence
  restores and the .dbx branch are parse -> applySong. restoreNativeEngineData
  became the pure decodeNativeEngineFields (it returned early without native
  data, so projects never reset the editor mode). Found and fixed on the way:
  .dbx never restored mixer or hybrid instruments; a revision never ran the
  schema migration it now runs when needed. applySavedProject is async now.
  Test savedProjectAfterAhx (fails on the old code: 'hively'). 6 of 22.
- L2.2 done: loadSongFile's .dbx, MIDI and both SunVox branches -> applySong.
  SunVox builds its instruments with the extracted pure buildInstrumentConfig
  (was createInstrument into the store, then patterns by hand; the
  mono-synth list is shared now instead of duplicated). The up-front reset
  moved into the TD-3 branch, the one path left that manages the stores
  itself (pattern import: replace or append - allowlist candidate for L6.1,
  with GoatTracker, whose engine holds its own song). applySong now waits for
  loadInstruments' queued store write before loading patterns (the MIDI
  branch's setTimeout(0) workaround, made a guarantee for every load).
  8 of 22.
- L2.3 done: V2M and AdPlug (both copies, merged into applyAdPlugSong) ->
  applySong. applySong gained `preload: false` (AdPlug: the OPL3 synth is
  created at play; creating it during the drop is an audible transient).
  Found: the V2M import reset nothing and stacked its instruments on the
  previous song's (test: 16 instead of 11 on the old code). The file loader
  now calls loadPatterns only for the TD-3 import and the DB303 pattern
  append (partial updates). 9 of 22.
- P3 done (L3.1-L3.4). New: prepareModuleImport (src/lib/import) - how a
  module is READ for import (UADE pre-scan / native header / libopenmpt),
  extracted from ImportModuleDialog; importModuleFile = prepare + import, the
  dialog-free import used by the App file browser, MCP load_file and the tour.
  importTrackerModule gained a branch for an already-parsed DefleMask song
  (MCP's loadModuleFile hands one back). The tour's hand-written "clear the
  previous AHX" workaround is gone. FT2Toolbar's file-browser handler (its own
  DB303 XML / MIDI / JSON importers) is loadFile now. applySong records the
  song name on harvested presets for every load (was only the App path).
  The header-detected (extensionless) import keeps its explicit ModuleInfo:
  its name says nothing, so name-based preparation cannot read it. 13 of 22.
