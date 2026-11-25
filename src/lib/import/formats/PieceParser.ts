/**
 * PieceParser.ts - Aquaplus P/ECE music driver (.pmd) songs.
 *
 * Header: byte 0 = 0, byte 1 = part count (1..16), then u16 LE part pointers, the drum table
 * pointer and two title pointers (Shift-JIS C strings). Playback is the piece WASM replayer
 * (piece-wasm, PieceEngine), which reads the file bytes itself.
 *
 * The grid is the C++ unroll (piece-wasm/src/piece_grid.h, via pieceEditWasm): one channel per
 * part, one row per rowTicks driver ticks, speed = rowTicks and BPM = the song tempo, so grid time
 * is audio time (a driver tick is 2.5 / tempo seconds). One pass, up to the song's loop.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import { pieceGrid, type CreatePieceEdit } from '@/engine/piece/pieceEditWasm';

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

export const PIECE_ROWS = 64;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export async function parsePieceFile(bytes: Uint8Array, filename: string, create?: CreatePieceEdit): Promise<TrackerSong | null> {
  if (!isPieceFormat(bytes)) return null;
  const np = bytes[1];
  const title = cstr(bytes, rd16(bytes, 2 + 2 * np + 2));
  const grid = await pieceGrid(bytes, create);
  const rows = Math.max(1, Math.ceil(grid.ticks / grid.rowTicks));
  const count = Math.ceil(rows / PIECE_ROWS);
  const cells = Array.from({ length: np }, () => Array.from({ length: count * PIECE_ROWS }, emptyCell));
  for (const e of grid.events) {
    const c = cells[e.part]?.[e.tick / grid.rowTicks];
    if (!c) continue;
    c.note = e.note;  // 97 = rest (the driver's e0)
    if (e.inst >= 0) c.instrument = e.inst + 1;
    // Tempo command (e7) as Fxx: the BPM, since a row is rowTicks driver ticks at speed rowTicks.
    if (e.tempo > 0) { c.effTyp2 = 0x0f; c.eff2 = Math.min(255, e.tempo); }
  }
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: PIECE_ROWS,
    channels: cells.map((rowsOfPart, ch) => ({
      id: `channel-${ch}`, name: `Part ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: rowsOfPart.slice(p * PIECE_ROWS, (p + 1) * PIECE_ROWS),
    })),
    importMetadata: {
      sourceFormat: 'PIECE', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: np, originalPatternCount: count, originalInstrumentCount: 0,
    },
  }));
  return {
    name: title || filename.replace(/\.[^/.]+$/, ''),
    format: 'PIECE',
    patterns,
    instruments: [],
    songPositions: patterns.map((_, i) => i),
    songLength: count,
    restartPosition: 0,
    numChannels: np,
    initialSpeed: grid.rowTicks,
    initialBPM: grid.tempo,
    linearPeriods: false,
    pieceFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
