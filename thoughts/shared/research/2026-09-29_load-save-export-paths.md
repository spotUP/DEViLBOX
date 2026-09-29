---
date: 2026-09-29
topic: Every path a song enters or leaves DEViLBOX - load, save, export
tags: [load, save, export, single-source-of-truth, format-store, editor-mode]
status: final
---

# Load / save / export paths

Owner (2026-09-29): "i have asked a million time for all load/save/exports to
use a single source of truth are we still not?" - **No.** A dragged
`micro15.mod` (ProTracker M.K.) opened in the AHX (`hively`) editor after an
AHX song; `get_song_info` reported `editorMode: "hively"` for a 4-channel MOD.

Counted from structure: every caller of the song-replacing store setters
`loadPatterns(` / `loadInstruments(` / `setPatternOrder(` / `applyEditorMode(` /
`setOriginalModuleData(` in `src/` (tests excluded), then each call site read
to classify it. Line numbers are at commit `60ba954c3`.

## Summary counts

| Category | Count |
|---|---|
| Hand-rolled FULL song-replace sequences (each calls the setters itself) | **25** |
| ...of which never call `applyEditorMode` (previous song's editor mode survives) | **7** |
| ...of which call `resetDubSends` | 1 (`importTrackerModule` only) |
| ...of which stop playback through `stopActivePlaybackForIncomingSong` | 2 functions (`importTrackerModule`, `loadSongFile`); App/MCP stop the transport by hand; the rest do not stop at all |
| Legit PARTIAL updates (append, subsong switch, engine re-read) | 10 |
| Project (.dbx / saved-project JSON) loaders, each applying separately | 6 |
| Project serializers ("the current song" -> JSON) | 2, with different field sets |
| Native-format export routers | 1 (`nativeExportRouter.exportNativeSong`), fed from 2 different sources |
| Other export builders reading stores directly | MCP `exportMod` (OpenMPT) |

## Defect found at the root: `applyEditorMode`'s classic branch keeps the old native data

`src/stores/useFormatStore.ts:962` `applyEditorMode`: every non-classic branch
calls `clearNative(state)` (`:342`, clears `furnaceNative`, `hivelyNative`,
`hivelyFileData`, `klysNative`, `sunTronicNative`, `musiclineFileData`,
`hivelyMeta`, subsongs, track tables...). The **classic** branch (`:1115-1116`)
only sets `state.editorMode = 'classic'` - so loading a MOD/XM/IT after an AHX
leaves `hivelyNative` / `hivelyFileData` from the AHX in the store. Anything
that decides by "is there hively data" (engine routing, views) still sees the
old song. This holds even on the paths that DO call `applyEditorMode`.

## Which path left micro15 in `hively` - UNVERIFIED

Drag-drop route (verified by reading): `GlobalDragDropHandler` ->
`App.handleFileDrop` (`src/App.tsx:870`) -> `loadFile(..., {requireConfirmation:
true})` returns `pending-import` (`UnifiedFileLoader.ts:1344`) ->
`setPendingModuleFile` -> Import Module dialog (`TrackerView` via
`useModuleImport`) -> `importTrackerModule` (`UnifiedFileLoader.ts:94`).

Inside `importTrackerModule` four of five branches call `applyEditorMode`
(which would set `classic`). The fifth - the libopenmpt-metadata fallback
(`:496-519`) - applies the song by hand and never calls it. Which branch this
MOD took was not measured (no browser, per the task). Candidates, most to least
likely: (1) the `:496-519` fallback; (2) a load path outside the loader (below);
(3) a late async write from the previous AHX load. The plan's reachability test
(load an AHX, then micro15, through the real loader, headless) settles it.

## Full song-replace sequences (25)

"Mode" = calls `applyEditorMode`. "Stop" = stops playback before replacing.
"Dub" = `resetDubSends`. "Auto" = resets automation. "Tempo" = sets BPM and speed.

| # | Where | Trigger | Mode | Stop | Dub | Auto | Tempo | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `UnifiedFileLoader.ts:176` | importTrackerModule, OpenMPT WASM branch | subset (`:184`, only linearPeriods + libopenmpt data) | yes | yes | yes | yes | |
| 2 | `UnifiedFileLoader.ts:377` | importTrackerModule, native TS parser (XM/MOD/FUR/DMF) | subset (`:389`) | yes | yes | yes | yes | |
| 3 | `UnifiedFileLoader.ts:441` | importTrackerModule, parseModuleToSong (UADE/exotic) | full song (`:456`) | yes | yes | yes | yes | |
| 4 | `UnifiedFileLoader.ts:477` | importTrackerModule, convertModule-empty fallback | full song (`:485`) | yes | yes | yes | yes | |
| 5 | `UnifiedFileLoader.ts:511` | importTrackerModule, libopenmpt metadata fallback | **NO** | yes | yes | yes | BPM 125 fixed, **no speed** | no originalModuleData reset either |
| 6 | `UnifiedFileLoader.ts:888` | loadSongFile `.dbx` | via `restoreNativeEngineData` (`:946`) | yes | no | yes | yes | restores dubBus/autoDub itself |
| 7 | `UnifiedFileLoader.ts:976` | loadSongFile `.mid` | **NO** | yes | no | yes | speed 6 | |
| 8 | `UnifiedFileLoader.ts:1273` | loadSongFile `.sunvox` (modules) | `{}` | yes | no | yes | BPM only | |
| 9 | `UnifiedFileLoader.ts:1325` | loadSongFile `.sunvox` (single) | `{}` | yes | no | yes | no | |
| 10 | `UnifiedFileLoader.ts:1600` | loadV2MFile | **NO** | no | no | no | BPM only | |
| 11 | `UnifiedFileLoader.ts:1781` | loadAdPlugFile editable | subset (`:1793`) | transport stop | no | yes | yes | |
| 12 | `UnifiedFileLoader.ts:1865` | loadAdPlugFile editable (companion prompt) | subset (`:1877`) | transport stop | no | yes | yes | duplicate of #11 |
| 13 | `App.tsx:1219` | File browser `onLoadTrackerModule` auto-import | full song (`:1224`) | transport stop + releaseAll | no | no | BPM only | its own copy of the import |
| 14 | `writeHandlers.ts:1126` | MCP load_file, DefleMask song | full song | transport stop | no | no | BPM only | |
| 15 | `writeHandlers.ts:1165` | MCP load_file, AdPlug parser | full song | transport stop | no | no | BPM only | |
| 16 | `writeHandlers.ts:1190` | MCP load_file, parseModuleToSong | full song | transport stop | no | no | BPM only | |
| 17 | `FT2Toolbar.tsx:914` | FT2 toolbar's own MIDI importer | **NO** | no | no | yes | yes | duplicate of #7 |
| 18 | `FT2Toolbar.tsx:949` | FT2 toolbar's own JSON project loader | **NO** | no | no | no | BPM only | duplicate of #6 |
| 19 | `useProjectPersistence.ts:641` | `applySavedProject` (boot restore, crash recovery) | via `restoreNativeEngineData` (`:683`) | no | no | ? | yes | |
| 20 | `useProjectPersistence.ts:864` | `loadProjectFromObject` | via `restoreNativeEngineData` (`:894`) | no | no | ? | yes | copy of #19 |
| 21 | `useProjectPersistence.ts:979` | `loadLocalRevision` (revision browser) | via `restoreNativeEngineData` (`:1009`) | no | no | ? | yes | copy of #19 |
| 22 | `useExportDialog.ts:318` | Export dialog's "import song" | **NO** | releaseAll | no | curves loaded | BPM only | |
| 23 | `SongSyncLayer.ts:55` | collaboration `full_sync` | **NO** | no | no | no | BPM only | also sets master FX |
| 24 | `useTabsStore.ts:120` | tab switch | `useFormatStore.reset()` (classic, cleared) | native engines stopped | no | curves loaded | BPM only | |
| 25 | `tourScript.ts:64` | guided tour load | full song (`:77`) | no | no | no | yes | also calls importTrackerModule (`:87`) |

(`?` = not visible in the function body; not verified further.)

GoatTracker (`UnifiedFileLoader.ts:727`) sets only its editor mode and keeps the
tracker stores by design (GT holds its own state) - counted as partial.

## Legit partial updates (10) - keep, but name them

| Where | What |
|---|---|
| `UnifiedFileLoader.ts:1073` | TD-3 pattern append |
| `UnifiedFileLoader.ts:1477` | DB303 XML pattern append |
| `FT2Toolbar.tsx:841` | FT2 toolbar XML (DB303) pattern append - duplicate of the line above |
| `FT2Toolbar.tsx:391-409` | order-list edits |
| `SubsongSelector.tsx:44` | Furnace subsong switch |
| `UADESubsongSelector.tsx:36` | UADE subsong switch |
| `TFMXView.tsx:159` | TFMX re-read after an edit |
| `UADEEngine.ts:898` | UADE pattern reconstruction |
| `UADEChipRAMPatternReader.ts:97` | UADE chip-RAM re-read |
| `useGTUltraEngineInit.ts:27` | GoatTracker instrument sync |

DJ decks (`DJTrackLoader.ts`, `DJUADEPrerender.ts`) parse with the shared
`parseModuleToSong` and never touch the main song stores - correct as is.
`SequencerEngine.loadPatterns` is an unrelated method of the acid sequencer.

## Project loaders (6) and serializers (2)

Loaders, each re-applying a saved project by hand: #6 (`.dbx` in
`loadSongFile`), #18 (FT2 JSON), #19-#21 (three copies in
`useProjectPersistence`), #22 (Export dialog `importSong`).

