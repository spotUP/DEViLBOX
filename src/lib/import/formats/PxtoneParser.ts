/**
 * PxtoneParser.ts -- PxTone Collage (.ptcop / .pttune) format parser
 *
 * PxTone Collage is a music creation tool by Studio Pixel (Daisuke Amaya),
 * known for the Cave Story soundtrack. Files use "PTTUNE" or "PTCOLLAGE"
 * magic signatures.
 *
 * Since PxTone playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like a PxTone Collage file.
 * PxTone files start with "PTTUNE" (6 bytes) or "PTCOLLAGE" (9 bytes).
 */
export function isPxtoneFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 9) return false;

  const bytes = new Uint8Array(data, 0, 9);

  // Check for "PTTUNE" (0x50 0x54 0x54 0x55 0x4E 0x45)
  if (
    bytes[0] === 0x50 && // P
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x55 && // U
    bytes[4] === 0x4E && // N
    bytes[5] === 0x45    // E
  ) {
    return true;
  }

  // Check for "PTCOLLAGE" (0x50 0x54 0x43 0x4F 0x4C 0x4C 0x41 0x47 0x45)
  if (
    bytes[0] === 0x50 && // P
    bytes[1] === 0x54 && // T
    bytes[2] === 0x43 && // C
    bytes[3] === 0x4F && // O
    bytes[4] === 0x4C && // L
    bytes[5] === 0x4C && // L
    bytes[6] === 0x41 && // A
    bytes[7] === 0x47 && // G
    bytes[8] === 0x45    // E
  ) {
    return true;
  }

  return false;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a PxTone Collage file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback -- this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parsePxtoneFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (!isPxtoneFormat(data)) {
    throw new Error('Invalid PxTone file: unrecognized magic bytes');
  }

  const numChannels = 4;
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
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [PxTone]`,
    format: 'PxTone' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    pxtoneFileData: data.slice(0),
  };
}
