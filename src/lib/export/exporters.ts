/**
 * Export Functions - Song/SFX/Instrument Export Utilities
 */

import { saveAs } from 'file-saver';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { ProjectMetadata } from '@typedefs/project';
import { APP_VERSION } from '@constants/version';
import type { AutomationCurve } from '@typedefs/automation';
import { useFormatStore } from '@stores/useFormatStore';
import type { DubBusSettings } from '@/types/dub';
import { useDubStore, type AutoDubPersonaId } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { compressProject, decompressProject } from '@/lib/projectCompression';

// ── Binary FileData field names in useFormatStore ──
// These are all the ArrayBuffer/Uint8Array fields that carry native engine data.
const BINARY_FILE_DATA_FIELDS = [
  'hivelyFileData', 'klysFileData', 'musiclineFileData', 'c64SidFileData',
  'goatTrackerData', 'jamCrackerFileData', 'futurePlayerFileData', 'preTrackerFileData',
  'maFileData', 'hippelFileData', 'sonixFileData', 'pxtoneFileData', 'organyaFileData', 'sawteethFileData',
  'eupFileData', 'ixsFileData', 'psycleFileData', 'sc68FileData', 'zxtuneFileData',
  'pumaTrackerFileData', 'steveTurnerFileData', 'sidmon1WasmFileData',
  'fredEditorWasmFileData', 'artOfNoiseFileData', 'qsfFileData', 'startrekkerAMFileData',
  'bdFileData', 'sd2FileData', 'symphonieFileData', 'uadeEditableFileData',
  'libopenmptFileData', 'v2mFileData',
] as const;

/** Encode an ArrayBuffer or Uint8Array to base64 */
function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Decode base64 to ArrayBuffer */
export function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Get the original module data for saving in .dbx files.
 * Prefers the already-encoded originalModuleData from format store,
 * falls back to encoding libopenmptFileData (ArrayBuffer) to base64.
 */
export function getOriginalModuleDataForExport(): { base64: string; format: string; sourceFile?: string } | null {
  const { originalModuleData, libopenmptFileData } = useFormatStore.getState();
  if (originalModuleData?.base64) return originalModuleData;
  if (libopenmptFileData) {
    const bytes = new Uint8Array(libopenmptFileData);
    // Detect format from magic bytes
    let format = 'UNKNOWN';
    if (bytes.length > 60) {
      const magic4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (magic4 === 'IMPM') format = 'IT';
      else if (bytes[44] === 0x53 && bytes[45] === 0x43 && bytes[46] === 0x52 && bytes[47] === 0x4D) format = 'S3M';
      else {
        const xmSig = String.fromCharCode(...bytes.slice(0, 17));
        if (xmSig === 'Extended Module: ') format = 'XM';
        else if (bytes.length > 1083) {
          const modId = String.fromCharCode(bytes[1080], bytes[1081], bytes[1082], bytes[1083]);
          if (['M.K.', 'M!K!', 'FLT4', 'FLT8', '4CHN', '6CHN', '8CHN'].includes(modId)) format = 'MOD';
        }
      }
    }
    return { base64: bufferToBase64(libopenmptFileData), format };
  }
  return null;
}

/**
 * Collect all native engine binary data from the format store as base64.
 * Returns a map of { fieldName: base64String } for all non-null FileData fields.
 */
