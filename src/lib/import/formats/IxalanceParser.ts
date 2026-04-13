/**
 * IxalanceParser.ts -- Ixalance (.ixs) format parser
 *
 * Ixalance is an extended Impulse Tracker format supporting up to 64 channels.
 * Since IXS playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like an Ixalance (IXS) file.
 * IXS files have "IXS!" magic bytes at offset 0.
 */
export function isIxsFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 32) return false;
  const view = new DataView(data);
  // "IXS!" = 0x49 0x58 0x53 0x21
  return view.getUint8(0) === 0x49 &&
         view.getUint8(1) === 0x58 &&
         view.getUint8(2) === 0x53 &&
         view.getUint8(3) === 0x21;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an Ixalance (IXS) module file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parseIxsFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (data.byteLength <= 100) {
    throw new Error(
      `Invalid IXS file: too small (${data.byteLength} bytes, minimum 100)`
    );
  }

  const numChannels = 64;
  const numRows = 64;
  const baseName = fileName.replace(/\.[^.]+$/, '');

  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch % 2 === 0 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'IXS' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'IxalanceSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [Ixalance]`,
    format: 'IXS' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    ixsFileData: data.slice(0),
  };
}
