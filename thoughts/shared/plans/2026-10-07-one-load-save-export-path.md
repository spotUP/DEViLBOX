---
date: 2026-10-07
topic: one song-open service with a lifecycle, one export per target, CI guard (Batch U, U2-U4)
tags: [load-path, save, export, companions, uade, vu-meters, performance, batch-u, plan]
status: draft
---

# One load / save / export path - plan (Batch U, U2-U4)

Research: `thoughts/shared/research/2026-10-07_load-save-export-paths.md`
(entry-point map, load-time breakdown, VU freeze mechanism). Ledger:
`thoughts/shared/plans/2026-10-06-fix-all-open.md` Batch U. Prior layer
already done: applySong / snapshotSong / liveTrackerSong
(`2026-09-29-single-load-save-path.md`, 23 of 23).

## The invariant

A song enters the app through ONE call, `openSong(source, options)`, which
always runs the same lifecycle:

    acquire (bytes + companions) -> unload (old song silent, stores reset, fence)
      -> prepare (route, pre-scan) -> [optional dialog] -> parse (heavy work off
      the audio and main threads) -> apply (applySong, or a deck) -> start (optional)

Nothing else may parse a module for playback, apply a song, write UADE
companions, or start a load-time scan. Every export target has one function
fed by `liveTrackerSong` (save: `snapshotSong`). A CI contract test enforces
both.

## Problem in domain terms

