/**
 * BeRoTrackerParser.ts - BeRoTracker (.brt) detection and song shell.
 *
 * Playback is the clean-room WASM replayer (berotracker-wasm, BeRoTrackerEngine). The cells, order,
 * speed and tempo are decoded by the same C++ loader in the BeRoTrackerEdit build (beRoTrackerGrid);
 * this file only lays them out. One pattern per pattern number with the engine's own row count, so
 * the playhead (songPos = order index, row) lands and songPositions is the order list as the
 * engine walks it. Effects keep BeRoTracker's own numbers. The newer ZIP form ('PK\3\4') is
 * refused, as the engine does.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import { beRoTrackerGrid, type CreateBeRoTrackerEdit } from '@/engine/berotracker/beRoTrackerEditWasm';

const EMPTY = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

const isMagic = (b: Uint8Array, s: string): boolean => b.length >= 4 && [...s].every((c, i) => b[i] === c.charCodeAt(0));

export function isBeRoTrackerFormat(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && isMagic(bytes, 'BRTF');
}

/** The newer ZIP-packed BeRoTracker form; the engine refuses it, so the import says so. */
export function isBeRoTrackerZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

export async function parseBeRoTrackerFile(bytes: Uint8Array, filename: string, create?: CreateBeRoTrackerEdit): Promise<TrackerSong | null> {
  if (!isBeRoTrackerFormat(bytes)) return null;
  const grid = await beRoTrackerGrid(bytes, create);
  const channels = grid.channels;
  if (channels < 1) return null;
  const order = grid.order.length > 0 ? grid.order : [0];
  const count = Math.max(...order, ...grid.patterns.keys()) + 1;
  // Pattern index = pattern number, so songPositions is the engine's order walk as is.
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => {
    const cells = grid.patterns.get(p);
    const length = cells?.length || 64; // engine fix-up: missing listed patterns play as 64 empty rows
    return {
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
      channels: Array.from({ length: channels }, (_, c) => ({
        id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length }, (_, r) => ({ ...(cells?.[r][c] ?? EMPTY) })),
      })),
      importMetadata: {
        sourceFormat: 'BeRoTracker', sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: channels, originalPatternCount: count, originalInstrumentCount: 0,
      },
    };
  });
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'BeRoTracker',
    patterns,
    instruments: [],
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: channels,
    initialSpeed: grid.speed,
    initialBPM: grid.bpm,
    linearPeriods: false,
    beRoTrackerFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
