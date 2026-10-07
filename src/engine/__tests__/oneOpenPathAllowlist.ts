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
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportMod', callee: 'exportWithOpenMPT', count: 1, removedBy: 'U3b' },
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportNative', callee: 'exportNativeSong', count: 1, removedBy: 'U3b' },
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportWav', callee: 'captureAudioLiveToBuffer', count: 1, removedBy: 'U3a' },
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportWav', callee: 'renderPatternToAudio', count: 2, removedBy: 'U3a' },
  { file: 'src/bridge/handlers/writeHandlers.ts', fn: 'exportWav', callee: 'renderUADEToWav', count: 1, removedBy: 'U3a' },
  { file: 'src/components/dialogs/FilePreviewPanel.tsx', fn: 'ModlandPanel', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/components/dialogs/FilePreviewPanel.tsx', fn: 'OnlinePanel', callee: 'addCompanionFile', count: 1, removedBy: 'U2.5' },
  { file: 'src/components/dialogs/FilePreviewPanel.tsx', fn: 'OnlinePanel', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/components/dialogs/ImportModuleDialog.tsx', fn: 'ImportModuleDialog', callee: 'prepareModuleImport', count: 1, removedBy: 'U2.3' },
  { file: 'src/components/dialogs/useFileNavigation.ts', fn: 'handleLoad', callee: 'gatherCompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/components/dj/DJDeck.tsx', fn: 'DJDeck', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJFileBrowser.tsx', fn: 'DJFileBrowser', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJModlandBrowser.tsx', fn: 'DJModlandBrowser', callee: 'addCompanionFile', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJModlandBrowser.tsx', fn: 'DJModlandBrowser', callee: 'downloadUADECompanions', count: 3, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJModlandBrowser.tsx', fn: 'DJModlandBrowser', callee: 'parseModuleToSong', count: 2, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJPlaylistModal.tsx', fn: 'DJPlaylistModalContent', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJPlaylistModal.tsx', fn: 'DJPlaylistModalContent', callee: 'parseModuleToSong', count: 6, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJPlaylistPanel.tsx', fn: 'DJPlaylistPanel', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJPlaylistPanel.tsx', fn: 'DJPlaylistPanel', callee: 'parseModuleToSong', count: 4, removedBy: 'U2.6b' },
  { file: 'src/components/dj/DJView.tsx', fn: 'DJView', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.6b' },
  { file: 'src/components/instruments/controls/OctaMEDControls.tsx', fn: 'OctaMEDControls', callee: 'exportSongToMOD', count: 1, removedBy: 'U3b' },
  { file: 'src/components/tracker/FT2Toolbar/FT2Toolbar.tsx', fn: 'handleSave', callee: 'exportNativeSong', count: 1, removedBy: 'U3b' },
  { file: 'src/components/tracker/FT2Toolbar/FT2Toolbar.tsx', fn: 'handleSave', callee: 'exportWithOpenMPT', count: 1, removedBy: 'U3b' },
  { file: 'src/components/tracker/MaxTraxView.tsx', fn: 'runExportDownload', callee: 'exportNativeSong', count: 1, removedBy: 'U3b' },
  { file: 'src/engine/dj/DJPlaylistAnalyzer.ts', fn: 'analyzePlaylist', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJPlaylistPrecache.ts', fn: 'precachePlaylist', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJTrackLoader.ts', fn: 'loadPlaylistTrackToDeckInternal', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJTrackLoader.ts', fn: 'loadPlaylistTrackToDeckInternal', callee: 'parseModuleToSong', count: 3, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJTrackLoader.ts', fn: 'preRenderTrackInternal', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJTrackLoader.ts', fn: 'preRenderTrackInternal', callee: 'parseModuleToSong', count: 3, removedBy: 'U2.6a' },
  { file: 'src/engine/dj/DJUADEPrerender.ts', fn: 'loadUADEToDeck', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.6a' },
  { file: 'src/engine/tour/tourScript.ts', fn: 'searchAndLoadModland', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.6b' },
  { file: 'src/engine/uade/UADEEngine.ts', fn: 'loadTune', callee: 'addCompanionFile', count: 1, removedBy: 'U4.1 (stays: UADE engine family)' },
  { file: 'src/engine/uade/UADESynth.ts', fn: 'setInstrument', callee: 'addCompanionFile', count: 1, removedBy: 'U4.1 (stays: UADE engine family)' },
  { file: 'src/hooks/dialogs/useExportDialog.ts', fn: 'useExportDialog', callee: 'applySong', count: 1, removedBy: 'U2.4' },
  { file: 'src/hooks/dialogs/useExportDialog.ts', fn: 'useExportDialog', callee: 'exportNativeSong', count: 1, removedBy: 'U3b' },
  { file: 'src/hooks/tracker/useModuleImport.ts', fn: 'useModuleImport', callee: 'importTrackerModule', count: 1, removedBy: 'U2.3' },
  { file: 'src/hooks/useProjectPersistence.ts', fn: 'applySavedProject', callee: 'applySong', count: 1, removedBy: 'U2.4' },
  { file: 'src/hooks/useProjectPersistence.ts', fn: 'loadLocalRevision', callee: 'applySong', count: 1, removedBy: 'U2.4' },
  { file: 'src/hooks/useProjectPersistence.ts', fn: 'loadProjectFromObject', callee: 'applySong', count: 1, removedBy: 'U2.4' },
  { file: 'src/lib/collaboration/SongSyncLayer.ts', fn: 'applyRemotePatch', callee: 'applySong', count: 1, removedBy: 'U2.4' },
  { file: 'src/lib/export/Cinter4ModSave.ts', fn: 'exportCinterModFile', callee: 'exportWithOpenMPT', count: 1, removedBy: 'U3b' },
  { file: 'src/lib/export/MODExporter.ts', fn: 'exportAsMOD', callee: 'exportSongToMOD', count: 1, removedBy: 'U3b' },
  { file: 'src/lib/export/ModuleExportPanel.tsx', fn: 'ModuleExportPanel', callee: 'exportWithOpenMPT', count: 1, removedBy: 'U3b' },
  { file: 'src/lib/export/audioExport.ts', fn: 'captureAudioLive', callee: 'captureAudioLiveToBuffer', count: 1, removedBy: 'U3a' },
  { file: 'src/lib/export/audioExport.ts', fn: 'captureLiveSong', callee: 'captureAudioLiveToBuffer', count: 1, removedBy: 'U3a' },
  { file: 'src/lib/export/audioExport.ts', fn: 'exportUADEAsWav', callee: 'renderUADEToWav', count: 1, removedBy: 'U3a' },
  { file: 'src/lib/export/nativeExportRouter.ts', fn: 'dispatchNativeExport', callee: 'exportSongToMOD', count: 1, removedBy: 'U3b' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'applyAdPlugSong', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importModuleFileUnloaded', callee: 'importTrackerModule', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importModuleFileUnloaded', callee: 'prepareModuleImport', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importTrackerModuleUnloaded', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'importTrackerModuleUnloaded', callee: 'parseModuleToSong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadSongFile', callee: 'applySong', count: 4, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadSongFile', callee: 'importTrackerModule', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/file/UnifiedFileLoader.ts', fn: 'loadV2MFile', callee: 'applySong', count: 1, removedBy: 'U2.2' },
  { file: 'src/lib/import/formats/UADEParser.ts', fn: 'parseUADEFile', callee: 'addCompanionFile', count: 1, removedBy: 'U4.1 (stays: UADE engine family)' },
  { file: 'src/lib/import/prepareModuleImport.ts', fn: 'prepareModuleImport', callee: 'addCompanionFile', count: 1, removedBy: 'U2.5' },
  { file: 'src/lib/song/openSong.ts', fn: 'acquire', callee: 'downloadUADECompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/lib/song/openSong.ts', fn: 'acquire', callee: 'gatherCompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/lib/song/openSong.ts', fn: 'route', callee: 'importModuleFile', count: 1, removedBy: 'U4.1 (stays: openSong owner)' },
  { file: 'src/lib/modlandApi.ts', fn: 'modlandCompanions', callee: 'gatherCompanions', count: 1, removedBy: 'U2.5' },
  { file: 'src/stores/useTabsStore.ts', fn: 'restoreState', callee: 'applySong', count: 1, removedBy: 'U2.4' },
];