export function getNativeEngineDataForExport(): Record<string, string> | null {
  const state = useFormatStore.getState() as unknown as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const field of BINARY_FILE_DATA_FIELDS) {
    const val = state[field];
    if (val && (val instanceof ArrayBuffer || val instanceof Uint8Array)) {
      result[field] = bufferToBase64(val as ArrayBuffer | Uint8Array);
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Collect JSON-serializable native engine metadata for saving.
 */
export function getNativeEngineMetaForExport(): Record<string, unknown> | null {
  const state = useFormatStore.getState();
  const result: Record<string, unknown> = {};
  if (state.furnaceNative) result.furnaceNative = state.furnaceNative;
  if (state.hivelyNative) result.hivelyNative = state.hivelyNative;
  if (state.klysNative) result.klysNative = state.klysNative;
  if (state.hivelyMeta) result.hivelyMeta = state.hivelyMeta;
  if (state.furnaceSubsongs) result.furnaceSubsongs = state.furnaceSubsongs;
  if (state.furnaceActiveSubsong) result.furnaceActiveSubsong = state.furnaceActiveSubsong;
  if (state.channelTrackTables) result.channelTrackTables = state.channelTrackTables;
  if (state.channelSpeeds) result.channelSpeeds = state.channelSpeeds;
  if (state.channelGrooves) result.channelGrooves = state.channelGrooves;
  if (state.uadeEditableFileName) result.uadeEditableFileName = state.uadeEditableFileName;
  if (state.uadeEditableSubsongs) result.uadeEditableSubsongs = state.uadeEditableSubsongs;
  if (state.editorMode !== 'classic') result.editorMode = state.editorMode;
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Restore native engine data into format store from saved .dbx data.
 * Decodes base64 binaries, reconstructs a song-like object, and calls applyEditorMode.
 */
export function restoreNativeEngineData(
  nativeEngineData: Record<string, string> | undefined,
  nativeEngineMeta: Record<string, unknown> | undefined,
  linearPeriods?: boolean,
): void {
  if (!nativeEngineData && !nativeEngineMeta) return;

  // Build a song-like object for applyEditorMode
  const songObj: Record<string, unknown> = { linearPeriods: linearPeriods ?? false };

  // Decode binary fields
  if (nativeEngineData) {
    for (const [field, b64] of Object.entries(nativeEngineData)) {
      const buf = base64ToBuffer(b64);
      // c64SidFileData, goatTrackerData, musiclineFileData are Uint8Array in the store
      if (field === 'c64SidFileData' || field === 'goatTrackerData' || field === 'musiclineFileData') {
        songObj[field] = new Uint8Array(buf);
      } else {
        songObj[field] = buf;
      }
    }
  }

  // Copy JSON-serializable metadata
  if (nativeEngineMeta) {
    for (const [key, val] of Object.entries(nativeEngineMeta)) {
      if (key !== 'editorMode') {
        songObj[key] = val;
      }
    }
  }

  const fmtStore = useFormatStore.getState();
  fmtStore.applyEditorMode(songObj as any);

  // Restore originalModuleData separately (not handled by applyEditorMode)
  // This is already handled by the caller if present
}

// Export Format Types
export interface SongExport {
  format: 'devilbox-song';
  version: string;
  metadata: ProjectMetadata;
  bpm: number;
  instruments: InstrumentConfig[];
  patterns: Pattern[];
  sequence: string[]; // Pattern IDs in playback order
  patternOrder?: number[]; // Actual playback order (may have repeats)
  automation?: Record<string, unknown>; // Legacy nested format or array of curves
  automationCurves?: AutomationCurve[]; // New: flat array of all automation curves
  masterEffects?: EffectConfig[]; // Global effects chain
  grooveTemplateId?: string; // Groove/swing template ID
  speed?: number; // Ticks per row (default 6)
  trackerFormat?: string; // 'MOD' | 'XM' | 'IT' | 'S3M' | etc.
  linearPeriods?: boolean; // XM linear frequency mode
  restartPosition?: number; // Song loop point
  originalModuleData?: { base64: string; format: string; sourceFile?: string }; // Original module for libopenmpt playback
  nativeEngineData?: Record<string, string>; // Base64-encoded binary FileData for native WASM engines
  nativeEngineMeta?: Record<string, unknown>; // JSON-serializable native engine metadata
  replacedInstruments?: number[]; // Instrument IDs replaced with synths for hybrid playback

  /** Mixer state — channel volumes, pans, mutes, solos, dub sends, send buses.
   *  Partial so older .dbx files without mixer state still load cleanly. */
  mixer?: import('@stores/useMixerStore').MixerSnapshot;

  /** Dub bus tuning — character preset (Tubby/Scientist/…), echo/spring/
   *  tape-sat params, HPF, EQ, stereo width. Without this block a saved
   *  .dbx would reload with DEFAULT_DUB_BUS and lose every sound-design
   *  tweak the user made. Partial so older .dbx files missing newer fields
   *  still load — loader spreads over DEFAULT_DUB_BUS. */
  dubBus?: Partial<DubBusSettings>;

  /** Auto Dub state — enabled flag, persona, intensity, per-session
   *  move blacklist. Written on export, restored on import so a saved
   *  performance keeps its autonomous-performer context. */
  autoDub?: {
    enabled: boolean;
    persona: AutoDubPersonaId;
    intensity: number;
    moveBlacklist: string[];
  };
}

export interface SFXExport {
  format: 'devilbox-sfx';
  version: string;
  name: string;
  instrument: InstrumentConfig;
  pattern: Pattern;
  bpm: number;
}

export interface InstrumentExport {
  format: 'devilbox-instrument';
  version: string;
  instrument: InstrumentConfig;
}

export interface ExportOptions {
  includeAutomation?: boolean;
  prettify?: boolean;
}

/**
 * Export full song (all patterns, instruments, sequence)
 */
export function exportSong(
  metadata: ProjectMetadata,
  bpm: number,
  instruments: InstrumentConfig[],
  patterns: Pattern[],
  sequence: string[],
  automation: Record<string, unknown> | undefined,
  masterEffects: EffectConfig[] | undefined,
  automationCurves: AutomationCurve[] | undefined,
  options: ExportOptions = {},
  grooveTemplateId?: string,
  playbackState?: { speed?: number; trackerFormat?: string; linearPeriods?: boolean; restartPosition?: number },
  patternOrder?: number[],
  originalModuleData?: { base64: string; format: string; sourceFile?: string } | null,
): void {
  const songData: SongExport = {
    format: 'devilbox-song',
    version: APP_VERSION,
    metadata,
    bpm,
    instruments,
    patterns,
    sequence,
    // Actual playback order (may have repeats — sequence is just unique pattern IDs)
    ...(patternOrder && patternOrder.length > 0 ? { patternOrder } : {}),
    // Always include automation data (both formats for compatibility)
    ...(automation && Object.keys(automation).length > 0 ? { automation } : {}),
    ...(automationCurves && automationCurves.length > 0 ? { automationCurves } : {}),
    ...(masterEffects && masterEffects.length > 0 ? { masterEffects } : {}),
    // Include groove template if not the default
    ...(grooveTemplateId && grooveTemplateId !== 'straight' ? { grooveTemplateId } : {}),
    // Playback parameters for format-accurate reload
    ...(playbackState?.speed != null && playbackState.speed !== 6 ? { speed: playbackState.speed } : {}),
    ...(playbackState?.trackerFormat ? { trackerFormat: playbackState.trackerFormat } : {}),
    ...(playbackState?.linearPeriods ? { linearPeriods: playbackState.linearPeriods } : {}),
    ...(playbackState?.restartPosition ? { restartPosition: playbackState.restartPosition } : {}),
    // Original module data for libopenmpt-based playback roundtrip
    ...(originalModuleData?.base64 ? { originalModuleData } : {}),
    // Native engine binary data (all WASM engine formats)
    ...(() => {
      const ned = getNativeEngineDataForExport();
      return ned ? { nativeEngineData: ned } : {};
    })(),
    ...(() => {
      const nem = getNativeEngineMetaForExport();
      return nem ? { nativeEngineMeta: nem } : {};
    })(),
    // Replaced instrument IDs for hybrid WASM/ToneEngine playback
    ...(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTrackerReplayer } = require('@engine/TrackerReplayer');
        const replayer = getTrackerReplayer();
        if (replayer.hasReplacedInstruments) {
          return { replacedInstruments: replayer.replacedInstrumentIds };
        }
      } catch { /* replayer not initialized */ }
      return {};
    })(),
    // Dub bus tuning snapshot — character preset + all 30+ coloring params.
    // Captures whatever the user has tuned so reload restores every knob.
    ...(() => {
      try {
        const dubBus = useDrumPadStore.getState().dubBus;
        return dubBus ? { dubBus } : {};
      } catch { return {}; }
    })(),
    // Mixer state — channel volumes, pans, mutes, solos, dub sends, send buses.
    ...(() => {
      try {
        const { useMixerStore } = require('@stores/useMixerStore');
        const state = useMixerStore.getState();
        return {
          mixer: {
            channels: state.channels,
            master: state.master,
            sendBuses: state.sendBuses,
          },
        };
      } catch { return {}; }
    })(),
    // Auto Dub state — enabled, persona, intensity, move blacklist.
    ...(() => {
      try {
        const s = useDubStore.getState();
        return {
          autoDub: {
            enabled: s.autoDubEnabled,
            persona: s.autoDubPersona,
            intensity: s.autoDubIntensity,
            moveBlacklist: s.autoDubMoveBlacklist ?? [],
          },
        };
      } catch { return {}; }
    })(),
  };

  const json = options.prettify
    ? JSON.stringify(songData, null, 2)
    : JSON.stringify(songData);

  const compressed = compressProject(json);
  const blob = new Blob([compressed], { type: 'application/octet-stream' });
  const filename = `${sanitizeFilename(metadata.name)}.dbx`;

  saveAs(blob, filename);
}

