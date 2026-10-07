---
date: 2026-10-07
topic: load / save / export entry points, load-time breakdown, VU freeze on song switch (Batch U, U1)
tags: [load-path, save, export, companions, uade, vu-meters, performance, batch-u]
status: draft
---

# Load / save / export paths - U1 research

Owner, 2026-10-06/07: "why is the jukebox not using our primary loading path?
... i have asked you so many times to unify all loading saving export paths";
"when loading songs it feels like devilbox freeze for a while and then struggle
and finally play"; "vu meters gets frozen instead of cleared ... should a clear
song be sent properly before the next one is loaded?"

Line numbers at HEAD `7c264783b` (2026-10-07). Earlier audit:
`thoughts/shared/research/2026-09-29_load-save-export-paths.md` and plan
`2026-09-29-single-load-save-path.md` (23 of 23 done). That work unified the
APPLY and SNAPSHOT layers: `applySong` (src/lib/song/applySong.ts:155) is the
one song apply, `snapshotSong` the one save reader, `liveTrackerSong`
(src/lib/song/liveSong.ts) the one export input, guarded by
`src/lib/song/__tests__/singleLoadPath.contract.test.ts`. What is still forked
is everything IN FRONT of applySong: how a file is acquired, which companions
travel with it, which route reads it (dialog / headless / DJ), whether a
pre-scan runs, who stops the old song, and who starts the new one.

## How this was counted

From the call graph, not one spelling: every caller of `parseModuleToSong`,
`importTrackerModule`, `importModuleFile`, `prepareModuleImport`,
`UnifiedFileLoader.loadFile`, the bridge `loadFile`, `applySong`,
`addCompanionFile`, `downloadUADECompanions` / `gatherCompanions`, and every
consumer of the `'pending-import'` result (grep -w over `src/`, tests
excluded, each site read). MCP server tools were traced in
`server/src/mcp/mcpServer.ts` to the browser `load_file` dispatch
(`src/bridge/MCPBridge.ts:421`). Comments and type-only references removed.

## 1. Load entry points

### Summary per family

| Family | Entry points | Reaches applySong? | Notes |
|---|---|---|---|
| A. Interactive (dialog) | 8 | yes, via importTrackerModule | 4 ImportModuleDialog mounts (TrackerView x3, FT2Toolbar x1) |
| B. Headless (dialog bypass) | 6 | yes, via importModuleFile | bridge loadFile + its callers, tour, App file browser |
| C. Silently broken headless | 2 | NO for modules | embed, SID info dialog (HVSC) - drop `'pending-import'` |
| D. DJ decks | 22 call sites in 8 files | no (deck engine, by design) | each calls parseModuleToSong itself |
| E. Restore / project | 7 | yes | autosave/recovery, revisions, server project, tabs, sync, Export-dialog import, stored-bytes re-decode |
| F. Previews (audition, not a load) | 2 | no | write companions into the SHARED UADE FS |
| Companion writers outside the UADE engine | 5 (1 dead) | - | see section 1.G |
| Companion acquirers (network) | 9 files | - | downloadUADECompanions / gatherCompanions |

### A. Interactive - dialog in front (8)

1. Drag-drop: `App.handleFileDrop` (src/App.tsx:823) -> `loadFile(file, {requireConfirmation: true, companionFiles})` (App.tsx:870) -> `'pending-import'` -> `setPendingModuleFile` (App.tsx:873) -> ImportModuleDialog in TrackerView.
2. `.dbx` preview dialog -> `App.loadSongFile` (App.tsx:807) -> loadFile.
3. App FileBrowser `onLoad` (projects, App.tsx:1183) -> loadFile.
4. TD-3 dialog `onImport` (App.tsx:1272) and instrument preview (App.tsx:1260) -> loadFile (partial updates, not song opens).
5. TrackerView ImportModuleDialog mounts (src/components/tracker/TrackerView.tsx:774, :781, :788) -> `useModuleImport.handleModuleImport` (src/hooks/tracker/useModuleImport.ts:39) -> `importTrackerModule` (src/lib/file/UnifiedFileLoader.ts:91).
6. FT2Toolbar FileBrowser `onLoad` (src/components/tracker/FT2Toolbar/FT2Toolbar.tsx:720) -> loadFile.
7. FT2Toolbar FileBrowser `onLoadTrackerModule` (FT2Toolbar.tsx:727) -> loadFile -> its OWN ImportModuleDialog (FT2Toolbar.tsx:704).
8. HVSC/Modland panels inside FileBrowser (`FilePreviewPanel.handleModlandLoad` :127, `useFileNavigation` :139/:172/:511/:534/:588/:641) -> `onLoadTrackerModule` of whichever parent mounted the FileBrowser (App or FT2Toolbar).

