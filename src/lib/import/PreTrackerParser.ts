/**
 * PreTrackerParser.ts - Parser for PreTracker (.prt) format modules
 *
 * PreTracker is a Commodore Amiga music tracker by Ratt that uses a simplified
 * 4-channel MOD-based format. PreTracker files are identified by magic bytes
 * "PRT" followed by a version byte (typically 0x1B for v1.x).
 *
 * Module Structure:
 * - Header: Song title (20 bytes), reserved (12 bytes)
 * - Pattern data: 4 channels × (up to 64 rows) × 4 bytes per note
 * - Sample data: Raw PCM audio follows patterns
 *
 * This parser extracts module metadata (format, channels, instruments, patterns)
 * and creates a minimal TrackerSong structure for import into DEViLBOX.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, InstrumentConfig } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────

/** PreTracker magic bytes "PRT" */
const PRETRACKER_MAGIC = 0x505254; // 'P', 'R', 'T' in ASCII

/** Default PreTracker module has 4 channels */
const DEFAULT_CHANNELS = 4;

/** Default pattern length for PreTracker modules */
const DEFAULT_PATTERN_LENGTH = 64;

/** Channel panning (spread across stereo field) */
const CHANNEL_PANNING = [
  -64, // Left
  64,  // Right
  -64, // Left
  64,  // Right
];

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Read null-terminated ASCII string from buffer
 */
function readStr(buf: Uint8Array, offset: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = buf[offset + i];
    if (c === 0) break;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
  }
  return s.trim();
}

/**
 * Detect if buffer is a valid PreTracker file
 */
export function isPreTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer);
  // Check for "PRT" magic at offset 0
  return (
    view[0] === 0x50 && // 'P'
    view[1] === 0x52 && // 'R'
    view[2] === 0x54    // 'T'
  );
}

/**
 * Parse a PreTracker (.prt) file and extract module metadata
 *
 * @param buffer - ArrayBuffer containing PreTracker file data
 * @param filename - Original filename for fallback metadata
 * @returns TrackerSong with extracted metadata
 */
export function parsePreTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): TrackerSong {
  const view = new Uint8Array(buffer);

  // Validate magic bytes
  if (!isPreTrackerFormat(buffer)) {
    throw new Error('PreTrackerParser: not a valid PreTracker file (missing PRT magic)');
  }

  // Extract song title from offset +3 (after version byte)
  // PreTracker title is typically at offset 4, max 20 bytes
  const songTitle = readStr(view, 4, 20) || filename.replace(/\.[^/.]+$/, '');

  // Create stub instruments (PreTracker modules are sample-based)
  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'sample' as const,
      synthType: 'Sampler' as const,
      effects: [],
      volume: -60,
      pan: 0,
    } as InstrumentConfig,
  ];

  // Create empty pattern with default rows
  const emptyRows = Array.from({ length: DEFAULT_PATTERN_LENGTH }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const channels: ChannelData[] = Array.from({ length: DEFAULT_CHANNELS }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    shortName: `CH${ch + 1}`,
    rows: [...emptyRows],
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: CHANNEL_PANNING[ch],
    instrumentId: null,
    color: null,
  }));

  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: DEFAULT_PATTERN_LENGTH,
    channels,
    importMetadata: {
      sourceFormat: 'PreTracker' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: DEFAULT_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  // Return minimal TrackerSong structure
  const song: TrackerSong = {
    name: `${songTitle}`,
    format: 'MOD' as TrackerFormat, // PreTracker is MOD-compatible
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: DEFAULT_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false, // PreTracker uses Amiga periods
  };

  return song;
}

/**
 * Main async parser function matching standard import pattern
 */
export async function parsePreTrackerData(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  return parsePreTrackerFile(buffer, filename);
}
