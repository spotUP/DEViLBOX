/**
 * Main-thread PT3 module (pt3-wasm build, public/pt3/Pt3Edit.js): the grid decode, the note mapping and the
 * .ay wrapper (real S.V. Bulba player + the untouched module, played by the aylet engine) run in C++
 * (pt3_wasm.cpp). This file only copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface Pt3EditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _pt3_grid_open(ptr: number, size: number): number;
  _pt3_error(): number;
  _pt3_positions(): number;
  _pt3_position(k: number): number;
  _pt3_loop(): number;
  _pt3_speed(): number;
  _pt3_pattern_count(): number;
  _pt3_pattern_rows(p: number): number;
  _pt3_xm_note(n: number): number;
  _pt3_pattern(p: number): number;
  _pt3_encode_note(xm: number): number;
  _pt3_grid_close(): void;
  _pt3_ay_build(ptr: number, size: number): number;
  _pt3_ay_size(): number;
  _pt3_ay_module_addr(): number;
  UTF8ToString(p: number): string;
}
export type CreatePt3Edit = (opts?: { locateFile?: (f: string) => string }) => Promise<Pt3EditModule>;

const CELL_INTS = 8;
let mod: Promise<Pt3EditModule> | null = null;

/** The module; `create` (tests, node) overrides the browser load from public/pt3. */
export function pt3EditModule(create?: CreatePt3Edit): Promise<Pt3EditModule> {
  if (create) return (mod ??= create());
  mod ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}pt3/Pt3Edit.js`)
    .then((m: { default: CreatePt3Edit }) => m.default());
  return mod;
}

export interface Pt3Grid {
  positions: number[];
  loop: number;
  speed: number;
  /** Pattern number -> rows x 3 cells. */
  patterns: Map<number, TrackerCell[][]>;
  /** Pattern number -> rows x 3 file offsets of the note byte (-1: no note on that line). */
  noteOffsets: Map<number, number[][]>;
  /** ZXAYEMUL file the aylet engine plays. */
  ay: ArrayBuffer;
}

/** The file's position list, every pattern it names and the .ay wrapper, all from the C++ module. */
export async function pt3Grid(bytes: Uint8Array, create?: CreatePt3Edit): Promise<Pt3Grid> {
  const m = await pt3EditModule(create);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  try {
    if (!m._pt3_grid_open(ptr, bytes.length)) throw new Error(`PT3 song does not open: ${m.UTF8ToString(m._pt3_error())}`);
    const positions = Array.from({ length: m._pt3_positions() }, (_, k) => m._pt3_position(k));
    const patterns = new Map<number, TrackerCell[][]>();
    const noteOffsets = new Map<number, number[][]>();
    for (const p of positions) {
      if (patterns.has(p)) continue;
      const base = m._pt3_pattern(p) >> 2;
      const h = m.HEAP32;
      const rows = m._pt3_pattern_rows(p);
      const at = (r: number, c: number) => base + (r * 3 + c) * CELL_INTS;
      patterns.set(p, Array.from({ length: rows }, (_, r) => Array.from({ length: 3 }, (_, c) => {
        const o = at(r, c);
        return { note: h[o], instrument: h[o + 1], volume: h[o + 2], effTyp: h[o + 3], eff: h[o + 4], effTyp2: h[o + 5], eff2: h[o + 6] };
      })));
      noteOffsets.set(p, Array.from({ length: rows }, (_, r) => [0, 1, 2].map((c) => h[at(r, c) + 7])));
    }
    const ayPtr = m._pt3_ay_build(ptr, bytes.length);
    if (!ayPtr) throw new Error('PT3 song too big for the .ay wrapper');
    const ay = m.HEAPU8.slice(ayPtr, ayPtr + m._pt3_ay_size()).buffer;
    return { positions, loop: m._pt3_loop(), speed: m._pt3_speed(), patterns, noteOffsets, ay };
  } finally {
    m._free(ptr);
    m._pt3_grid_close();
  }
}

/**
 * The PT3 bytes for XM notes `xms` (C++ pt3_encode_note: the module's own note table; -1 = not encodable) and the
 * Z80 address the .ay build loads the module at (module offset k plays from address + k).
 */
export async function pt3EncodeNotes(file: Uint8Array, xms: readonly number[], create?: CreatePt3Edit): Promise<{ bytes: number[]; moduleAddr: number; xmOf: (b: number) => number }> {
  const m = await pt3EditModule(create);
  const ptr = m._malloc(file.length);
  m.HEAPU8.set(file, ptr);
  try {
    if (!m._pt3_grid_open(ptr, file.length)) throw new Error(`PT3 song does not open: ${m.UTF8ToString(m._pt3_error())}`);
    const bytes = xms.map((x) => m._pt3_encode_note(x));
    const notes = Array.from({ length: 96 }, (_, n) => m._pt3_xm_note(n));
    // XM note a module byte plays (-1: not a note byte), so an unchanged note keeps its stored byte.
    const xmOf = (b: number) => (b >= 0x50 && b < 0x50 + 96 ? notes[b - 0x50] : b === 0xC0 ? 97 : b === 0xD0 ? 0 : -1);
    return { bytes, moduleAddr: m._pt3_ay_module_addr(), xmOf };
  } finally {
    m._free(ptr);
    m._pt3_grid_close();
  }
}

/** True for a ProTracker 3 / Vortex Tracker II module. */
export function isPt3(bytes: Uint8Array): boolean {
  const h = String.fromCharCode(...bytes.subarray(0, 14));
  return h.startsWith('ProTracker 3') || h.startsWith('Vortex Tracker');
}