Serializers of "the current song":

| Function | Used by | Fields only it writes |
|---|---|---|
| `buildSavedProject` (`useProjectPersistence.ts:374`) | autosave, crash recovery, revisions, NavBar download (`serializeProjectToBlob`) | `performanceJournal`, `editorState` |
| `exportSong` (`lib/export/exporters.ts:295`) | FT2 toolbar Save (`.dbx` download), Export dialog | `automationCurves` (flat form), `restartPosition` |

Field comparison was by name inside each function body, not semantic; both
write metadata, bpm, patterns, order, instruments, native engine data/meta,
companion files, originalModuleData, dubBus, autoDub, master FX, mixer, send
buses, groove, speed, linear periods. A song saved through one and loaded
through a loader written for the other can lose the fields only one side has.

## Exports

- Native formats: ONE router, `nativeExportRouter.exportNativeSong`
  (`src/lib/export/nativeExportRouter.ts:104`), used by the Export dialog
  (`useExportDialog.ts:277`), MCP `export_native` (`writeHandlers.ts:2799`), the
  FT2 Save (`FT2Toolbar.tsx:292`) and MaxTrax (`MaxTraxView.tsx:63`). But its
  INPUT differs: the dialog and MCP pass `getTrackerReplayer().getSong()` (the
  song as last handed to the replayer); FT2 Save and MaxTrax pass `null`, and
  the router rebuilds from the stores. Whether the replayer's song tracks edits
  made since the last play was not verified.
- MCP `export_mod` (`writeHandlers.ts:2738`) builds its own song from the
  stores for the OpenMPT exporter.
- Audio (WAV/MP3/stems): render through transport playback (`captureLiveSong`
  -> `useTransportStore.play()`, commit cfa9b3908); not audited in detail here.

## Divergences worth naming

1. `applyEditorMode` classic branch keeps the previous song's native data (verified, `useFormatStore.ts:1115`).
2. 7 full replaces never set the editor mode: #5, #7, #10, #17, #18, #22, #23.
3. Dub sends reset on 1 of 25 paths - the 2026-09-22 "Dub Deck opens at the last song's levels" fix only covered `importTrackerModule`.
4. Duplicated importers: MIDI twice (#7, #17), `.dbx`/project JSON six times, AdPlug twice (#11, #12), module auto-import three times (App #13, MCP #14-#16, tour #25) beside `importTrackerModule`.
5. Two project serializers with different field sets.
6. Native export fed from two sources (replayer song vs stores).

## Open questions

- Which `importTrackerModule` branch micro15 took (settled by the plan's P0 test).
- Whether `getTrackerReplayer().getSong()` reflects unsaved edits.
