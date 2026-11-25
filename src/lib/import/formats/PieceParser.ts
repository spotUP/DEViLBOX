/**
 * PieceParser.ts - Aquaplus P/ECE music driver (.pmd) songs.
 *
 * Header: byte 0 = 0, byte 1 = part count (1..16), then u16 LE part pointers, the drum table
 * pointer and two title pointers (Shift-JIS C strings). Playback is the piece WASM replayer
 * (piece-wasm, PieceEngine), which reads the file bytes itself.
 *
 * shortcut: the grid is empty (one channel per part); the command-stream unroll into cells belongs
 * in the C++ module (owner rule: importers in WASM), upgrade when that lands.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';

const rd16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);

/** Content test; `.pmd` is shared with PC-98 PMD and PiyoPiyo, so every header pointer must land inside the file. */
export function isPieceFormat(b: Uint8Array): boolean {
  if (b.length < 20 || b[0] !== 0 || b[1] < 1 || b[1] > 16) return false;
  const np = b[1];
  const hdr = 2 + 2 * (np + 3);
  if (hdr > b.length) return false;
  let parts = 0;
  for (let i = 0; i < np; i++) {
    const p = rd16(b, 2 + 2 * i);
    if (p === 0) continue;
    if (p < hdr || p >= b.length) return false;
    parts++;
  }
  for (let i = 0; i < 3; i++) if (rd16(b, 2 + 2 * (np + i)) >= b.length) return false;
  return parts > 0;
}

function cstr(b: Uint8Array, o: number): string {
  if (o === 0 || o >= b.length) return '';
  let e = o;
  while (e < b.length && b[e] !== 0) e++;
  return new TextDecoder('shift_jis').decode(b.subarray(o, e)).trim();
}

const ROWS = 64;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parsePieceFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isPieceFormat(bytes)) return null;
  const np = bytes[1];
  const title = cstr(bytes, rd16(bytes, 2 + 2 * np + 2));
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: np }, (_, ch) => ({
      id: `channel-${ch}`, name: `Part ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null, rows: Array.from({ length: ROWS }, emptyCell),
    })),
    importMetadata: {
      sourceFormat: 'PIECE', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: np, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };
  return {
    name: title || filename.replace(/\.[^/.]+$/, ''),
    format: 'PIECE',
    patterns: [pattern],
    instruments: [],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: np,
    // 6 driver ticks = one 16th-note row (24 ticks a quarter note).
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    pieceFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
