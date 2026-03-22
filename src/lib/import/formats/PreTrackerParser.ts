/**
 * PreTrackerParser.ts -- PreTracker (.prt) format parser
 *
 * PreTracker is a Commodore Amiga tracker by Ratt/Abyss. It uses a 4-channel
 * MOD-based format with its own header signature.
 *
 * Phase 10: Minimal stub parser that creates a TrackerSong for the WASM engine.
 * Full pattern/sample extraction deferred to Phase 12 when the WASM module
 * exposes pattern data accessors.
 *
 * Since PreTracker playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like a PreTracker module.
 * PreTracker files are identified by examining the binary structure.
 * Minimum viable size is 36 bytes (header area).
 */
export function isPreTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 36) return false;
  // No known magic bytes — PreTracker has no published format spec.
  // Detection relies on file extension (.prt) at the call site.
  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a PreTracker module file into a TrackerSong.
 *
 * Phase 10 stub: returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parsePreTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (buffer.byteLength < 36) {
    throw new Error(
      `Invalid PreTracker file: too small (${buffer.byteLength} bytes, minimum 36)`
    );
  }

  const numChannels = 4;
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
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
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
    name: `${baseName} [PreTracker]`,
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
    preTrackerFileData: buffer.slice(0),
  };
}