The violated invariant is "a song switch is one transaction with a defined
start and end". Today it is a set of loosely ordered side effects spread over
four forks (dialog, headless bridge, DJ, restore): the old song is stopped
AFTER the new one is parsed and scanned (so the UADE scan blocks the audio
thread while the old song's transport still runs - the freeze), stale engine
messages are not fenced (the frozen VU), companions are written by whoever
loaded last and never removed (bob4e, Sonix), and two headless callers
(embed, SID dialog) drop the `'pending-import'` result and load nothing. The
symptoms the owner reports are three faces of the missing transaction.

Levels the fix could live at:
1. Per-caller patches (jukebox calls importModuleFile, VU meter clears on
   song change, ...). Band-aid: each fork keeps its own order of steps.
2. Presentation (meter component checks a "song changed" flag). Band-aid for
   the meters only.
3. A song-session service that owns the lifecycle and is the only caller of
   the parse/apply/companion primitives. ROOT level: the bugs are ordering and
   ownership bugs.

## Design options compared

**Option A - Facade over today's functions.** `openSong()` wraps
`UnifiedFileLoader.loadFile` + `importModuleFile`; callers switch to it; the
guard forbids the old names. Cost: ~1 session. Fails to cover: the order of
stop vs parse (still inside applySong, after the scan), the stale-message
fence, companion ownership (prepare + parser still write twice), the
tri-state result stays inside, DJ stays a fork (it needs a deck target), the
scan stays on the audio thread. It renames the fork without removing it.

**Option B - Song-session service with an explicit lifecycle (CHOSEN).**
`src/lib/song/openSong.ts` owns acquire / unload / prepare / parse / apply /
start, with a `target` (`editor` | `{deck}` | `preview`) choosing only the
apply and output step. Two-step API so the dialog is a UI step in front of the
same call: `prepareSong(source) -> PreparedSong`, `openSong(prepared |
source, choices)`. Unload uses a song generation fence. Companions travel
only inside the call and reach UADE only through `UADEEngine.load(buf, name,
{companions})`, which replaces the previous set. Heavy work moves off-thread
in separate, measured phases (UADE scan to a worker modelled on
`src/workers/dj-render.worker.ts`; Hippel/MA walks to a walk worker). Cost:
~10 agent sessions in shippable phases. Fails to cover: nothing in scope;
risk is in the scan move (gated by a corpus equality check).

**Option C - Whole parse in a worker.** Move `parseModuleToSong` entirely
into a Worker for every format. Cost: very high - parsers read
`useSettingsStore`, lazy-load WASM through main-thread helpers, and several
need the playback UADE instance's chip RAM afterwards (editing). Gains little
for MOD/XM/S3M/AHX/Fred/DW (under 30 ms warm, research 2). Rejected; the
measured cost is the UADE scan (seconds, audio thread) and two walks
(50-150 ms), which B moves individually.

Chosen: **B**, because the defects are ordering/ownership defects that only a
lifecycle owner can fix, and the measured time sinks are few enough to move
one by one.

## API (target shape)

```ts
// src/lib/song/openSong.ts
export type SongSourceRef =
  | { kind: 'file'; file: File; companions?: File[] }            // drop, file picker, embed, tests
  | { kind: 'bytes'; name: string; bytes: ArrayBuffer; companions?: Map<string, ArrayBuffer> } // MCP, jukebox
  | { kind: 'modland'; path: string }                             // service fetches file + companions
  | { kind: 'hvsc'; path: string }
  | { kind: 'saved'; project: unknown; origin: 'project' | 'recovery' | 'revision' | 'tab' | 'sync' }
  | { kind: 'storedBytes'; saved: unknown };                      // restoreFromStoredBytes

export type OpenOrigin = 'drop' | 'filebrowser' | 'dialog' | 'mcp' | 'jukebox' | 'tour'
  | 'embed' | 'hvsc' | 'modland' | 'restore' | 'tab' | 'sync' | 'dj' | 'preview';

export interface OpenOptions {
  origin: OpenOrigin;
  subsong?: number;
  target?: 'editor' | { deck: DeckId } | 'preview';   // default 'editor'
  start?: false | 'song' | 'pattern';                  // default false (see owner decision D2)
  interactive?: boolean;                               // may show the import dialog (D1); headless never does
  useLibopenmpt?: boolean;                             // dialog choice; NO settings write
  midiOptions?: MidiImportOptions;
  signal?: AbortSignal;                                // a newer open cancels an older one
  onProgress?: (p: { phase: OpenPhase; progress?: number }) => void;
}

export type OpenPhase = 'acquire' | 'unload' | 'prepare' | 'scan' | 'parse' | 'apply' | 'start';

export interface PreparedSong { source: ResolvedSource; format: FormatDefinition | null;
  info: ModuleInfo; uadeMetadata?: UADEMetadata; sidInfo?: SIDHeaderInfo | null; generation: number }

export async function prepareSong(src: SongSourceRef, o: OpenOptions): Promise<PreparedSong>;
export async function openSong(src: SongSourceRef | PreparedSong, o: OpenOptions): Promise<OpenResult>;
export type OpenResult = { ok: true; name: string; engine: string; editorMode: string } | { ok: false; error: string };
```

Lifecycle module `src/lib/song/songLifecycle.ts`:

```ts
export function currentSongGeneration(): number;
/** Old song silent and forgotten: stop transport/replayer/AdPlug/native engine,
 *  release voices, bump the generation, reset oscilloscope + meter feeds +
 *  engine position + transport position, set useSongLoadStore.phase. */
export async function unloadSong(reason: OpenOrigin): Promise<number>;
```

`useSongLoadStore` (`src/stores/useSongLoadStore.ts`): `{ phase, name, progress,
error }` - the one "loading" state the UI shows (replaces the dialog-local
progress state and the jukebox status hacks).

Non-song files (instrument `.dbi`, samples, DB303 XML, TD-3 append, `.sunsynth`)
stay in `UnifiedFileLoader.loadFile`, which delegates song formats to
`openSong` and never returns `'pending-import'` again (the tri-state is the
cause of family C).

## Owner decisions needed (recommendations given; work does not block on them until the named phase)

- **D1 Drag-drop dialog** (blocks U2.3): keep the import dialog on every drop
  (today), or open directly and show the dialog only when there is a choice
  (several subsongs, or libopenmpt vs native)? Recommended: **show it only
  when there is a choice**, because the jukebox/MCP/file-browser already open
  directly and a dialog that only says "Import" is a click that changes
  nothing - and its hidden settings write is removed either way.
- **D2 Start after load** (blocks U2.3): keep today's rule (drop/dialog does
  not start; jukebox, tour, embed-parent do), or start every interactive load?
  Recommended: **keep today's rule** as `start` per origin; changing it is a
  product change nobody asked for.
