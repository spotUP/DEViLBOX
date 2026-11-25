/**
 * Main-thread Psycle editor module (cpsycle-wasm build, public/cpsycle/CpsycleEdit.js): the vendored
 * cpsycle loader opens the song and its beerz77 unpacker decodes the PATD grids in C (cpsycle_grid.c);
 * the same module re-packs edited cells into the .psy file. This file only copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface CpsycleEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _cps_grid_open(ptr: number, size: number): number;
  _cps_grid_close(): void;
  _cps_grid_channels(): number;
  _cps_grid_order_length(): number;
  _cps_grid_order(k: number): number;
  _cps_grid_pattern_count(): number;
  _cps_grid_pattern_rows(p: number): number;
  _cps_grid_pattern(p: number): number;
  _cps_edit_set(p: number, row: number, ch: number, note: number, ins: number): number;
  _cps_edit_save(): number;
  _cps_edit_saved_ptr(): number;
  _cps_rowlog_enable(on: number): void;
  _cps_rowlog_count(): number;
  _cps_rowlog_record_size(): number;
  _cps_rowlog_ptr(): number;
  _cpsycle_init(ptr: number, size: number): number;
  _cpsycle_render(buf: number, frames: number): number;
  _cpsycle_stop(): void;
}
export type CreateCpsycleEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<CpsycleEditModule>;

/** Ints per grid cell in cpsycle_grid.c: tracker note, machine + 1, sampler instrument byte, command, parameter. */
const CELL_INTS = 5;

let mod: Promise<CpsycleEditModule> | null = null;

/** The module; `create` overrides the load. Node (tests, CLI tools) loads it from public/cpsycle on disk. */
export function cpsycleEditModule(create?: CreateCpsycleEdit): Promise<CpsycleEditModule> {
  if (create) return create();
  if (!mod) {
    // a browser worker has no window either: only a real node process (or vitest, which clears process.versions) loads from disk
    const node = !!import.meta.env.VITEST || (typeof process !== 'undefined' && !!process.versions?.node);
    const dir = node ? `${process.cwd()}/public/cpsycle/` : `${import.meta.env.BASE_URL}cpsycle/`;
    mod = import(/* @vite-ignore */ `${node ? 'file://' : ''}${dir}CpsycleEdit.js`)
      .then((m: { default: CreateCpsycleEdit }) => m.default(node ? { locateFile: (f) => dir + f } : undefined));
  }
  return mod;
}

export interface CpsycleGrid {
  channels: number;
  /** grid pattern per song position */
  order: number[];
  /** per pattern: rows x channels, row-major */
  patterns: TrackerCell[][][];
}

function openGrid(m: CpsycleEditModule, bytes: Uint8Array): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const rc = m._cps_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (rc !== 0) throw new Error(`Psycle song does not open in the cpsycle loader (${rc})`);
}

/** The song's grid as cpsycle unpacks it (cpsycle_grid.c); patterns are indexed by Psycle pattern number. */
export async function cpsycleGrid(bytes: Uint8Array, create?: CreateCpsycleEdit): Promise<CpsycleGrid> {
  const m = await cpsycleEditModule(create);
  openGrid(m, bytes);
  try {
    const channels = m._cps_grid_channels();
    const order = Array.from({ length: m._cps_grid_order_length() }, (_, k) => m._cps_grid_order(k));
    const patterns = Array.from({ length: m._cps_grid_pattern_count() }, (_, p) => {
      const rows = m._cps_grid_pattern_rows(p);
      const base = m._cps_grid_pattern(p) >> 2;
      const h = m.HEAP32;
      return Array.from({ length: rows }, (_, r) => Array.from({ length: channels }, (_, c): TrackerCell => {
        const o = base + (r * channels + c) * CELL_INTS;
        // shortcut: sampler instrument byte and command/parameter are not shown; they stay in the file on save
        return { note: h[o], instrument: h[o + 1], volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      }));
    });
    return { channels, order, patterns };
  } finally {
    m._cps_grid_close();
  }
}

/** The .psy file with every grid cell's note and instrument written back; unchanged cells keep their bytes. */
export async function cpsycleEdited(
  bytes: Uint8Array,
  patterns: ReadonlyArray<{ channels: ReadonlyArray<{ rows: ReadonlyArray<{ note: number; instrument: number }> }> }>,
  create?: CreateCpsycleEdit,
): Promise<{ data: Uint8Array; warnings: string[] }> {
  const m = await cpsycleEditModule(create);
  openGrid(m, bytes);
  try {
    const warnings: string[] = [];
    patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, r) => {
      const rc = m._cps_edit_set(p, r, ch, cell.note, cell.instrument);
      if (rc === -2) warnings.push(`Pattern ${p} row ${r} channel ${ch + 1}: note ${cell.note} has no Psycle encoding, kept as loaded`);
    })));
    const size = m._cps_edit_save();
    if (size < 0) throw new Error(`Psycle save failed (${size})`);
    const ptr = m._cps_edit_saved_ptr();
    return { data: m.HEAPU8.slice(ptr, ptr + size), warnings };
  } finally {
    m._cps_grid_close();
  }
}
