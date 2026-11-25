/**
 * Main-thread P/ECE editor module (piece-wasm build, public/piece/PieceEdit.js): the grid unroll
 * and cell edits run in C++ (piece_grid.h). This file only copies bytes in and out.
 */

interface PieceEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _piece_open(ptr: number, size: number, rate: number): number;
  _piece_close(): void;
  _piece_error(): number;
  _piece_data(): number;
  _piece_data_size(): number;
  _piece_grid(): number;
  _piece_edit_cell(part: number, row: number, note: number): number;
  UTF8ToString(p: number): string;
}
export type CreatePieceEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<PieceEditModule>;

export interface PieceGridEvent { part: number; tick: number; len: number; note: number; inst: number; vol: number; tempo: number }
export interface PieceGrid { rowTicks: number; ticks: number; tempo: number; events: PieceGridEvent[] }

let mod: Promise<PieceEditModule> | null = null;

/** The module; `create` (tests, node) overrides the browser load from public/piece. */
export function pieceEditModule(create?: CreatePieceEdit): Promise<PieceEditModule> {
  if (create) return create();
  mod ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}piece/PieceEdit.js`)
    .then((m: { default: CreatePieceEdit }) => m.default());
  return mod;
}

function open(m: PieceEditModule, bytes: Uint8Array): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._piece_open(ptr, bytes.length, 48000);
  m._free(ptr);
  if (!ok) throw new Error(`P/ECE song does not open: ${m.UTF8ToString(m._piece_error())}`);
}

export async function pieceGrid(bytes: Uint8Array, create?: CreatePieceEdit): Promise<PieceGrid> {
  const m = await pieceEditModule(create);
  open(m, bytes);
  const p = m._piece_grid() >> 2;
  const h = m.HEAP32;
  const events: PieceGridEvent[] = [];
  for (let i = 0, o = p + 4; i < h[p + 3]; i++, o += 7) {
    events.push({ part: h[o], tick: h[o + 1], len: h[o + 2], note: h[o + 3], inst: h[o + 4], vol: h[o + 5], tempo: h[o + 6] });
  }
  const grid = { rowTicks: h[p], ticks: h[p + 1], tempo: h[p + 2], events };
  m._piece_close();
  return grid;
}

export interface PieceCellEdit { part: number; row: number; note: number }

/** The song with each note written in (in order); `bytes` itself when nothing changed. */
export async function pieceEditCells(bytes: Uint8Array, edits: readonly PieceCellEdit[], create?: CreatePieceEdit): Promise<Uint8Array> {
  const m = await pieceEditModule(create);
  open(m, bytes);
  let changed = false;
  for (const e of edits) if (m._piece_edit_cell(e.part, e.row, e.note)) changed = true;
  const out = changed ? m.HEAPU8.slice(m._piece_data(), m._piece_data() + m._piece_data_size()) : bytes;
  m._piece_close();
  return out;
}