- **D3 Silence on a failed load** (blocks U2.1): unload-first means a load
  that fails leaves silence instead of the old song. Recommended: **accept** -
  that is what "a clear song sent before the next one is loaded" means, and the
  failure toast says why.
- **D4 Dialog settings write** (blocks U2.3): ImportModuleDialog's Import
  writes `formatEngine` settings (ImportModuleDialog.tsx:186-190), so one
  dialog import changes how every later headless load routes. Recommended:
  **remove** - the choice becomes an `openSong` option for that load only.

## Phases

Each unit = one agent session, ends with `npm run type-check` green, its own
tests, and the U4 guard green (the guard's allowlist only shrinks). Commit via
`scripts/commit-files.sh`. Order keeps every phase shippable: the guard lands
first in ratchet mode, the lifecycle fix lands before any caller moves, each
caller family moves in one unit.

### U4.0 - Guard in ratchet mode (first)
- New `src/lib/song/__tests__/oneOpenPath.contract.test.ts`: scans `src/`
  (tests excluded, comments stripped) for CALLS of `parseModuleToSong(`,
  `importTrackerModule(`, `importModuleFile(`, `prepareModuleImport(`,
  `applySong(`, `.addCompanionFile(`, `downloadUADECompanions(`,
  `gatherCompanions(`, `exportWithOpenMPT(`, `exportSongToMOD(`,
  `exportNativeSong(`, `renderUADEToWav(`, `renderPatternToAudio(`,
  `captureAudioLiveToBuffer(`. Count per file compared with an explicit
  allowlist `{file: count, reason, removedBy: 'U2.x'}` seeded from the
  research map (counted from the call graph, research section 1). A new
  caller or a higher count fails; a LOWER count also fails until the
  allowlist entry is lowered (so the ratchet is recorded).
- Probe: plant a call in a scratch file, see it fail, remove.
- Wire into `test:ci` (package.json `test:ci` path list).

### U2.1 - Unload + meter fence (fixes "VU frozen" and "old song keeps playing during the scan")
Files: new `src/lib/song/songLifecycle.ts`, new `src/stores/useSongLoadStore.ts`;
`src/stores/useOscilloscopeStore.ts` (frame timestamp `lastFrameAt` and a
`generation`; `updateChannelData(channels, frame?, sr?, gen?)` drops frames
whose `gen` is older than the store's; readers treat a frame older than 100 ms
as no data, same rule as `getRealtimeChannelLevels`, ChannelRouting.ts:145);
`src/components/tracker/ChannelVUMeters.tsx`, `ChannelLevelsCompact.tsx`,
`TrackScopesStrip.tsx`, `VJPatternOverlay.tsx` read through one selector
`liveScopeFrame()` (extract; pure); `src/lib/song/applySong.ts`
(`stopOutgoingSong` becomes `unloadSong`, called by the openers BEFORE parse;
applySong keeps a cheap idempotent stop for direct restore callers until U2.4).
Engines: the 40 `updateChannelData` sites pass `currentSongGeneration()`
captured at their `play()`; mechanical, one edit per engine file (list:
`grep -rln updateChannelData src/engine`).
Tests:
- `src/stores/__tests__/oscilloscopeLateFrameAfterUnload.test.ts`: clear/unload, then a late `updateChannelData` with the old generation -> `liveScopeFrame()` null; a frame 150 ms old -> null. Must fail on today's code (revert check).
- `src/components/tracker/__tests__/vuMeterDropsToZeroAfterSongSwitch.test.ts`: the extracted pure meter step with a stale frame and `isPlaying=false` -> level 0 within one frame.
- Reachability (family: every opener): through the real bridge `loadFile` (writeHandlers.ts:1602) with a MOD after an AHX, sentinel spy on `unloadSong` called once and BEFORE `parseModuleToSong` (call order).

### U2.2 - `openSong` service, editor target, headless callers
Files: new `src/lib/song/openSong.ts` (moves the song branches of
`loadSongFile` UnifiedFileLoader.ts:352-955, `importTrackerModule` :91,
`importModuleFile` :185, and `prepareModuleImport` src/lib/import/prepareModuleImport.ts
as its `prepare` step - move, not copy); `UnifiedFileLoader.loadFile` keeps
non-song files and returns `openSong`'s result for songs (no `'pending-import'`).
Migrate (each a few lines):
- bridge `loadFile` (writeHandlers.ts:1602): decode base64 -> `openSong({kind:'bytes'}, {origin:'mcp'})`; remove its own routing (:1640-1672).
- Jukebox (JukeboxPanel.tsx:218-271): `openSong({kind:'bytes', bytes}, {origin:'jukebox', start:'song'})` - no base64 round trip, no `playHeadless`; the three close-dialog timers go (no dialog can be raised by an origin that is not interactive - `suppressFormatChecks` becomes an `openSong` rule, not a caller's job).
- Tour (tourScript.ts:43-46), embed (PatternEditorEmbed.tsx:143), SID dialog (useSIDInfoDialog.ts:89), App file browser (App.tsx:1183/:1198), FT2 file browser projects (FT2Toolbar.tsx:720). Fixes family C.
Tests:
- `src/lib/song/__tests__/embedAndSidDialogOpenModules.test.ts`: embed `LOAD_FILE` handler and `handleLoadTune` with a real `.sid`/`.mod` reach `applySong` (spy count 1). Fails today (count 0).
- Reachability (headless family): real bridge `loadFile` with base64 of `public/data/songs/formats/a sleep so deep.mod` -> `openSong` called once, song in stores, `editorMode` classic.
- Re-point, do not duplicate: `oneParsePath.contract`, `uadeCompanionsForwarded`, `suntronicHeaderLoad.contract` to `openSong` (delete the ones that only re-prove wiring - global rule: one reachability test per feature).
- Ratchet the U4 allowlist.

### U2.3 - The dialog becomes a step in front of the same call
Needs D1, D2, D4.
Files: `src/components/dialogs/ImportModuleDialog.tsx` (calls `prepareSong`
for its preview, `openSong(prepared, choices)` on Import; no settings write);
`src/hooks/tracker/useModuleImport.ts` (delete `handleModuleImport`, keep TD-3
and SunVox-patch handlers or move them next to their dialogs);
`src/components/tracker/TrackerView.tsx:774/:781/:788` and
`FT2Toolbar.tsx:704/:727` (one dialog mount, in TrackerView; FT2Toolbar opens
it through `useUIStore.setPendingModuleFile`); `App.tsx:823-890` drop handler
-> `openSong({kind:'file'}, {origin:'drop', interactive:true})`, which asks
for the dialog only per D1. Delete dead `src/hooks/useImportDialog.ts`.
Tests:
- Reachability (interactive family): render `ImportModuleDialog` (RTL + happy-dom, both in devDependencies) with a real MOD, click Import -> `openSong` called once with the prepared song (sentinel), dialog's `prepareSong` called once (no second prepare).
- `importDialogWritesNoSettings.test.ts`: `formatEngine` unchanged after an Import. Fails today.

### U2.4 - Restore, tabs, sync, Export-dialog import through `openSong`
Files: `useProjectPersistence.ts:439/:578/:612`, `restoreFromStoredBytes.ts:72`,
`useTabsStore.ts:60`, `SongSyncLayer.ts:40`, `useExportDialog.ts:286` ->
`openSong({kind:'saved'|'storedBytes'}, {origin})`. applySong's own stop is
removed (only openSong unloads). Tests: reachability (restore family): real
`applySavedProject` with a saved AHX project -> `unloadSong` + `applySong`
once; existing `savedProjectAfterAhx`, `songRoundTrip` stay green.

### U2.5 - Companions owned by the call
Files: `src/engine/uade/UADEEngine.ts` (`load` / `loadForPlayback` take
`{companions}`; the engine clears the previous set from the virtual FS,
then writes the new one; `addCompanionFile` becomes private); remove writes
at prepareModuleImport.ts:105 (moved into openSong), UADEParser.ts:480,
FilePreviewPanel.tsx:909, DJModlandBrowser.tsx:473; `UADESynth.ts:59` passes
through. Acquisition: `src/lib/song/acquireSource.ts` is the only caller of
`downloadUADECompanions` / `gatherCompanions` / `pendingCompanionFiles`
(resolves `modland`/`hvsc`/`file` sources); JukeboxPanel, FilePreviewPanel,
useFileNavigation, tourScript pass a source ref instead of fetching.
Previews: `openSong(src, {target:'preview'})` - same acquire + the engine
call above, output to the preview/cue bus, no apply.
Tests:
- `uadeCompanionSetReplacedPerLoad.test.ts`: load song A with companion X, then song B with Y -> FS holds Y only. Fails today.
- Reachability (companion family): bob4e.dum + bob4.ins via `openSong({kind:'bytes', companions})` -> UADE receives bob4.ins exactly once, under the relative key.

### U2.6 - DJ decks through the same acquire + parse (two sessions)
- U2.6a engine side: `DJTrackLoader.ts` (6 sites), `DJUADEPrerender.ts:80`,
  `DJPlaylistAnalyzer.ts`, `DJPlaylistPrecache.ts` -> `openSong(src,
  {origin:'dj', target:{deck}})`; the deck target's apply = today's deck load.
  No editor unload for a deck target (the fence is per target).
- U2.6b components: DJFileBrowser, DJView, DJDeck, DJPlaylistModal (6),
  DJPlaylistPanel (4), DJModlandBrowser (2) -> source refs. All 22 sites get
  companions the same way (today 20 parse with none).
Tests: reachability (DJ family): `loadPlaylistTrackToDeck` with a two-file
corpus song -> `openSong` once with the deck target and the companion
present; editor stores untouched.

### U2.7 - UADE load-time scan off the audio thread (measured gate)
- Measure first (needs the owner's go to drive a tab, or a dedicated soak
  tab): `uadeScanStats` wall ms for 3 corpus UADE songs, and `get_frame_stats`
  / audio dropouts during a switch. Record in the plan.
- Move: extract `_scanSong*` (public/uade/UADE.worklet.js:1240-1400) into an
  ES module shared by the worklet and a new `src/workers/uade-scan.worker.ts`
  (independent UADE instance, pattern of `src/workers/dj-render.worker.ts`).
  `openSong`'s prepare step scans in the worker (companions passed in);
  playback `UADEEngine.load(..., skipScan)`. Gate: for every corpus UADE song
  the worker's scan result (rows, tick snapshots, samples) equals the
  worklet's byte for byte (`src/engine/__tests__/uadeScanWorkerEqualsWorklet.test.ts`,
  node, real wasm). If not equal, the phase stops and reports.
- Reachability: openSong with a UADE song -> the worklet receives `skipScan:
  true` (sentinel on the posted message), the worker scan ran once.

#### U2.7 result (2026-10-07, owner's tab via MCP, audio-thread stall = longest span `AudioContext.currentTime` stood still)
Decision: the worker hosts UADE.worklet.js itself (src/engine/uade/uadeWorkletHost.ts, own WASM instance), so there is no second copy of the scan; scan equality is by construction and proven over 14 corpus formats + a DeliTracker custom.
Before (scan in the worklet) -> after (scan in src/workers/uade-scan.worker.ts), same rows both ways:
- centurion_battle.rh 73 rows: stall 75 ms -> 4 ms
- 45.okta 1029 rows: 1135 -> 13
- baseheads.ma 157: 1255 -> 9
- bards tale.cus 145: 15115 (wall cap) -> 9 (worker scan 5.1 s)
- a sleep so deep.mod 145: 2299 -> 36
- cockwise.mug 5047: 2044 -> 15
- dynablaster.ast 921: 4495 -> 9
- hybris.fp 16384: 5407 -> 47
Main-thread long tasks: 0 before and after, except hybris.fp (2 tasks, max 71 ms: receiving the 16384-row result).
Cost: the scan itself runs 0-30 percent slower in the worker (e.g. dynablaster 4.5 s -> 6.0 s) and the worklet then loads the song once more for playback. The browser's own underrun counter stayed 0 in both (it counts playback underruns, not graph stalls).
Open: the 15 s wall cap (SCAN_WALL_MS) was set to protect the audio thread and could now be raised.

### U2.8 - Import-time walks off the main thread
`hippelPlayedPitch` (97-118 ms per hip7 load, TFMX wasm) and `maWalk`
(~55 ms, baseheads.ma) into `src/workers/songWalk.worker.ts`; walkers already
take an injectable `HippelDecoderWalker` (hippelPlayedPitch.ts:72), so the
worker is a new walker implementation, not a fork. Gate: grids identical to
the main-thread walk for every corpus hip7 / ma file (existing
`*GridMatchesPlayer` tests run against the worker walker). Skip DW and Fred
(under 2 ms warm).

### U3 - One export per target (two sessions)
- U3a audio: new `src/lib/export/audioExportService.ts` `exportAudio({format,
  scope: 'song'|'pattern'|'stems'})` - ONE render strategy (the panel's live
  capture + `exportUADEAsWav`, which is what the owner hears); MCP
  `exportWav` / `exportMp3` (writeHandlers.ts:2788/:3095) and
  `AudioExportPanel.tsx` both call it; `renderPatternToAudio` /
  `captureAudioLiveToBuffer` become private. Reachability: MCP `export_wav`
  and the panel's handler produce the call with identical arguments (spy).
- U3b module/MIDI: `exportWithOpenMPT` / `exportSongToMOD` / MIDI exporters
  take a `TrackerSong` from `liveTrackerSong()` only - FT2Toolbar.tsx:282,
  ModuleExportPanel.tsx:129, Cinter4ModSave.ts:264, OctaMEDControls.tsx:70-89
  (hand-built song removed), MidiExportPanel.tsx:40/:48, MCP export_mod /
  export_midi. Test: OctaMED export after an unplayed edit contains the edit.
- Save is already one reader (`snapshotSong`); U3 only adds it to the guard.

### U4.1 - Guard final state
Allowlist reduced to: `openSong.ts`, `songLifecycle.ts`, `acquireSource.ts`,
the UADE engine family for `addCompanionFile`, `applySong.ts`, the export
services, and the parsers' internal recursion (`ChipDumpParsers`,
`VGMParser`, `UADEParser` re-entry). Probe again with a planted caller.