What only this family does: `prepareModuleImport` with progress hooks and a
cancellable UADE scan (ImportModuleDialog.tsx:157); the user picks subsong and
"use libopenmpt"; `handleImport` WRITES SETTINGS as a side effect
(`setFormatEngine(nativeFmt.key, 'native')`, `setFormatEngine('uade','enhanced')`,
ImportModuleDialog.tsx:186-190) - so a dialog import changes how every later
headless load routes. Companions are re-keyed with `companionRelativeName`.
No playback start.

Divergence inside the family: the App file browser (3/8) BYPASSES the dialog
(App.tsx:1198-1202 -> importModuleFile) while the FT2Toolbar file browser (7)
SHOWS it. Same panel, two behaviours depending on which button opened it.

### B. Headless - dialog bypassed (6)

1. Bridge `loadFile` (src/bridge/handlers/writeHandlers.ts:1602): base64 decode
   of file + companions (:1612-1630), `UnifiedFileLoader.loadFile` (:1645), on
   `'pending-import'` -> `importModuleFile` (:1666), then reads stores back for
   the reply. Callers:
   - MCP `load_file`, `load_modland`, `load_hvsc`, `play_fur`
     (server/src/mcp/mcpServer.ts:1568, :1859, :1973, :2427 -> MCPBridge.ts:421).
   - Jukebox `loadAndPlay` (src/components/jukebox/JukeboxPanel.tsx:238): the
     bytes are base64-ENCODED on the main thread (:226-231) only to be decoded
     again by the handler; then `playHeadless({mode:'song'})` (:257); then it
     closes dialogs on three timers (:263-270).
2. Tour `loadFile` (src/engine/tour/tourScript.ts:43-46) -> loadFile -> importModuleFile.
3. App FileBrowser `onLoadTrackerModule` (App.tsx:1198) -> loadFile -> importModuleFile.
4. Header-detected extensionless files (UnifiedFileLoader.ts:928-948) -> importTrackerModule with a hand-built ModuleInfo.
5. `importModuleFile` itself (UnifiedFileLoader.ts:185): prepareModuleImport (no hooks) + importTrackerModule with `useLibopenmpt: true`.
6. Song-format branches inside `loadSongFile` (UnifiedFileLoader.ts:352) that never reach the dialog: GoatTracker (:370), SunVox (:414, :683 - also forces `setActiveView('tracker')` + `setTrackerViewMode('sunvox')`, :859/:911), `.dbx` (:527), MIDI (:545), V2M (:1137), AdPlug (:1269). Each calls applySong itself (fine) but runs its own stop (`stopActivePlaybackForIncomingSong`, :63) BEFORE parse, unlike module imports, which stop inside applySong after parse.

### C. Headless callers that silently load nothing (2) - defect

`UnifiedFileLoader.loadFile` returns `{success: 'pending-import'}` for every
registered module (UnifiedFileLoader.ts:921). Two callers only handle `true`
and `false`:

- Embed `LOAD_FILE` (src/components/embed/PatternEditorEmbed.tsx:143).
- SID info dialog "load tune" from HVSC (src/hooks/dialogs/useSIDInfoDialog.ts:89): `.sid` is a registered format (FormatRegistry.ts:1673), so it returns `'pending-import'`; no toast, no load, the dialog stays open.

VERIFIED from code only (return type + registry); not reproduced live (no
browser tab opened, per instruction). This is exactly the class of bug the
tri-state `loadFile` result creates.

### D. DJ (22 sites, 8 files)

`parseModuleToSong` called directly, result handed to a deck engine (not
applySong - by design, a deck is not the editor song):
DJFileBrowser.tsx:71; DJView.tsx:364; DJDeck.tsx:370; DJPlaylistModal.tsx:1757, :1887, :1952, :1992, :2033, :2275; DJModlandBrowser.tsx:398, :562; DJPlaylistPanel.tsx:713, :872, :897, :1011; DJUADEPrerender.ts:80; DJTrackLoader.ts:204, :279, :323, :452, :542, :591.

What only DJ does: audio files go to DeckAudioPlayer; UADE songs are
pre-rendered to PCM in `src/workers/dj-render.worker.ts` (an independent
UADE + libopenmpt instance OFF the audio thread - the one existing precedent
for the U2 worker); companions fetched per site (DJTrackLoader.ts:183/:439,
DJPlaylistModal.tsx:1866, DJPlaylistPanel.tsx:856, DJModlandBrowser.tsx:365/:559)
and only 2 of the 22 sites pass companions to the parse
(DJModlandBrowser.tsx:398/:562) - the other 20 parse with none.

