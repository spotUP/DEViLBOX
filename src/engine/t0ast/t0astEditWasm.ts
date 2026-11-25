/**
 * Main-thread T0AST editor module (t0ast-wasm build, public/t0ast/T0astEdit.js): the cell decode
 * (grid) and the cell encode (live poke bytes) run in C++ (t0ast_wasm.cpp). This file only copies
 * numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface T0astEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _t0ast_grid_open(ptr: number, size: number): number;
  _t0ast_grid_channels(): number;
  _t0ast_grid_order_length(): number;
  _t0ast_grid_order(k: number): number;
  _t0ast_grid_pattern(p: number): number;
  _t0ast_grid_close(): void;
  _t0ast_play_pattern(p: number): number;
  _t0ast_play_pattern_index(): number;
  _t0ast_encode_cell(note: number, volume: number, effTyp: number, eff: number, effTyp2: number, eff2: number): number;
  _t0ast_open(ptr: number, size: number, rate: number): number;
  _t0ast_error(): number;
  _t0ast_position(): number;
  _t0ast_poke(offset: number, ptr: number, count: number): number;
  _t0ast_render(ptr: number, frames: number): number;
  _t0ast_close(): void;
  UTF8ToString(p: number): string;
}
export type CreateT0astEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<T0astEditModule>;

export const T0AST_ROWS = 64;
export const T0AST_CHANNELS = 16;
const CELL_INTS = 7;

let mod: Promise<T0astEditModule> | null = null;

/** The module; `create` (tests, node) overrides the browser load from public/t0ast. */
export function t0astEditModule(create?: CreateT0astEdit): Promise<T0astEditModule> {
  if (create) return create();
  mod ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}t0ast/T0astEdit.js`)
    .then((m: { default: CreateT0astEdit }) => m.default());
  return mod;
}

/** One pattern (64 rows x 16 channels) of tracker cells from the int32 block at `ptr`. */
export function readT0astPattern(m: T0astEditModule, ptr: number): TrackerCell[][] {
  const h = m.HEAP32;
  const base = ptr >> 2;
  return Array.from({ length: T0AST_ROWS }, (_, r) => Array.from({ length: T0AST_CHANNELS }, (_, c) => {
    const o = base + (r * T0AST_CHANNELS + c) * CELL_INTS;
    return { note: h[o], instrument: h[o + 1], volume: h[o + 2], effTyp: h[o + 3], eff: h[o + 4], effTyp2: h[o + 5], eff2: h[o + 6] };
  }));
}

export interface T0astGrid { channels: number; order: number[]; patterns: Map<number, TrackerCell[][]> }

/** The file's order list and every pattern it names, decoded by the C++ loader. */
export async function t0astGrid(bytes: Uint8Array, create?: CreateT0astEdit): Promise<T0astGrid> {
  const m = await t0astEditModule(create);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._t0ast_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (!ok) throw new Error(`T0AST song does not open: ${m.UTF8ToString(m._t0ast_error())}`);
  const order = Array.from({ length: m._t0ast_grid_order_length() }, (_, k) => m._t0ast_grid_order(k));
  const patterns = new Map<number, TrackerCell[][]>();
  for (const p of order) if (!patterns.has(p)) patterns.set(p, readT0astPattern(m, m._t0ast_grid_pattern(p)));
  const grid = { channels: m._t0ast_grid_channels(), order, patterns };
  m._t0ast_grid_close();
  return grid;
}

/** Byte offset of a cell in the engine's decoded cells (t0ast_poke). */
export const t0astCellOffset = (pattern: number, row: number, channel: number): number =>
  ((pattern * T0AST_ROWS + row) * T0AST_CHANNELS + channel) * 6;

/** The six stored bytes for a tracker cell (C++ encode). */
export function t0astEncodeCell(m: T0astEditModule, cell: TrackerCell): Uint8Array {
  const p = m._t0ast_encode_cell(cell.note ?? 0, cell.volume ?? 0, cell.effTyp ?? 0, cell.eff ?? 0, cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  return m.HEAPU8.slice(p, p + 6);
}