## Checklist

- [x] U4.0 guard, ratchet mode (src/engine/__tests__/oneOpenPath.contract.test.ts + oneOpenPathAllowlist.ts; useImportDialog.ts deleted)
- [x] U2.1 unload + generation fence + frame age (VU freeze, stop before parse) - D3 accepted. Done: songLifecycle.ts (unloadSong, withSongLoad), useSongLoadStore, store fence + liveScopeFrame(), openers wrapped in UnifiedFileLoader, StatusBar Loading. Deviation: the 40 engine sites are NOT edited - the store fences unstamped frames for 100 ms after unload and expires frames after 100 ms; the optional `generation` argument exists for stamped sites. Test: src/stores/__tests__/songSwitchUnload.test.ts
- [x] U2.2 openSong, headless callers, family C fixed + U6 foundation. Done: src/lib/song/openSong.ts (classifySong = the one routing rule; sources file/bytes/modland/url; phases to useSongLoadStore, status bar shows phase + elapsed; start per origin D2; headless origin suppresses format dialogs and the Modland contribution prompt). Moved onto it: bridge loadFile (MCP load_file/modland/hvsc/play_fur), jukebox (no base64, no timers), tour loadTrackerSong, embed LOAD_FILE and SID dialog (both were broken), App file browser + post-confirmation load; loadFile delegates songs to openSong and never returns 'pending-import'. Deviation: the branch bodies (importTrackerModule/importModuleFile, SunVox, V2M, AdPlug, GoatTracker, MIDI, .dbx) stay in UnifiedFileLoader (many tests and the in-flight G19 work import them) and are called from openSong; they move with U2.3/U4.1. tour searchAndLoadModland is a DJ deck load: its allowlist entry now says U2.6b. Hook for the U6 panel: useSongLoadStore.cancel / OpenOptions.signal. Tests: openSongEntryPoints.test.tsx (MCP, jukebox, embed, SID), openSongPhases.test.ts
- [x] U2.3 + U6 part 2 dialog in front of openSong. Done: prepareSong / PreparedSong / askForChoices in src/lib/song/openSong.ts; importChoice.ts (D1 rule: several subsongs, a missing partner file, or Furnace/MIDI settings); importRequest.ts (openSong awaits the dialog; no pending state); ImportDialogHost.tsx is the one mount (TrackerView); openUserSong.ts is the one drop / file-browser caller (App drop + browser, FT2 browser). ImportModuleDialog scans via prepareSong, shows the scan openSong already made, writes no settings (D4). loadFile lost requireConfirmation and 'pending-confirmation' for songs; useModuleImport lost handleModuleImport; useUIStore lost pendingModuleFile. Loading panel: src/components/tracker/SongLoadPanel.tsx (store-driven, Cancel -> OpenOptions.signal / useSongLoadStore.cancel; checks between phases incl. before parse and apply). Deviations: (1) the interactive scan runs BEFORE the unload (the old song plays until the dialog is answered; a cancelled dialog must not leave silence), parse and apply run after the unload; (2) D1's 'libopenmpt vs native' has no rule or control today (the dialog never had an engine selector and a plain MOD must open directly), so only subsongs / partner files / own-settings dialogs count as a choice; Furnace and MIDI always ask (their settings need a parse to know); (3) UnifiedFileLoader branch bodies stay until U4.1. Allowlist: 3 entries removed (ImportModuleDialog prepareModuleImport, useModuleImport importTrackerModule, importModuleFileUnloaded prepareModuleImport), 1 renamed (prepareModuleFile, the one prepareModuleImport caller). Tests: src/lib/song/__tests__/interactiveOpen.test.tsx
- [x] U2.4 restore / tabs / sync / Export-dialog import. Done: openSong takes a 'song' source (StoredSongSource) and openSavedSong() is its throwing wrapper (src/lib/song/openSong.ts): withSongLoad unloads and bumps the generation, the song is BUILT inside it (restore re-decodes the stored bytes after the unload, not before), applySong runs once. Moved: applySavedProject (restore + recovery), loadProjectFromObject, loadLocalRevision, useTabsStore.restoreState, SongSyncLayer full_sync, useExportDialog song import. applySong lost its own stop. Allowlist: 6 applySong entries removed, 1 owner entry added (openStoredSong). Test: storedSongOpenLifecycle.contract.test.ts (restore, tab, sync; revert-checked)
- [x] U2.5 companions owned by the call, previews as a target. Done: UADEEngine.load/loadForPlayback take companions and the worklet replaces the set per load (addCompanionFile removed from engine and worklet); callers moved: loadTune, UADESynth, UADEParser, prepareModuleImport, FilePreviewPanel and DJModlandBrowser previews; acquire moved to src/lib/song/acquireSource.ts (the only caller of downloadUADECompanions/gatherCompanions in the open path; FilePreviewPanel and useFileNavigation use it). Deviation: previews use UADEEngine.getPreviewInstance() (own engine) instead of openSong(target:'preview'); the DJ deck/tour/jukebox-playlist callers of downloadUADECompanions stay for U2.6.
- [x] U2.6a DJ engine loaders. Done: openSong deck target (OpenOptions.target {deck}; openDeckTrack = the throwing wrapper): acquire (publishes no editor load phase) + parse on the deck's own UADE engine (UADEEngine.getDeckInstance, withDeckUADEEngine scope in UADEParser), returns song + bytes + companions; DJTrackLoader (6 sites), DJUADEPrerender, DJPlaylistPrecache / DJPlaylistAnalyzer (acquireModlandCompanions). Deviation: the engine hand-off (pipeline render, loadAudioToDeck) stays in each loader; the call returns the song. Test: src/engine/dj/__tests__/deckLoadOpensThroughOpenSong.contract.test.ts (revert-checked both tests)
- [x] U2.6b DJ components. Done: DJFileBrowser, DJView, DJDeck, DJPlaylistModal (6), DJPlaylistPanel (4), DJModlandBrowser (5), tourScript on openDeckTrack / acquireForDeck; every Modland deck load carries companions (20 parsed with none before). Allowlist: 17 entries / 32 calls removed, 1 owner entry added (openDeckSong)
- [x] U2.7 UADE scan in a worker (measured 2026-10-07; see U2.7 result)
- [ ] U2.8 Hippel / MA walks in a worker
- [ ] U3a one audio export
- [ ] U3b one module / MIDI export input
- [ ] U4.1 guard final state