### E. Restore / project (7)

All parse -> `applySong` already (2026-09-29 work):
`applySavedProject` (src/hooks/useProjectPersistence.ts:439; boot restore and
crash recovery), `loadProjectFromObject` (:578; useFileNavigation.ts:467,
serverFilesApi.ts:230), `loadLocalRevision` (:612), `restoreFromStoredBytes`
(src/lib/song/restoreFromStoredBytes.ts:72 - re-parses stored module bytes
via parseModuleToSong with stored companions), tabs (src/stores/useTabsStore.ts:60),
collaboration full_sync (src/lib/collaboration/SongSyncLayer.ts:40),
Export-dialog song import (src/hooks/dialogs/useExportDialog.ts:286).
These are fine at the apply level; none goes through an unload step beyond
applySong's `stopOutgoingSong`.

### F. Previews (2) - audition, but they touch the song's engine

- `FilePreviewPanel` UADE preview (src/components/dialogs/FilePreviewPanel.tsx:903-915): `UADEEngine.getInstance()` (the SAME singleton the editor song plays on), `addCompanionFile` for each companion, `loadForPlayback`, `output.connect(ctx.destination)`.
- `DJModlandBrowser` preview (DJModlandBrowser.tsx:466-476): same singleton, same writes, routed to the cue bus.

A preview therefore replaces the editor song's UADE module and leaves its
companions in the shared virtual FS (the L11 bob4e class of bug).

### G. Companions written out of band (addCompanionFile outside UADEEngine)

| Site | Live? | Key used |
|---|---|---|
| prepareModuleImport.ts:105 | yes (dialog + importModuleFile) | `companionRelativeName(file, c)` |
| UADEParser.ts:480 (parseUADEFile) | yes (every UADE parse) | the map key as given |
| FilePreviewPanel.tsx:909 | yes (preview) | map key |
| DJModlandBrowser.tsx:473 | yes (preview) | `c.filename` |
| useImportDialog.ts:170 | DEAD: `useImportDialog` is defined (:97) and never imported | `companion.name` (bare - would collapse subdirs) |

Plus inside the engine family: UADEEngine.ts:685/:701/:707, UADESynth.ts:59.
In the interactive and headless paths a UADE song's companions are written
TWICE (prepareModuleImport then parseUADEFile), under keys built two ways.
Nothing ever REMOVES a companion: the FS accumulates across songs.

Companion acquisition (network) is a third copy of the logic, in 9 files:
`downloadUADECompanions` (JukeboxPanel, FilePreviewPanel, DJModlandBrowser,
DJPlaylistModal, DJPlaylistPanel, DJPlaylistAnalyzer, DJPlaylistPrecache,
DJTrackLoader, tourScript) and `gatherCompanions` (JukeboxPanel,
useFileNavigation, modlandApi). Local drops use `pendingCompanionFiles` in
useUIStore (App.tsx:857-878, restored after a dialog defer).

### Playback start and teardown per path

| Path | Stops old song | When | Starts new song |
|---|---|---|---|
| Module import (dialog / headless) | applySong.stopOutgoingSong (applySong.ts:140) | AFTER parse + UADE scan | no (jukebox: playHeadless after) |
| GoatTracker / SunVox / TD-3 | stopActivePlaybackForIncomingSong (UnifiedFileLoader.ts:63) | before parse | no |
| Jukebox | via bridge -> applySong | after parse | `playHeadless({mode:'song'})` |
| Tour | via applySong | after parse | tour script |
| Embed | via applySong (projects only) | after parse | parent `PLAY` message |
| DJ | deck-local | - | deck |
| Restore / tab / sync | applySong | after parse | no |

`stopOutgoingSong` stops the transport, ToneEngine voices, the TrackerReplayer
and AdPlug. It does NOT reset the oscilloscope store, the engine-position
feed, the meter feeds, the UADE companion FS, or the per-format WASM engine
that is not the replayer's; it does not set any "loading" state. Old audio
keeps playing for the entire parse (seconds for UADE, see 2) because the stop
comes last.

## 2. Where load time goes

Measured in node (vitest, real parsers, real WASM read from public/; scratch
test, deleted). pass0 = first load in the process (lazy module graph + WASM
fetch/compile); pass1/2 = warm. Corpus: public/data/songs/formats/.

