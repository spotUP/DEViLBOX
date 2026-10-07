/**
 * Allowlist for oneOpenPath.contract.test.ts (plan 2026-10-07-one-load-save-export-path, U4.0).
 *
 * Every entry is a TODAY caller of a restricted song-open / export function:
 * file + enclosing function + callee, with the number of calls. `removedBy`
 * names the plan phase that deletes the entry. The guard only ratchets down:
 * a new caller fails, and so does a LOWER count until the entry here is
 * lowered or removed. Phases shrink this file; U4.1 leaves only the
 * permanent owners.
 */
export interface AllowedCaller {
  file: string;
  fn: string;
  callee: string;
  count: number;
  removedBy: string;
}

export const ALLOWED_CALLERS: readonly AllowedCaller[] = [
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportNative', callee: 'exportNativeSong', count: 1, removedBy: 'U4.1 (stays: caller of the one native export router, song read live)' },
  { file: 'src/components/tracker/FT2Toolbar/FT2Toolbar.tsx', fn: 'handleSave', callee: 'exportNativeSong', count: 1, removedBy: 'U4.1 (stays: caller of the one native export router, song read live)' },
  { file: 'src/components/tracker/MaxTraxView.tsx', fn: 'runExportDownload', callee: 'exportNativeSong', count: 1, removedBy: 'U4.1 (stays: caller of the one native export router, song read live)' },
  // Play-time re-encode (G19): the module an engine is loaded with after a grid edit is the native export of the stores run through the parse a reload runs; it applies no song and fills no store.
  { file: 'src/engine/replayer/editedModuleForPlay.ts', fn: 'editedModuleForPlay', callee: 'exportNativeSong', count: 1, removedBy: 'U4.1 (stays: play-time module owner)' },
  { file: 'src/engine/replayer/editedModuleForPlay.ts', fn: 'editedModuleForPlay', callee: 'parseModuleToSong', count: 1, removedBy: 'U4.1 (stays: play-time module owner)' },
  { file: 'src/hooks/dialogs/useExportDialog.ts', fn: 'useExportDialog', callee: 'exportNativeSong', count: 1, removedBy: 'U4.1 (stays: caller of the one native export router, song read live)' },
  { file: 'src/lib/export/MODExporter.ts', fn: 'exportAsMOD', callee: 'exportSongToMOD', count: 1, removedBy: 'U4.1 (stays: Cinter4 export transforms the song before the MOD writer)' },
  { file: 'src/lib/export/audioExport.ts', fn: 'captureLiveSong', callee: 'captureAudioLiveToBuffer', count: 1, removedBy: 'U4.1 (stays: audio export owner)' },
  // The one audio export (U3a) and the one module / MIDI input (U3b): the services are the owners.
  { file: 'src/lib/export/audioExportService.ts', fn: 'exportAudio', callee: 'renderUADEToWav', count: 1, removedBy: 'U4.1 (stays: audio export owner)' },
  { file: 'src/lib/export/moduleExportService.ts', fn: 'exportModuleFile', callee: 'exportWithOpenMPT', count: 1, removedBy: 'U4.1 (stays: module export owner)' },
  { file: 'src/lib/export/moduleExportService.ts', fn: 'exportBakedMod', callee: 'exportSongToMOD', count: 1, removedBy: 'U4.1 (stays: module export owner)' },
  { file: 'src/lib/export/nativeExportRouter.ts', fn: 'dispatchNativeExport', callee: 'exportSongToMOD', count: 1, removedBy: 'U4.1 (stays: the native export router owns the MOD dispatch)' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'applyAdPlugSong', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importModuleFileUnloaded', callee: 'importTrackerModule', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'prepareModuleFile', callee: 'prepareModuleImport', count: 1, removedBy: 'U4.1 (stays: openSong owner)' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importTrackerModuleUnloaded', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importTrackerModuleUnloaded', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadSongFile', callee: 'applySong', count: 4, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadSongFile', callee: 'importTrackerModule', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadV2MFile', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  // A song already in hand (restore, tab, sync, project load, export-dialog import) is applied by the one opener that owns the unload.
  { file: 'src/lib/song/openSong.ts', fn: 'openStoredSong', callee: 'applySong', count: 1, removedBy: 'U4.1 (stays: openSong owner)' },
  { file: 'src/lib/song/openSong.ts', fn: 'openDeckSong', callee: 'parseModuleToSong', count: 1, removedBy: 'U4.1 (stays: openSong deck target)' },
  { file: 'src/lib/song/openSong.ts', fn: 'route', callee: 'importModuleFile', count: 1, removedBy: 'U4.1 (stays: openSong owner)' },
  { file: 'src/lib/song/acquireSource.ts', fn: 'acquireModlandCompanions', callee: 'downloadUADECompanions', count: 1, removedBy: 'U4.1 (stays: companion acquisition owner)' },
  { file: 'src/lib/song/acquireSource.ts', fn: 'acquireNeighbourCompanions', callee: 'gatherCompanions', count: 1, removedBy: 'U4.1 (stays: companion acquisition owner)' },
  { file: 'src/lib/modlandApi.ts', fn: 'modlandCompanions', callee: 'gatherCompanions', count: 1, removedBy: 'U4.1 (stays: companion acquisition owner)' },
];