## Verification

Automated per unit: `npm run type-check`; the unit's new tests (each must fail
on the code before the unit - revert check); the guard; targeted existing
suites the unit touches (never the full suite by hand).

Manual (owner, LOCAL http://localhost:5174, after U2.1 and after U2.3):
1. Play an AHX, then in the jukebox pick a UADE song: the AHX stops at once,
   VU meters drop to zero and stay dark until the new song sounds (FAIL = bars
   frozen at the old height).
2. Drag a MOD in (per D1: no dialog unless it has a choice); it opens classic.
3. SID info dialog: load a tune from HVSC - it loads (FAIL today: nothing).
4. Modland browser: bob4e.dum loads with bob4.ins; then a Sonix song loads
   with its Instruments/ - no companion from bob4e left behind.
After U2.7: switch between two UADE songs while one plays - no audio dropout
before the switch.

## Success criteria

- Callers of parse/apply/companion/scan primitives outside the service: today
  (research 1) 22 DJ + 8 dialog/headless + 7 restore + 5 companion writers +
  9 companion acquirers -> 0 (guard).
- `'pending-import'` consumers: 8 -> 0; family C bugs: 2 -> 0.
- Old song silent before parse starts, on every path (reachability order test).
- No frozen meter after a switch (frame-age + generation tests).
- UADE switch: no audio-thread block from the scan (U2.7 sentinel + owner check).
- Audio export: 2 render strategies -> 1.

## Owner decisions (2026-10-07: "all recommended")
- D1: the import dialog on drag-drop shows only when there is a real choice (several subsongs, or libopenmpt vs native).
- D2: playback start stays per origin (drop does not start; jukebox, tour and embed do).
- D3: accepted - the old song stops before the parse, so a failed load leaves silence.
- D4: the dialog's Import no longer writes formatEngine settings.
- Live tab measurement for U2.7: APPROVED 2026-10-07 - an agent may load songs in the owner's open tab via MCP to time the UADE scan (never open a new tab; stop playback after).
