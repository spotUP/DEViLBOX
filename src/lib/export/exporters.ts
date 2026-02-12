/**
 * Export Functions - Song/SFX/Instrument Export Utilities
 */

import { saveAs } from 'file-saver';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { ProjectMetadata } from '@typedefs/project';
import { APP_VERSION } from '@constants/version';
import type { AutomationCurve } from '@typedefs/automation';

// Export Format Types
export interface SongExport {
  format: 'devilbox-song';
  version: string;
  metadata: ProjectMetadata;
  bpm: number;
  instruments: InstrumentConfig[];
  patterns: Pattern[];
  sequence: string[]; // Pattern IDs in playback order
  automation?: Record<string, unknown>; // Legacy nested format or array of curves
  automationCurves?: AutomationCurve[]; // New: flat array of all automation curves
  masterEffects?: EffectConfig[]; // Global effects chain
  grooveTemplateId?: string; // Groove/swing template ID
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
  compress?: boolean;
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
  grooveTemplateId?: string
): void {
  const songData: SongExport = {
    format: 'devilbox-song',
    version: APP_VERSION,
    metadata,
    bpm,
    instruments,
    patterns,
    sequence,
    // Always include automation data (both formats for compatibility)
    ...(automation && Object.keys(automation).length > 0 ? { automation } : {}),
    ...(automationCurves && automationCurves.length > 0 ? { automationCurves } : {}),
    ...(masterEffects && masterEffects.length > 0 ? { masterEffects } : {}),
    // Include groove template if not the default
    ...(grooveTemplateId && grooveTemplateId !== 'straight' ? { grooveTemplateId } : {}),
  };

  const json = options.prettify
    ? JSON.stringify(songData, null, 2)
    : JSON.stringify(songData);

  const blob = new Blob([json], { type: 'application/json' });
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
 * Import Song from JSON
 */
export async function importSong(file: File): Promise<SongExport | null> {
  try {
    const text = await file.text();
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