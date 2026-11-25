/**
 * Main-thread Digital Mugician editor module (digmug-wasm build, public/digmug/DigMugEdit.js): the
 * replayer walks the song in C (digmug.c dm_grid_*) and names every cell it plays. This file only
 * copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface DigMugEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _dm_grid_open(ptr: number, size: number): number;
  _dm_grid_close(): void;
  _dm_grid_channels(): number;
  _dm_grid_restart(): number;
  _dm_grid_order_length(): number;
  _dm_grid_order(k: number): number;
  _dm_grid_pattern_count(): number;
  _dm_grid_pattern_rows(p: number): number;
  _dm_grid_pattern(p: number): number;
  _dm_create(ptr: number, size: number, rate: number): number;
  _dm_destroy(m: number): void;
  _dm_render(m: number, out: number, frames: number): number;
  _dm_has_ended(m: number): number;
  _dm_get_play_pos(m: number): number;
  _dm_get_play_row(m: number): number;
  _dm_voice_note_index(m: number, ch: number): number;
  _dm_voice_instrument(m: number, ch: number): number;
}
export type CreateDigMugEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<DigMugEditModule>;

/** Ints per grid cell in digmug.c: note, instrument, effTyp, eff, track, note shift. */
const CELL_INTS = 6;

let mod: Promise<DigMugEditModule> | null = null;

/** The module; `create` overrides the load. Node (tests, CLI tools) loads it from public/digmug on disk. */
export function digMugEditModule(create?: CreateDigMugEdit): Promise<DigMugEditModule> {
  if (create) return create();
  if (!mod) {
    // a browser worker has no window either: only a real node process (or vitest, which clears process.versions) loads from disk
    const node = !!import.meta.env.VITEST || (typeof process !== 'undefined' && !!process.versions?.node);
    const dir = node ? `${process.cwd()}/public/digmug/` : `${import.meta.env.BASE_URL}digmug/`;
    mod = import(/* @vite-ignore */ `${node ? 'file://' : ''}${dir}DigMugEdit.js`)
      .then((m: { default: CreateDigMugEdit }) => m.default(node ? { locateFile: (f) => dir + f } : undefined));
  }
  return mod;
}

export interface DigMugGridPattern {
  /** rows x channels, row-major */
  cells: TrackerCell[][];
  /** track (64-row block in the pattern pool) each channel plays, per row x channel */
  tracks: number[][];
  /** transpose + fine tune * 64 each cell's note plays with, per row x channel */
  shifts: number[][];
}

export interface DigMugGrid {
  channels: number;
  restart: number;
  /** grid pattern per song position */
  order: number[];
  patterns: DigMugGridPattern[];
}

/** The song's grid: the replayer's walk of sub-song 0, from digmug.c. */
export async function digMugGrid(bytes: Uint8Array, create?: CreateDigMugEdit): Promise<DigMugGrid> {
  const m = await digMugEditModule(create);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._dm_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (!ok) throw new Error('Digital Mugician song does not open in the replayer');
  try {
    const channels = m._dm_grid_channels();
    const order = Array.from({ length: m._dm_grid_order_length() }, (_, k) => m._dm_grid_order(k));
    const patterns = Array.from({ length: m._dm_grid_pattern_count() }, (_, p): DigMugGridPattern => {
      const rows = m._dm_grid_pattern_rows(p);
      const base = m._dm_grid_pattern(p) >> 2;
      const h = m.HEAP32;
      const at = (r: number, c: number) => base + (r * channels + c) * CELL_INTS;
      const grid = <T,>(f: (o: number) => T): T[][] => Array.from({ length: rows }, (_, r) => Array.from({ length: channels }, (_, c) => f(at(r, c))));
      return {
        cells: grid((o): TrackerCell => ({ note: h[o], instrument: h[o + 1], volume: 0, effTyp: h[o + 2], eff: h[o + 3], effTyp2: 0, eff2: 0 })),
        tracks: grid((o) => h[o + 4]),
        shifts: grid((o) => h[o + 5]),
      };
    });
    return { channels, restart: m._dm_grid_restart(), order, patterns };
  } finally {
    m._dm_grid_close();
  }
}
