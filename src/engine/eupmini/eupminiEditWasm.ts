/**
 * Main-thread Euphony (.eup) editor module (eupmini-wasm build, public/eupmini/EupminiEdit.js): eup_grid.cpp walks
 * the event stream the way the vendored EUPPlayer does and lays it out as bars of 16 rows; the same module writes
 * edited notes back into the .eup bytes and can run the player over them with a recording device (the oracle).
 * This file only copies numbers in and out.
 */
import type { TrackerCell } from '@/types';

export interface EupminiEditModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _eup_grid_open(ptr: number, size: number): number;
  _eup_grid_close(): void;
  _eup_grid_bars(): number;
  _eup_grid_rows(): number;
  _eup_grid_channels(): number;
  _eup_grid_channel_track(ch: number): number;
  _eup_grid_channel_slot(ch: number): number;
  _eup_grid_cell_ints(): number;
  _eup_grid_cells(): number;
  _eup_grid_tempo(): number;
  _eup_grid_redecode(): void;
  _eup_edit_note(off: number, note: number, velo: number): number;
  _eup_edit_insert(bar: number, row: number, track: number, note: number, velo: number): number;
  _eup_edit_size(): number;
  _eup_edit_ptr(): number;
  _eup_oracle_run(maxTicks: number): number;
  _eup_oracle_log(): number;
}
export type CreateEupminiEdit = (opts?: { locateFile?: (f: string) => string }) => Promise<EupminiEditModule>;

let mod: Promise<EupminiEditModule> | null = null;

/** The module; `create` overrides the load. Node (tests, CLI tools) loads it from public/eupmini on disk. */
export function eupminiEditModule(create?: CreateEupminiEdit): Promise<EupminiEditModule> {
  if (create) return create();
  if (!mod) {
    const node = !!import.meta.env.VITEST || (typeof process !== 'undefined' && !!process.versions?.node);
    const dir = node ? `${process.cwd()}/public/eupmini/` : `${import.meta.env.BASE_URL}eupmini/`;
    mod = import(/* @vite-ignore */ `${node ? 'file://' : ''}${dir}EupminiEdit.js`)
      .then((m: { default: CreateEupminiEdit }) => m.default(node ? { locateFile: (f) => dir + f } : undefined));
  }
  return mod;
}

/** One grid cell as eup_grid.cpp stores it. */
export interface EupCell { note: number; velocity: number; offset: number; tick: number; tempo: number }

export interface EupGrid {
  /** track number per channel, and the voice slot within that track */
  tracks: number[];
  slots: number[];
  /** header tempo (BPM) the player starts at */
  tempo: number;
  /** per bar: 16 rows x channels */
  bars: EupCell[][][];
}

function open(m: EupminiEditModule, bytes: Uint8Array): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const rc = m._eup_grid_open(ptr, bytes.length);
  m._free(ptr);
  if (rc !== 0) throw new Error(`EUP song is too short for the player (${rc})`);
}

function readGrid(m: EupminiEditModule): EupGrid {
  const chans = m._eup_grid_channels(), rows = m._eup_grid_rows(), k = m._eup_grid_cell_ints();
  const base = m._eup_grid_cells() >> 2;
  const h = m.HEAP32;
  const bars = Array.from({ length: m._eup_grid_bars() }, (_, b) => Array.from({ length: rows }, (_, r) =>
    Array.from({ length: chans }, (_, c): EupCell => {
      const o = base + ((b * rows + r) * chans + c) * k;
      return { note: h[o], velocity: h[o + 1], offset: h[o + 2], tick: h[o + 3], tempo: h[o + 4] };
    })));
  return {
    tracks: Array.from({ length: chans }, (_, c) => m._eup_grid_channel_track(c)),
    slots: Array.from({ length: chans }, (_, c) => m._eup_grid_channel_slot(c)),
    tempo: m._eup_grid_tempo(),
    bars,
  };
}

/** The song's grid as the player walks it (eup_grid.cpp). */
export async function eupGrid(bytes: Uint8Array, create?: CreateEupminiEdit): Promise<EupGrid> {
  const m = await eupminiEditModule(create);
  open(m, bytes);
  try { return readGrid(m); } finally { m._eup_grid_close(); }
}

/** Tracker cells for one bar: note + instrument 1, the row's tempo change as Fxx on the first channel. */
export function eupBarCells(bar: EupCell[][]): TrackerCell[][] {
  return bar.map((row) => row.map((c, ch): TrackerCell => {
    const t = ch === 0 && c.tempo > 0 ? Math.min(255, Math.max(32, c.tempo)) : 0;
    // shortcut: velocity, gate and note-off are not shown; they stay in the file on save
    return { note: c.note, instrument: c.note ? 1 : 0, volume: 0, effTyp: 0, eff: 0, effTyp2: t ? 0x0F : 0, eff2: t };
  }));
}

/**
 * The .eup file with the grid's notes written back: changed pitches in place, cleared notes as dummy events,
 * new notes inserted on the channel's track. Unchanged cells keep their bytes, so no edit means byte-exact.
 */
export async function eupEdited(
  bytes: Uint8Array,
  patterns: ReadonlyArray<{ channels: ReadonlyArray<{ rows: ReadonlyArray<{ note: number }> }> }>,
  create?: CreateEupminiEdit,
): Promise<{ data: Uint8Array; warnings: string[] }> {
  const m = await eupminiEditModule(create);
  open(m, bytes);
  try {
    const g = readGrid(m);
    const warnings: string[] = [];
    const inserts: Array<[number, number, number, number]> = [];
    g.bars.forEach((bar, b) => bar.forEach((row, r) => row.forEach((cell, ch) => {
      const raw = patterns[b]?.channels[ch]?.rows[r]?.note ?? cell.note;
      const want = raw > 96 ? 0 : raw;  // note-off / note-cut: no EUP note-on
      if (want === cell.note) return;
      if (cell.offset >= 0) m._eup_edit_note(cell.offset, want, 0);
      else inserts.push([b, r, g.tracks[ch], want]);
    })));
    // inserts last: offsets of the in-place edits above stay valid
    for (const [b, r, track, note] of inserts) {
      if (m._eup_edit_insert(b, r, track, note, 0) !== 0) warnings.push(`Bar ${b} row ${r}: note ${note} not saved`);
    }
    const ptr = m._eup_edit_ptr();
    return { data: m.HEAPU8.slice(ptr, ptr + m._eup_edit_size()), warnings };
  } finally {
    m._eup_grid_close();
  }
}

/** Run the vendored EUPPlayer over `bytes`: [tick, track, midi note, velocity] per played note. */
export async function eupPlayed(bytes: Uint8Array, maxTicks = 1 << 22, create?: CreateEupminiEdit): Promise<number[][]> {
  const m = await eupminiEditModule(create);
  open(m, bytes);
  try {
    const n = m._eup_oracle_run(maxTicks);
    const base = m._eup_oracle_log() >> 2;
    return Array.from({ length: n }, (_, i) => Array.from(m.HEAP32.subarray(base + i * 4, base + i * 4 + 4)));
  } finally {
    m._eup_grid_close();
  }
}