/**
 * Export single pattern as SFX (one-shot sound effect)
 */
export function exportSFX(
  name: string,
  instrument: InstrumentConfig,
  pattern: Pattern,
  bpm: number,
  options: ExportOptions = {}
): void {
  const sfxData: SFXExport = {
    format: 'devilbox-sfx',
    version: APP_VERSION,
    name,
    instrument,
    pattern,
    bpm,
  };

  const json = options.prettify
    ? JSON.stringify(sfxData, null, 2)
    : JSON.stringify(sfxData);

  const blob = new Blob([json], { type: 'application/json' });
  const filename = `${sanitizeFilename(name)}.sfx.json`;

  saveAs(blob, filename);
}

/**
 * Export single instrument for sharing
 */
export function exportInstrument(
  instrument: InstrumentConfig,
  options: ExportOptions = {}
): void {
  const instrumentData: InstrumentExport = {
    format: 'devilbox-instrument',
    version: APP_VERSION,
    instrument,
  };

  const json = options.prettify
    ? JSON.stringify(instrumentData, null, 2)
    : JSON.stringify(instrumentData);

  const blob = new Blob([json], { type: 'application/json' });
  const filename = `${sanitizeFilename(instrument.name)}.dbi`;

  saveAs(blob, filename);
}

/**
 * Import Song from file (supports both DVBZ compressed and raw JSON)
 */
