/**
 * T0astParser.ts - T0AST (The 0ok Amazing Synth Tracker, .t0ast) detection and song shell.
 *
 * Playback is the clean-room WASM replayer (t0ast-wasm, T0astEngine): the parser checks the
 * signature the way t0ast_open does, reads the order list (header walk only, bbmp description
 * section 2.1) and hands the bytes over as t0astFileData. One 64-row, C-channel pattern per
 * pattern number, so the playhead (songPos = order index, row) lands.
 * shortcut: cells are empty, no cell decode yet; upgrade when the WASM grid parser is built.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';

const ROWS = 64;
const SIG_NEW = [0x54, 0x30, 0x41, 0x53, 0x54, 0x01, 0x00, 0x01]; // "T0AST" 1.0.1
const SIG_OLD = [0x54, 0x30, 0x41, 0x53, 0x54, 0x30, 0x4f, 0x4b]; // "T0AST0OK"

const startsWith = (b: Uint8Array, sig: number[]): boolean => b.length >= 8 && sig.every((v, i) => b[i] === v);

export function isT0astFormat(bytes: Uint8Array): boolean {
  return startsWith(bytes, SIG_NEW) || startsWith(bytes, SIG_OLD);
}

interface T0astHeader { channels: number; order: number[] }

/** Walk to the order list; reads past the end give 0 like the engine's reader. */
function readHeader(b: Uint8Array): T0astHeader | null {
  if (!isT0astFormat(b)) return null;
  const at = (o: number): number => (o < b.length ? b[o] : 0);
  let o = 8 + 560 + (startsWith(b, SIG_NEW) ? 272 : 0) + 4;
  const channels = at(o++);
  for (let c = 0; c < channels; c++) o += at(o) ? 4 : 1;  // channel records
  for (let c = 0; c < channels; c++) o += at(o) ? 26 : 1; // instrument names
  const len = Math.min(at(o) | (at(o + 1) << 8), 256);
  o += 2;
  const order = Array.from({ length: len }, (_, i) => at(o + i));
  return { channels: Math.min(channels, 16), order };
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseT0astFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  const h = readHeader(bytes);
  if (!h) return null;
  const channels = Math.max(h.channels, 1);
  const order = h.order.length > 0 ? h.order : [0];
  const count = Math.max(...order) + 1;
  // Pattern index = pattern number, so songPositions is the file's order list as is.
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: Array.from({ length: channels }, (_, c) => ({
      id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: ROWS }, emptyCell),
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
