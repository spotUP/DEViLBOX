/**
 * CpsycleParser.ts -- Psycle tracker (.psy) format parser
 *
 * Psycle is an open-source modular music tracker for Windows. It supports
 * PSY3 (current) and PSY2 (legacy) file formats. PSY3 files begin with
 * "PSY3SONG" and PSY2 files begin with "PSY2SONG".
 *
 * Since Psycle playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

const PSY3_MAGIC = 'PSY3SONG';
const PSY2_MAGIC = 'PSY2SONG';

/**
 * Check if a buffer looks like a Psycle module (PSY2 or PSY3).
 * Both formats start with an 8-byte ASCII magic string.
 */
export function isPsycleFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) return false;

  const header = new Uint8Array(data, 0, 8);
  let magic = '';
  for (let i = 0; i < 8; i++) {
    magic += String.fromCharCode(header[i]);
  }

  return magic === PSY3_MAGIC || magic === PSY2_MAGIC;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Psycle module file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern. The WASM engine
 * handles all actual playback -- this provides the TrackerSong shell that
 * the UI/store layer expects.
 */
export async function parsePsycleFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isPsycleFormat(buffer)) {
    throw new Error('Invalid Psycle file: missing PSY2SONG or PSY3SONG magic');
  }

  const numChannels = 64;
  const numRows = 64;
  const baseName = filename.replace(/\.[^.]+$/, '');

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
      pan: 0,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'Psycle' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Machine 1', type: 'synth' as const,
    synthType: 'CpsycleSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [Psycle]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    psycleFileData: buffer.slice(0),
  };
}
