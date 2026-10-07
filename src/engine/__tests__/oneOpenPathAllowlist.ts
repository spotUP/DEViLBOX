/**
 * The owners of the song-open and export primitives (oneOpenPath.contract.test.ts,
 * plan 2026-10-07-one-load-save-export-path, U4.1: the guard's final state).
 *
 * Every entry is a PERMANENT owner: file + enclosing function + callee, with the
 * number of calls and the one-line reason it is the owner. Nothing else may call
 * parseModuleToSong / importTrackerModule / importModuleFile / prepareModuleImport /
 * applySong / the UADE companion writes and acquirers / the UADE scan / the native
 * export router / the OpenMPT, MOD, UADE and live-capture writers. Every opener
 * goes through openSong (or openDeckTrack / openSavedSong); every export through
 * audioExportService or moduleExportService. A new caller fails the guard, and so
 * does a lower count (the entry must then be lowered or removed).
 */
export interface AllowedCaller {
  file: string;
  fn: string;
  callee: string;
  count: number;
  /** Why this caller is an owner and not a bypass. */
  why: string;
}

const OPEN_SONG = 'openSong owner';
const BRANCH = 'openSong owner (branch bodies behind openSong: songBranches.ts is imported by openSong.ts only)';
const EXPORT_SERVICE = 'export service owner';

export const ALLOWED_CALLERS: readonly AllowedCaller[] = [
  // openSong and the branch bodies it routes to
  { file: 'src/lib/song/openSong.ts', fn: 'route', callee: 'importModuleFile', count: 1, why: OPEN_SONG },
  { file: 'src/lib/song/openSong.ts', fn: 'openStoredSong', callee: 'applySong', count: 1, why: `${OPEN_SONG}: a song already in hand (restore, tab, sync, project load) is applied by the opener that owns the unload` },
  { file: 'src/lib/song/openSong.ts', fn: 'openDeckSong', callee: 'parseModuleToSong', count: 1, why: `${OPEN_SONG}: the deck target parses on the deck's own UADE engine and applies nothing` },
  { file: 'src/lib/song/songBranches.ts', fn: 'importTrackerModuleUnloaded', callee: 'parseModuleToSong', count: 1, why: BRANCH },
  { file: 'src/lib/song/songBranches.ts', fn: 'importTrackerModuleUnloaded', callee: 'applySong', count: 1, why: BRANCH },
  { file: 'src/lib/song/songBranches.ts', fn: 'prepareModuleFile', callee: 'prepareModuleImport', count: 1, why: `${BRANCH}; prepareSong's one scan` },
  { file: 'src/lib/song/songBranches.ts', fn: 'importModuleFileUnloaded', callee: 'importTrackerModule', count: 1, why: BRANCH },
  { file: 'src/lib/song/songBranches.ts', fn: 'loadSongFile', callee: 'applySong', count: 4, why: `${BRANCH}: SunVox, MIDI, .dbx project, GoatTracker` },
  { file: 'src/lib/song/songBranches.ts', fn: 'loadSongFile', callee: 'importTrackerModule', count: 1, why: `${BRANCH}: an unknown-name file routed by header` },
  { file: 'src/lib/song/songBranches.ts', fn: 'loadV2MFile', callee: 'applySong', count: 1, why: BRANCH },
  { file: 'src/lib/song/songBranches.ts', fn: 'applyAdPlugSong', callee: 'applySong', count: 1, why: BRANCH },

  // Companion acquisition (the partner files of a multi-file format)
  { file: 'src/lib/song/acquireSource.ts', fn: 'acquireModlandCompanions', callee: 'downloadUADECompanions', count: 1, why: 'companion acquisition owner' },
  { file: 'src/lib/song/acquireSource.ts', fn: 'acquireNeighbourCompanions', callee: 'gatherCompanions', count: 1, why: 'companion acquisition owner' },
  { file: 'src/lib/modlandApi.ts', fn: 'modlandCompanions', callee: 'gatherCompanions', count: 1, why: 'Modland client: lists a song\'s partner files by Modland path; acquireSource reads through it' },

  // The UADE scan
  { file: 'src/engine/uade/UADEEngine.ts', fn: 'load', callee: 'scan', count: 1, why: 'UADE engine owner: the one scan per load, in the scan worker' },
  { file: 'src/workers/uade-scan.worker.ts', fn: '<module>', callee: 'scan', count: 1, why: 'UADE scan worker: hosts the worklet\'s scan' },

  // Modules an engine plays: the stores' native export, run through the parse a reload runs; no song applied, no store filled
  { file: 'src/engine/replayer/editedModuleForPlay.ts', fn: 'editedModuleForPlay', callee: 'exportNativeSong', count: 1, why: 'play-time module owner (G19): the module an engine is loaded with after a grid edit' },
  { file: 'src/engine/replayer/editedModuleForPlay.ts', fn: 'editedModuleForPlay', callee: 'parseModuleToSong', count: 1, why: 'play-time module owner (G19): reads back the re-encoded module the way a reload would' },
  { file: 'src/engine/uade/liveModuleEdits.ts', fn: 'run', callee: 'exportNativeSong', count: 1, why: 'live-edit module owner (G24): the diff of the native export is written where UADE plays the module' },

  // Export: the services and the writers they own
  { file: 'src/lib/export/moduleExportService.ts', fn: 'exportNativeFile', callee: 'exportNativeSong', count: 1, why: `${EXPORT_SERVICE}: the one door to the native export router, song read live` },
  { file: 'src/lib/export/moduleExportService.ts', fn: 'exportModuleFile', callee: 'exportWithOpenMPT', count: 1, why: EXPORT_SERVICE },
  { file: 'src/lib/export/moduleExportService.ts', fn: 'exportBakedMod', callee: 'exportSongToMOD', count: 1, why: EXPORT_SERVICE },
  { file: 'src/lib/export/audioExportService.ts', fn: 'exportAudio', callee: 'renderUADEToWav', count: 1, why: 'audio export owner: the explicit raw option' },
  { file: 'src/lib/export/audioExport.ts', fn: 'captureLiveSong', callee: 'captureAudioLiveToBuffer', count: 1, why: 'audio export owner: the live capture of the export tap' },
  { file: 'src/lib/export/nativeExportRouter.ts', fn: 'dispatchNativeExport', callee: 'exportSongToMOD', count: 1, why: 'native export router owner: the MOD dispatch' },
  { file: 'src/lib/export/MODExporter.ts', fn: 'exportAsMOD', callee: 'exportSongToMOD', count: 1, why: 'native export router owner: the Cinter4 export transforms the song before the MOD writer' },
];