| File | Format route | pass0 | warm | Main-thread heavy part |
|---|---|---|---|---|
| a sleep so deep.mod (203 KB) | native MOD | 659 ms | 26-29 ms | first-load chunk graph |
| andante.s3m (289 KB) | native S3M (OpenMPT WASM unavailable in node) | 141 ms | 27 ms | - |
| apb.dw (46 KB) | DW native + `dw_walk` WASM | 232 ms | 0.8-1.9 ms | WASM fetch+compile once; `walkDavidWhittaker` 0.4-1.1 ms |
| prehistoric_tale.hipc | Hippel COSO | 44 ms | 2 ms | walker declined (null) |
| ghostbattle_gameover.hip7 (45 KB) | Hippel 7V + `browserHippelWalker` (TFMX WASM) | 187 ms | 137-152 ms | `hippelPlayedPitch` walk 97-118 ms EVERY load, main thread |
| baseheads.ma (114 KB, 343 patterns) | Music Assembler + `maWalk` (TS) | 136 ms | 55-57 ms | maWalk in TS, main thread |
| aces_high.ahx | Hively | 54 ms | 2-5 ms | - |
| bomb jack.fred | Fred + fredEditorGrid walk | 51 ms | 1-3 ms | - |

Apply: `useTrackerStore.loadPatterns` alone = 8-11 ms for 24 patterns,
82-101 ms for 343 patterns (immer freeze), main thread.

UADE songs (not runnable in node through parseModuleToSong - the engine is an
AudioWorklet): `prepareModuleImport` -> `UADEEngine.load` posts `load` to the
worklet, which runs `_scanSong` SYNCHRONOUSLY inside its message handler
(public/uade/UADE.worklet.js:1037) for up to 600 s of song time or
`SCAN_WALL_MS = 15000` wall time (:26). While it runs, the AudioWorklet
render thread does no `process()` calls - every worklet in the context
(old song, master FX, meters' sources) stalls. Render speed from the headless
sweep's own records (test-data/uade-corpus-sweep.json, 363 rows, frames/ms):
p10 18.7x, p50 30.6x, p90 46.5x real time, so a 3-minute song's scan costs
about 5.9 s at p50 and 9.6 s at p10, capped at 15 s (the enhanced scan also
records tick snapshots, so it is not faster than this). That is the
"freeze for a while and then struggle": the old song keeps its transport
running while the audio thread is blocked (applySong's stop comes AFTER the
scan), audio drops out, then the stop/apply/start burst follows. Not measured
live in the owner's tab (read-only instruction; `get_format_state.uadeScanStats`
was null - no UADE song had been scanned since the last reload).

Other costs on the way in, measured or read:
- Jukebox base64 round trip: 2 MB file = 53 ms encode + 7 ms decode on the main thread (node), for nothing (same process).
- The jukebox closes dialogs on 0/400/1500 ms timers (JukeboxPanel.tsx:263-270) because the load path raises them.
- `applySong` awaits `engine.preloadInstruments` for synth songs (applySong.ts:203) - not measured here (needs ToneEngine).

Conclusion for U2: the seconds are the UADE scan on the audio thread and
the fact that the old song is stopped only after it; the main-thread walks
are 50-150 ms per load (Hippel 7V, Music Assembler) - worth moving to a
worker but not the freeze. MOD/XM/S3M/AHX/Fred/DW parse is under 30 ms warm.

## 3. Why VU meters freeze on song switch

Meter readers: `ChannelVUMeters.tsx` (tick loop :114-250), `ChannelLevelsCompact.tsx`,
`TrackScopesStrip.tsx`, `VJPatternOverlay.tsx`. Feeds: ToneEngine trigger
levels and realtime levels (src/engine/tone/ChannelRouting.ts:60-150; the
realtime feed self-expires after 100 ms, :145), plus the oscilloscope store
(src/stores/useOscilloscopeStore.ts).

The freeze path, from code:

1. ChannelVUMeters zeroes a meter only when `!isPlaying && !oscChannelData`
   (ChannelVUMeters.tsx:202). `oscChannelData` is non-null whenever
   `useOscilloscopeStore.isActive` is true - "a direct-routed WASM engine can
   play with transport isPlaying still false".
2. While `oscChannelData` exists, each frame re-derives the level from the
   waveform peak of the stored frame (:229-235). If the frame never changes,
   the level never decays: a frozen meter.
3. `isActive` has no age. `updateChannelData` sets `isActive: true` and the
   frame (useOscilloscopeStore.ts:47-54); only `clear()` resets it.
