/**
 * Single source of truth: every `TrackerSong` field that carries raw binary
 * native-engine data and must survive a project save/reload (.dbx / IndexedDB).
 *
 * The persistence layer (`src/lib/export/exporters.ts`) base64-encodes exactly
 * these fields out of `useFormatStore` on save and decodes them back in on load.
 * Previously this list was a hand-maintained 30-entry allowlist in
 * `exporters.ts` that had drifted far behind the ~60 `*FileData` fields on
 * `TrackerSong`, so ~30 formats silently lost their engine bytes on save.
 *
 * Keep this list in sync with `TrackerSong` — the completeness ratchet test
 * `src/lib/export/__tests__/fileDataFieldsComplete.test.ts` fails when a new
 * `*FileData` / `*RawData` / `*SmplData` field is added to `TrackerSong` but not
 * mirrored here (with a small, documented exclusion set for fields that are not
 * carried in `useFormatStore`).
 *
 * SCOPE: only plain `ArrayBuffer` / `Uint8Array` buffers that `useFormatStore`
 * holds. Companion/sidecar collections (`sonixSidecarFiles`,
 * `uadeCompanionFiles`) are NOT here — they are serialized separately by the
 * companion-file path in `exporters.ts` because they are arrays/maps, not
 * single buffers.
 */

import type { TrackerSong } from './TrackerReplayer';

export const FILE_DATA_FIELDS = [
  // — WASM-engine module binaries (ArrayBuffer unless noted) —
  'hivelyFileData',
  'klysFileData',
  'musiclineFileData',        // Uint8Array in store
  'c64SidFileData',           // Uint8Array in store
  'goatTrackerData',          // Uint8Array in store
  'cheeseCutterFileData',
  'jamCrackerFileData',
  'futurePlayerFileData',
  'preTrackerFileData',
  'maFileData',
  'hippelFileData',
  'sonixFileData',
  'pxtoneFileData',
  'organyaFileData',
  'sawteethFileData',
  'eupFileData',
  'ixsFileData',
  'psycleFileData',
  'sc68FileData',
  'zxtuneFileData',
  'pumaTrackerFileData',
  'steveTurnerFileData',
  'sidmon1WasmFileData',
  'fredEditorWasmFileData',
  'artOfNoiseFileData',
  'cinter4FileData',
  'cinter4RawData',           // companion raw-sample PCM buffer for Cinter4
  'fmplayerFileData',
  'qsfFileData',
  'startrekkerAMFileData',
  'startrekkerAMNtData',      // companion .nt synth data for Startrekker AM
  'soundMonFileData',
  'sonicArrangerFileData',
  'robHubbardFileData',
  'digMugFileData',
  'coreDesignFileData',
  'davidWhittakerFileData',
  'soundControlFileData',
  'deltaMusic1FileData',
  'deltaMusic2FileData',
  'soundFxFileData',
  'gmcFileData',
  'voodooFileData',
  'bdFileData',
  'sd2FileData',
  'fredReplayerFileData',
  'oktalyzerFileData',
  'inStereo1FileData',
  'inStereo2FileData',
  'futureComposerFileData',
  'quadraComposerFileData',
  'ronKlarenFileData',
  'actionamicsFileData',
  'activisionProFileData',
  'synthesisFileData',
  'dssFileData',
  'soundFactoryFileData',
  'faceTheMusicFileData',
  'symphonieFileData',
  'v2mFileData',
  'uadeEditableFileData',
  'maxTraxFileData',
  'adplugFileData',
  'tfmxFileData',
  'tfmxSmplData',             // companion sample data for TFMX
  'libopenmptFileData',
] as const satisfies readonly (keyof TrackerSong)[];

export type FileDataField = (typeof FILE_DATA_FIELDS)[number];
