/**
 * Main-thread Ixalance editor module (ixalance-wasm build, public/ixalance/IxalanceEdit.js): the
 * replayer's own loader and IT pattern unpacker decode the grid in C++ (ixs_grid.cpp), and the same
 * module re-packs edited cells into the .ixs file. This file only copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface IxalanceEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _ixs_grid_open(ptr: number, size: number): number;
  _ixs_grid_close(): void;
  _ixs_grid_channels(): number;
  _ixs_grid_order_length(): number;
  _ixs_grid_order(k: number): number;
  _ixs_grid_pattern_count(): number;
  _ixs_grid_pattern_rows(p: number): number;
  _ixs_grid_pattern(p: number): number;
  _ixs_edit_set(p: number, row: number, ch: number, note: number, ins: number): number;
  _ixs_edit_save(): number;
  _ixs_edit_saved_ptr(): number;
  _ixs_rowlog_enable(on: number): void;
  _ixs_rowlog_count(): number;
  _ixs_rowlog_record_size(): number;
  _ixs_rowlog_ptr(): number;
  _ixalance_init(ptr: number, size: number): number;
  _ixalance_render(buf: number, frames: number): number;
  _ixalance_stop(): void;
}
export type CreateIxalanceEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<IxalanceEditModule>;

/** Ints per grid cell in ixs_grid.cpp: tracker note, instrument, raw IT volume/pan, IT command, argument. */
const CELL_INTS = 5;

let mod: Promise<IxalanceEditModule> | null = null;

/** The module; `create` overrides the load. Node (tests, CLI tools) loads it from public/ixalance on disk. */
export function ixalanceEditModule(create?: CreateIxalanceEdit): Promise<IxalanceEditModule> {
  if (create) return create();
  if (!mod) {
    // a browser worker has no window either: only a real node process (or vitest, which clears process.versions) loads from disk
    const node = !!import.meta.env.VITEST || (typeof process !== 'undefined' && !!process.versions?.node);
    const dir = node ? `${process.cwd()}/public/ixalance/` : `${import.meta.env.BASE_URL}ixalance/`;
    mod = import(/* @vite-ignore */ `${node ? 'file://' : ''}${dir}IxalanceEdit.js`)
      .then((m: { default: CreateIxalanceEdit }) => m.default(node ? { locateFile: (f) => dir + f } : undefined));
  }
  return mod;
}

export interface IxalanceGrid {
  channels: number;
  /** grid pattern per song position */
  order: number[];
  /** per pattern: rows x channels, row-major */
  patterns: TrackerCell[][][];
}

function openGrid(m: IxalanceEditModule, bytes: Uint8Array): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const rc = m._ixs_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (rc !== 0) throw new Error(`Ixalance song does not open in the replayer (${rc})`);
}

/** The song's grid as the replayer unpacks it (ixs_grid.cpp). */
export async function ixalanceGrid(bytes: Uint8Array, create?: CreateIxalanceEdit): Promise<IxalanceGrid> {
  const m = await ixalanceEditModule(create);
  openGrid(m, bytes);
  try {
    const channels = m._ixs_grid_channels();
    const order = Array.from({ length: m._ixs_grid_order_length() }, (_, k) => m._ixs_grid_order(k));
    const patterns = Array.from({ length: m._ixs_grid_pattern_count() }, (_, p) => {
      const rows = m._ixs_grid_pattern_rows(p);
      const base = m._ixs_grid_pattern(p) >> 2;
      const h = m.HEAP32;
      return Array.from({ length: rows }, (_, r) => Array.from({ length: channels }, (_, c): TrackerCell => {
        const o = base + (r * channels + c) * CELL_INTS;
        // IT volume column 0..64 is a set-volume; the XM volume column writes it as 0x10 + v.
        const vol = h[o + 2];
        return { note: h[o], instrument: h[o + 1], volume: vol >= 0 && vol <= 64 ? 0x10 + vol : 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      }));
    });
    return { channels, order, patterns };
  } finally {
    m._ixs_grid_close();
  }
}

/** The .ixs file with every grid cell's note and instrument written back; unchanged cells keep their bytes. */
export async function ixalanceEdited(
  bytes: Uint8Array,
  patterns: ReadonlyArray<{ channels: ReadonlyArray<{ rows: ReadonlyArray<{ note: number; instrument: number }> }> }>,
  create?: CreateIxalanceEdit,
): Promise<{ data: Uint8Array; warnings: string[] }> {
  const m = await ixalanceEditModule(create);
  openGrid(m, bytes);
  try {
    const warnings: string[] = [];
    patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, r) => {
      const rc = m._ixs_edit_set(p, r, ch, cell.note, cell.instrument);
      if (rc === -2) warnings.push(`Pattern ${p} row ${r} channel ${ch + 1}: note ${cell.note} has no Ixalance encoding, kept as loaded`);
    })));
    const size = m._ixs_edit_save();
    if (size < 0) throw new Error(`Ixalance save failed (${size})`);
    const ptr = m._ixs_edit_saved_ptr();
    return { data: m.HEAPU8.slice(ptr, ptr + size), warnings };
  } finally {
    m._ixs_grid_close();
  }
}