4. On a switch, `applySong.stopOutgoingSong` -> `TrackerReplayer.stop()`
   calls `useOscilloscopeStore.clear()` (TrackerReplayer.ts:2868). But the
   engines post `oscData` from their worklets asynchronously. `stop()` on the
   engine only POSTS `stop` (e.g. HivelyEngine.ts:306, SoundMonEngine.ts:121);
   any `oscData` message already queued, or posted before the worklet reads
   `stop`, is delivered AFTER `clear()` and re-arms `isActive: true` with the
   last non-silent frame. The worklets then stop posting (SoundMon.worklet.js:161
   returns early when not playing), so that frame is never replaced.
5. 40 engine call sites write `updateChannelData`; 8 files ever call
   `clear()`. Nothing drops a stale frame by time.
6. For UADE songs the next load's synchronous scan (section 2) blocks the
   audio thread for seconds while the stale frame is on screen - the freeze is
   most visible exactly on the slow loads.

So: the meters freeze because "is an engine playing" is inferred from a store
flag that any late message can set, with no frame age and no song identity,
and there is no unload step that fences off the old engine's messages.
Mechanism VERIFIED from code; NOT reproduced live (no browser driving
allowed for this task). The owner's question "should a clear song be sent
properly before the next one is loaded?" - yes, and it must be a fence, not
just a clear: messages from the old engine must be ignored after it.

## 4. Save and export entry points

Save (one serializer already - snapshotSong):
`buildSavedProject` (useProjectPersistence.ts:374; autosave, recovery,
revisions, NavBar download via `serializeProjectToBlob` useNavBar.ts:125),
`exportSong` .dbx (exporters.ts:302; FT2Toolbar.tsx:297, useExportDialog.ts:173),
tabs (useTabsStore.ts:47), sync (SongSyncLayer.ts:28). 4 entry points, 1 reader.

Export - per target:

| Target | Entry points | Input | Divergence |
|---|---|---|---|
| Native format (`exportNativeSong`, nativeExportRouter.ts:104) | Export dialog (useExportDialog.ts:245), FT2 Save (FT2Toolbar.tsx:278), MaxTraxView.tsx:63, MCP export_native (writeHandlers.ts:3272) | liveTrackerSong | none - one router |
| OpenMPT MOD/XM/IT/S3M (`exportWithOpenMPT`) | FT2 Save non-Cinter (FT2Toolbar.tsx:282), ModuleExportPanel.tsx:129, Cinter4ModSave.ts:264, MCP export_mod (writeHandlers.ts:3223) | FT2 and panel: store arrays passed as args; MCP: liveTrackerSong | three argument builders |
| MOD via `exportSongToMOD` | nativeExportRouter.ts:269, OctaMEDControls.tsx:89 | OctaMEDControls hand-builds a TrackerSong from four stores (:70-86) | OctaMED bypasses liveTrackerSong |
| MIDI | MidiExportPanel.tsx:40/:48, MCP export_midi (writeHandlers.ts:3191/:3205) | store | two callers, same functions |
| Audio WAV/MP3/FLAC/OGG | AudioExportPanel.tsx:97/:135/:146-149 (live capture, `exportUADEAsWav`) vs MCP export_wav/export_mp3 (writeHandlers.ts:2788, :3095: `renderUADEToWav` offline, `renderPatternToAudio` Tone-offline, or `captureAudioLiveToBuffer`) | - | TWO render strategies: the panel and MCP can produce different audio for the same song |
| Stems | AudioExportPanel.tsx:80 (`downloadLiveCaptureStems`), MCP export_stems (writeHandlers.ts:3112) | - | shared `exportLiveCaptureStems` |
| Chip register logs | ChipExportPanel.tsx:154 | recording session | single |

## 5. Existing guards

- `src/lib/song/__tests__/singleLoadPath.contract.test.ts` - song-replacing setters only in applySong (+7 allowlisted partial updates); only snapshotSong reads native data to save.
- `src/lib/file/__tests__/oneParsePath.contract.test.ts` - importTrackerModule == parseModuleToSong for MOD/XM/S3M/IT.
- `loadingASongDrawsTheNewLayoutOnce.test.ts` (UI1, 900668a63) - the render worker holds the old picture until the new layout arrives (`src/engine/renderer/layoutHold.ts`).
- No guard on WHO may call parseModuleToSong / importTrackerModule / applySong / addCompanionFile. U4.

## Open questions (for the plan)

- Q1 (owner): does the import dialog stay for drag-drop? Today every drop shows it; headless paths skip it. See plan, Owner decisions.
- Q2 (owner): does a load start playback? Today only jukebox/tour/embed-parent do.
- Q3 (measure in U2a): live UADE scan wall times in the browser (`uadeScanStats` after loading 3 corpus songs) - needs the owner's go to drive the tab, or a soak tab.
