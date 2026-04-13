/**
 * ZxtuneParser.ts -- ZXTune format parser for ZX Spectrum chiptune formats
 *
 * Supports ~35 ZX Spectrum tracker formats including PT3, PT2, STC, VTX, PSG,
 * AY, and many others. Since playback is handled entirely by the ZXTune WASM
 * engine (suppressNotes = true), the TrackerSong returned here is a minimal
 * shell with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like a known ZXTune-supported format by examining
 * magic bytes. For formats without clear magic, we rely on extension routing
 * in AmigaFormatParsers.ts and return true as a fallback.
 */
export function isZxtuneFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 2) return false;

  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 16));

  // AY: "ZXAYEMUL" at offset 0
  if (data.byteLength >= 8) {
    const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]);
    if (sig === 'ZXAYEMUL') return true;
  }

  // VTX: "ay" or "ym" at offset 0 (lowercase)
  if (bytes[0] === 0x61 && bytes[1] === 0x79) return true; // "ay"
  if (bytes[0] === 0x79 && bytes[1] === 0x6D) return true; // "ym"

  // PSG: 0x1A at offset 0 (PSG dump marker)
  if (bytes[0] === 0x1A) return true;

  // PT3: "ProTracker 3" or "Vortex Tracker" at offset 0
  if (data.byteLength >= 14) {
    const header = String.fromCharCode(...bytes.slice(0, 14));
    if (header.startsWith('ProTracker 3')) return true;
    if (header.startsWith('Vortex Tracker')) return true;
  }

  // STC: Check for typical STC structure - byte at offset 0 is tempo (1-31),
  // followed by position count and pattern data pointers
  if (data.byteLength >= 27) {
    const tempo = bytes[0];
    const posCount = bytes[1];
    if (tempo >= 1 && tempo <= 31 && posCount >= 1 && posCount <= 128) {
      // Plausible STC header - but this is weak, so only used after extension match
      return true;
    }
  }

  // For formats without clear magic bytes, return true when called from
  // extension-matched context in AmigaFormatParsers.ts
  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a ZXTune-supported file into a TrackerSong.
 *
 * Returns a minimal TrackerSong shell with one empty 3-channel pattern (AY has
 * 3 channels: A, B, C). The ZXTune WASM engine handles all actual playback.
 */
export async function parseZxtuneFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (data.byteLength < 2) {
    throw new Error(
      `Invalid ZXTune file: too small (${data.byteLength} bytes, minimum 2)`
    );
  }

  const numChannels = 3; // AY-3-8910/8912 has 3 channels: A, B, C
  const numRows = 64;
  const baseName = fileName.replace(/\.[^.]+$/, '');

  const channelNames = ['A', 'B', 'C'];

  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: channelNames[ch],
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 ? -50 : ch === 2 ? 50 : 0,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'ZXTune' as const,
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
    name: `${baseName} [ZXTune]`,
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
    zxtuneFileData: data.slice(0),
  };
}