export async function importSong(file: File): Promise<SongExport | null> {
  try {
    const buffer = await file.arrayBuffer();
    const text = decompressProject(buffer);
    const data = JSON.parse(text) as SongExport;

    if (data.format !== 'devilbox-song') {
      throw new Error('Invalid song format');
    }

    return data;
  } catch (error) {
    console.error('Failed to import song:', error);
    return null;
  }
}

/**
 * Import SFX from JSON
 */
export async function importSFX(file: File): Promise<SFXExport | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as SFXExport;

    if (data.format !== 'devilbox-sfx') {
      throw new Error('Invalid SFX format');
    }

    return data;
  } catch (error) {
    console.error('Failed to import SFX:', error);
    return null;
  }
}

/**
 * Import Instrument from JSON
 */
export async function importInstrument(file: File): Promise<InstrumentExport | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as InstrumentExport;

    if (data.format !== 'devilbox-instrument') {
      throw new Error('Invalid instrument format');
    }

    return data;
  } catch (error) {
    console.error('Failed to import instrument:', error);
    return null;
  }
}

/**
 * Detect file format from content
 */
export async function detectFileFormat(file: File): Promise<'song' | 'sfx' | 'instrument' | 'unknown'> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.format === 'devilbox-song') return 'song';
    if (data.format === 'devilbox-sfx') return 'sfx';
    if (data.format === 'devilbox-instrument') return 'instrument';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Sanitize filename for safe file system usage
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Validate exported data structure
 */
export function validateSongExport(data: any): data is SongExport { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    data &&
    data.format === 'devilbox-song' &&
    data.version === APP_VERSION &&
    Array.isArray(data.instruments) &&
    Array.isArray(data.patterns) &&
    Array.isArray(data.sequence)
  );
}

export function validateSFXExport(data: any): data is SFXExport { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    data &&
    data.format === 'devilbox-sfx' &&
    data.version === APP_VERSION &&
    data.instrument &&
    data.pattern
  );
}

export function validateInstrumentExport(data: any): data is InstrumentExport { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    data &&
    data.format === 'devilbox-instrument' &&
    data.version === APP_VERSION &&
    data.instrument
  );
}