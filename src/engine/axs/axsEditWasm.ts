/**
 * Main-thread AXS editor module (axs-wasm build, public/axs/AxsEdit.js): the song parse and the
 * grid run in C++ (axs-wasm/src/axs.cpp); this file only copies bytes in and out. Node tests pass
 * `create` to load the same module from disk.
 */

interface AxsEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _axs_open(ptr: number, size: number, rate: number): number;
  _axs_close(): void;
  _axs_error(): number;
  _axs_duration_ms(): number;
  _axs_grid(): number;
  _axs_render(out: number, frames: number): number;
  _axs_set_cell(block: number, track: number, row: number, note: number, vel: number, cmd: number, par: number): number;
  _axs_set_grid_cell(block: number, track: number, row: number, note: number, instrument: number, effTyp: number, eff: number, volume: number): number;
  _axs_start_bpm(): number;
  _axs_start_speed(): number;
  _axs_position(): number;
  _axs_row(): number;
  UTF8ToString(p: number): string;
}
export type CreateAxsEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<AxsEditModule>;

/** One cell as stored: note 0 = empty (else MIDI note + 1, 0xff = note off), velocity, command, parameter. */
export interface AxsCell { note: number; vel: number; cmd: number; par: number }
export interface AxsBlock { tracks: number; rows: number; trackBytes: number[]; cells: AxsCell[][] }
export interface AxsGrid { order: number[]; blocks: AxsBlock[]; speed: number; bpm: number }

let mod: Promise<AxsEditModule> | null = null;

/** The module; `create` (tests, node) overrides the browser load from public/axs. */
export function axsEditModule(create?: CreateAxsEdit): Promise<AxsEditModule> {
  if (create) return create();
  mod ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}axs/AxsEdit.js`)
    .then((m: { default: CreateAxsEdit }) => m.default());
  return mod;
}

export function axsOpen(m: AxsEditModule, bytes: Uint8Array, rate = 48000): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._axs_open(ptr, bytes.length, rate);
  m._free(ptr);
  if (!ok) throw new Error(`AXS song does not open: ${m.UTF8ToString(m._axs_error())}`);
}

/** The grid as the C++ lays it out: int32 [nBlocks, L, L x order, then per block T, R, 16 track bytes, T x R x 4]. */
export async function axsGrid(bytes: Uint8Array, create?: CreateAxsEdit): Promise<AxsGrid> {
  const m = await axsEditModule(create);
  axsOpen(m, bytes);
  const h = m.HEAP32;
  let o = m._axs_grid() >> 2;
  const nBlocks = h[o++], len = h[o++];
  const order = Array.from(h.subarray(o, o + len)); o += len;
  const blocks: AxsBlock[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const tracks = h[o++], rows = h[o++];
    const trackBytes = Array.from(h.subarray(o, o + 16)); o += 16;
    const cells: AxsCell[][] = [];
    for (let t = 0; t < tracks; t++) {
      const col: AxsCell[] = [];
      for (let r = 0; r < rows; r++, o += 4) col.push({ note: h[o], vel: h[o + 1], cmd: h[o + 2], par: h[o + 3] });
      cells.push(col);
    }
    blocks.push({ tracks, rows, trackBytes, cells });
  }
  const speed = m._axs_start_speed(), bpm = m._axs_start_bpm();
  m._axs_close();
  return { order, blocks, speed, bpm };
}
