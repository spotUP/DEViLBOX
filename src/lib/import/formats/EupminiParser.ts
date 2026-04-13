/**
 * EupminiParser.ts -- EUP (FM Towns) format parser
 *
 * EUP is a music format used by the Fujitsu FM Towns computer, featuring
 * 6 FM synthesis channels, 3 SSG channels, and 2 ADPCM channels (11 total).
 *
 * Minimal stub parser that creates a TrackerSong for the WASM engine.
 * Since EUP playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like an EUP file.
 * EUP files have a 32-byte title followed by track-to-channel mapping.
 * Validates header structure: bytes 32-47 should contain plausible
 * channel mapping values (0-15 for FM/SSG/PCM channels).
 */
export function isEupFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 100) return false;
  const view = new Uint8Array(data);
  // After the 32-byte title, bytes 32-47 contain track-to-channel mapping.
  // Valid channel numbers are 0-15 (FM=0-5, SSG=6-8, ADPCM=9-10, rhythm=11-15).
  // If most mapping bytes are in range, it's likely a valid EUP file.
  let validMappings = 0;
  for (let i = 32; i < 48 && i < view.length; i++) {
    if (view[i] <= 15) validMappings++;
  }
  return validMappings >= 12; // At least 12 of 16 mapping bytes are valid channels
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an EUP file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parseEupFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (data.byteLength < 100) {
    throw new Error(
      `Invalid EUP file: too small (${data.byteLength} bytes, minimum 100)`
    );
  }

  const numChannels = 11; // 6 FM + 3 SSG + 2 ADPCM
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
      pan: 0,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'EUP' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'FM Towns', type: 'synth' as const,
    synthType: 'EupminiSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [EUP]`,
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
    eupFileData: data.slice(0),
  };
}
