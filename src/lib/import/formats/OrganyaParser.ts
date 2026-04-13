/**
 * OrganyaParser.ts -- Organya (.org) format parser
 *
 * Organya is the music format used by Cave Story (Doukutsu Monogatari),
 * created by Daisuke "Pixel" Amaya. It uses 8 melody channels and 8 drum
 * channels for a total of 16 channels.
 *
 * Minimal stub parser that creates a TrackerSong for the WASM engine.
 * Since Organya playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like an Organya module.
 * Organya files begin with the ASCII magic bytes "Org-" at offset 0.
 */
export function isOrganyaFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  // "Org-" = 0x4F 0x72 0x67 0x2D
  return view[0] === 0x4F && view[1] === 0x72 && view[2] === 0x67 && view[3] === 0x2D;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an Organya module file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parseOrganyaFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (buffer.byteLength < 4) {
    throw new Error(
      `Invalid Organya file: too small (${buffer.byteLength} bytes, minimum 4)`
    );
  }

  if (!isOrganyaFormat(buffer)) {
    throw new Error('Invalid Organya file: missing "Org-" magic bytes');
  }

  const numChannels = 16; // 8 melody + 8 drum
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
      name: ch < 8 ? `Melody ${ch + 1}` : `Drum ${ch - 7}`,
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
      sourceFormat: 'Organya' as const,
      sourceFile: filename,
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
    name: `${baseName} [Organya]`,
    format: 'Organya' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    organyaFileData: buffer.slice(0),
  };
}
