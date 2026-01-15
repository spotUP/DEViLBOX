/**
 * Export Functions - Song/SFX/Instrument Export Utilities
 */

import { saveAs } from 'file-saver';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { ProjectMetadata } from '@typedefs/project';

// Export Format Types
export interface SongExport {
  format: 'scribbleton-song';
  version: '1.0.0';
  metadata: ProjectMetadata;
  bpm: number;
  instruments: InstrumentConfig[];
  patterns: Pattern[];
  sequence: string[]; // Pattern IDs in playback order
  automation?: Record<string, any>;
  masterEffects?: EffectConfig[]; // Global effects chain
}

export interface SFXExport {
  format: 'scribbleton-sfx';
  version: '1.0.0';
  name: string;
  instrument: InstrumentConfig;
  pattern: Pattern;
  bpm: number;
}

export interface InstrumentExport {
  format: 'scribbleton-instrument';
  version: '1.0.0';
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
  automation: Record<string, any> | undefined,
  masterEffects: EffectConfig[] | undefined,
  options: ExportOptions = {}
): void {
  const songData: SongExport = {
    format: 'scribbleton-song',
    version: '1.0.0',
    metadata,
    bpm,
    instruments,
    patterns,
    sequence,
    ...(options.includeAutomation && automation ? { automation } : {}),
    ...(masterEffects && masterEffects.length > 0 ? { masterEffects } : {}),
  };

  const json = options.prettify
    ? JSON.stringify(songData, null, 2)
    : JSON.stringify(songData);

  const blob = new Blob([json], { type: 'application/json' });
  const filename = `${sanitizeFilename(metadata.name)}.song.json`;

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
    format: 'scribbleton-sfx',
    version: '1.0.0',
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
    format: 'scribbleton-instrument',
    version: '1.0.0',
    instrument,
  };

  const json = options.prettify
    ? JSON.stringify(instrumentData, null, 2)
    : JSON.stringify(instrumentData);

  const blob = new Blob([json], { type: 'application/json' });
  const filename = `${sanitizeFilename(instrument.name)}.inst.json`;

  saveAs(blob, filename);
}

/**
 * Import Song from JSON
 */
export async function importSong(file: File): Promise<SongExport | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as SongExport;

    if (data.format !== 'scribbleton-song') {
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

    if (data.format !== 'scribbleton-sfx') {
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

    if (data.format !== 'scribbleton-instrument') {
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

    if (data.format === 'scribbleton-song') return 'song';
    if (data.format === 'scribbleton-sfx') return 'sfx';
    if (data.format === 'scribbleton-instrument') return 'instrument';

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
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Validate exported data structure
 */
export function validateSongExport(data: any): data is SongExport {
  return (
    data &&
    data.format === 'scribbleton-song' &&
    data.version === '1.0.0' &&
    Array.isArray(data.instruments) &&
    Array.isArray(data.patterns) &&
    Array.isArray(data.sequence)
  );
}

export function validateSFXExport(data: any): data is SFXExport {
  return (
    data &&
    data.format === 'scribbleton-sfx' &&
    data.version === '1.0.0' &&
    data.instrument &&
    data.pattern
  );
}

export function validateInstrumentExport(data: any): data is InstrumentExport {
  return (
    data &&
    data.format === 'scribbleton-instrument' &&
    data.version === '1.0.0' &&
    data.instrument
  );
}
