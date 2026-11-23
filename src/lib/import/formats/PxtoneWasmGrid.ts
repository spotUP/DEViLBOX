/**
 * PxtoneWasmGrid.ts - the pxtone tick grid, read from the same wasm that plays the file.
 *
 * Conversion lives in C++ (pxtone_harness.cpp pxtone_grid_*): every ON event is a cell (row = clock *
 * rowsPerBeat / beatClock, pitch from the KEY in force, velocity from VELOCITY). The EVERECORD list in the
 * wasm is the carrier; the grid is derived and carries no byte-exact data (docs/FORMAT_COMMAND_STREAM_GRID.md).
 * Follows DavidWhittakerWasmExtractor: the bundle is fetched on the main thread and kept for the session.
 */
export const PXTONE_ROWS_PER_BEAT = 4;

export interface PxtoneWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _pxtone_init(data: number, size: number): number;
  _pxtone_get_num_units(): number;
  _pxtone_get_event_count(): number;
  _pxtone_get_event(i: number, out: number): number;
  _pxtone_get_beat_clock(): number;
  _pxtone_grid_build(rowsPerBeat: number): number;
  _pxtone_grid_get(i: number, out: number): number;
  _pxtone_grid_set_note(rowsPerBeat: number, unit: number, row: number, note: number): number;
  _pxtone_write(): number;
  _pxtone_write_data(): number;
  HEAPU8: Uint8Array;
}

export interface PxtoneGridCell { row: number; unit: number; note: number; velocity: number; durRows: number; clock: number }

export interface PxtoneGrid {
  units: number;
  beatClock: number;
  cells: PxtoneGridCell[];
  /** The whole EVERECORD list, 4 int32 per record (clock, unit, kind, value): the carrier. */
  events: Int32Array;
}

let wasmModule: PxtoneWasmModule | null = null;
let wasmLoading: Promise<PxtoneWasmModule> | null = null;

export async function getPxtoneWasm(): Promise<PxtoneWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsText, wasmBinary] = await Promise.all([
      fetch(`${baseUrl}pxtone/Pxtone.js`).then((r) => r.text()),
      fetch(`${baseUrl}pxtone/Pxtone.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(jsText + '; return createPxtone;')() as
      (opts?: Record<string, unknown>) => Promise<PxtoneWasmModule>;
    wasmModule = await factory({ wasmBinary, print: () => {}, printErr: () => {} });
    return wasmModule;
  })();
  try {
    return await wasmLoading;
  } catch (err) {
    wasmLoading = null;
    throw err;
  }
}

/** Load `data` into the module and read the grid and the event carrier. `heap` defaults to module.HEAPU8. */
export function readPxtoneGrid(m: PxtoneWasmModule, data: Uint8Array, heap: () => Uint8Array = () => m.HEAPU8): PxtoneGrid {
  const p = m._malloc(data.length);
  heap().set(data, p);
  const rc = m._pxtone_init(p, data.length);
  m._free(p);
  if (rc !== 0) throw new Error(`pxtone: init failed (${rc})`);

  const out = m._malloc(24);
  const ints = (n: number): Int32Array => new Int32Array(heap().buffer, out, n);
  const events = new Int32Array(m._pxtone_get_event_count() * 4);
  for (let i = 0; i * 4 < events.length; i++) {
    m._pxtone_get_event(i, out);
    events.set(ints(4), i * 4);
  }
  const cells: PxtoneGridCell[] = [];
  for (let i = 0, n = m._pxtone_grid_build(PXTONE_ROWS_PER_BEAT); i < n; i++) {
    m._pxtone_grid_get(i, out);
    const [row, unit, note, velocity, durRows, clock] = ints(6);
    cells.push({ row, unit, note, velocity, durRows, clock });
  }
  m._free(out);
  return { units: m._pxtone_get_num_units(), beatClock: m._pxtone_get_beat_clock(), cells, events };
}

/** A grid cell edit (note 0 clears) applied to the wasm's event list; returns the new event list. */
export function editPxtoneCell(m: PxtoneWasmModule, unit: number, row: number, note: number, heap: () => Uint8Array = () => m.HEAPU8): Int32Array {
  if (m._pxtone_grid_set_note(PXTONE_ROWS_PER_BEAT, unit, row, note) < 0) throw new Error('pxtone: cell edit failed');
  const out = m._malloc(16);
  const events = new Int32Array(m._pxtone_get_event_count() * 4);
  for (let i = 0; i * 4 < events.length; i++) {
    m._pxtone_get_event(i, out);
    events.set(new Int32Array(heap().buffer, out, 4), i * 4);
  }
  m._free(out);
  return events;
}
