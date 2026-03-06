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
import type { Pattern, ChannelData, InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like a PreTracker module.
 * PreTracker files are identified by examining the binary structure.
 * Minimum viable size is 36 bytes (header area).
 */
export function isPreTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 36) return false;
  // TODO Phase 12: add magic byte validation once format spec is confirmed
  // For now, this is called only when the file extension matches (.prt)
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

  // Create one empty pattern with 4 channels
  const channels: ChannelData[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push({
      cells: Array.from({ length: numRows }, () => ({
        note: 0,
        instrument: 0,
        volume: -1,
        effectType: 0,
        effectParam: 0,
      })),
    });
  }

  const pattern: Pattern = {
    channels,
    numRows,
  };

  // Create one stub instrument
  const instruments: InstrumentConfig[] = [
    {
      id: 'pretracker-inst-1',
      name: 'Instrument 1',
      synthType: 'Sampler',
      type: 'sampler',
      sample: { url: '' },
    } as InstrumentConfig,
  ];

  const song: TrackerSong = {
    name: filename.replace(/\.[^.]+$/, ''),
    format: 'MOD' as TrackerFormat,
    numChannels,
    initialSpeed: 6,
    initialTempo: 125,
    patterns: [pattern],
    songPositions: [0],
    songLength: 1,
    instruments,
    preTrackerFileData: buffer.slice(0),
    importMetadata: {
      sourceFormat: 'PreTracker',
      sourceFile: filename,
      importedAt: Date.now(),
    },
  };

  return song;
}
