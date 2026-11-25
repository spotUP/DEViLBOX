/**
 * T0astParser.ts - T0AST (The 0ok Amazing Synth Tracker, .t0ast) detection and song shell.
 *
 * Playback is the clean-room WASM replayer (t0ast-wasm, T0astEngine). The cells are decoded by
 * the same C++ loader in the T0astEdit build (t0astGrid); this file only lays them out. One
 * 64-row, C-channel pattern per pattern number, so the playhead (songPos = order index, row)
 * lands and songPositions is the file's order list as is. Effects keep T0AST's own numbers.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import { t0astGrid, type CreateT0astEdit } from '@/engine/t0ast/t0astEditWasm';

const ROWS = 64;
const EMPTY = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
const SIG_NEW = [0x54, 0x30, 0x41, 0x53, 0x54, 0x01, 0x00, 0x01]; // "T0AST" 1.0.1
const SIG_OLD = [0x54, 0x30, 0x41, 0x53, 0x54, 0x30, 0x4f, 0x4b]; // "T0AST0OK"

const startsWith = (b: Uint8Array, sig: number[]): boolean => b.length >= 8 && sig.every((v, i) => b[i] === v);

export function isT0astFormat(bytes: Uint8Array): boolean {
  return startsWith(bytes, SIG_NEW) || startsWith(bytes, SIG_OLD);
}

export async function parseT0astFile(bytes: Uint8Array, filename: string, create?: CreateT0astEdit): Promise<TrackerSong | null> {
  if (!isT0astFormat(bytes)) return null;
  const grid = await t0astGrid(bytes, create);
  const channels = Math.max(Math.min(grid.channels, 16), 1);
  const order = grid.order.length > 0 ? grid.order : [0];
  const count = Math.max(...order) + 1;
  // Pattern index = pattern number, so songPositions is the file's order list as is.
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: Array.from({ length: channels }, (_, c) => ({
      id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: ROWS }, (_, r) => ({ ...(grid.patterns.get(p)?.[r][c] ?? EMPTY) })),
    })),
    importMetadata: {
      sourceFormat: 'T0AST', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: channels, originalPatternCount: count, originalInstrumentCount: channels,
    },
  }));
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'T0AST',
    patterns,
    instruments: [],
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: channels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    t0astFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
