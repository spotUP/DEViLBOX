/**
 * Main-thread BeRoTracker editor module (berotracker-wasm build, public/berotracker/BeRoTrackerEdit.js):
 * the cell decode (grid) and the cell encode (live poke bytes) run in C++ (berotracker_wasm.cpp).
 * This file only copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface BeRoTrackerEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _brt_grid_open(ptr: number, size: number): number;
  _brt_grid_channels(): number;
  _brt_grid_speed(): number;
  _brt_grid_bpm(): number;
  _brt_grid_order_length(): number;
  _brt_grid_order(k: number): number;
  _brt_grid_pattern_rows(p: number): number;
  _brt_grid_pattern(p: number): number;
  _brt_grid_close(): void;
  _brt_play_pattern(p: number): number;
  _brt_pattern_rows(p: number): number;
  _brt_play_pattern_index(): number;
  _brt_encode_cell(note: number, ins: number, volume: number, effTyp: number, eff: number): number;
  _brt_export_open(ptr: number, size: number): number;
  _brt_export_cell(p: number, r: number, c: number, note: number, ins: number, volume: number, effTyp: number, eff: number): number;
  _brt_export_order(ptr: number, length: number): number;
  _brt_export_build(): number;
  _brt_export_size(): number;
  _brt_export_close(): void;
  _brt_open(ptr: number, size: number, rate: number): number;
  _brt_error(): number;
  _brt_position(): number;
  _brt_cell_size(): number;
  _brt_poke(pattern: number, offset: number, ptr: number, count: number): number;
  _brt_render(ptr: number, frames: number): number;
  _brt_close(): void;
  UTF8ToString(p: number): string;
}
export type CreateBeRoTrackerEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<BeRoTrackerEditModule>;

const CELL_INTS = 7;
/** sizeof(Cell) in bbmp-berotracker.cpp: note, ins, volcmd, vol, pan, filter, fx u16, param u16. */
export const BRT_CELL_BYTES = 10;

let mod: Promise<BeRoTrackerEditModule> | null = null;

/** The module; `create` (tests, node) overrides the browser load from public/berotracker. */
export function beRoTrackerEditModule(create?: CreateBeRoTrackerEdit): Promise<BeRoTrackerEditModule> {
  if (create) return create();
  mod ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}berotracker/BeRoTrackerEdit.js`)
    .then((m: { default: CreateBeRoTrackerEdit }) => m.default());
  return mod;
}

/** One pattern (rows x channels, row-major) of tracker cells from the int32 block at `ptr`. */
export function readBeRoTrackerPattern(m: BeRoTrackerEditModule, ptr: number, rows: number, channels: number): TrackerCell[][] {
  const h = m.HEAP32;
  const base = ptr >> 2;
  return Array.from({ length: rows }, (_, r) => Array.from({ length: channels }, (_, c) => {
    const o = base + (r * channels + c) * CELL_INTS;
    return { note: h[o], instrument: h[o + 1], volume: h[o + 2], effTyp: h[o + 3], eff: h[o + 4], effTyp2: h[o + 5], eff2: h[o + 6] };
  }));
}

export interface BeRoTrackerGrid {
  channels: number;
  speed: number;
  bpm: number;
  order: number[];
  /** Pattern number -> rows x channels cells, for every pattern load() keeps (listed or not). */
  patterns: Map<number, TrackerCell[][]>;
}

/** The file's order list and every decoded pattern, from the C++ loader. */
export async function beRoTrackerGrid(bytes: Uint8Array, create?: CreateBeRoTrackerEdit): Promise<BeRoTrackerGrid> {
  const m = await beRoTrackerEditModule(create);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._brt_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (!ok) throw new Error(`BeRoTracker song does not open: ${m.UTF8ToString(m._brt_error())}`);
  const channels = m._brt_grid_channels();
  const order = Array.from({ length: m._brt_grid_order_length() }, (_, k) => m._brt_grid_order(k));
  const patterns = new Map<number, TrackerCell[][]>();
  for (let p = 0; p < 240; p++) {
    const rows = m._brt_grid_pattern_rows(p);
    if (rows > 0) patterns.set(p, readBeRoTrackerPattern(m, m._brt_grid_pattern(p), rows, channels));
  }
  const grid = { channels, speed: m._brt_grid_speed(), bpm: m._brt_grid_bpm(), order, patterns };
  m._brt_grid_close();
  return grid;
}

/** Byte offset of a cell in one pattern's decoded cells (brt_poke): channel by channel. */
export const beRoTrackerCellOffset = (rows: number, row: number, channel: number): number =>
  (channel * rows + row) * BRT_CELL_BYTES;

/** The stored Cell bytes for a tracker cell (C++ encode). Poke 0..3 and 6..9; 4..5 (pan, filter) stay. */
export function beRoTrackerEncodeCell(m: BeRoTrackerEditModule, cell: TrackerCell): Uint8Array {
  const p = m._brt_encode_cell(cell.note ?? 0, cell.instrument ?? 0, cell.volume ?? 0, cell.effTyp ?? 0, cell.eff ?? 0);
  return m.HEAPU8.slice(p, p + BRT_CELL_BYTES);
}
