/**
 * The Nuade WASM module as TypeScript sees it: the nw_* exports (nuade-wasm/src/nuade_wasm.c) and the two helpers that
 * pass strings and bytes across. Shared by the Node loader (nuadeHeadless.ts) and the main-thread probe (nuadeProbe.ts).
 */

/** The nw_* exports (nuade-wasm/src/nuade_wasm.c). */
export interface NuadeModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
  UTF8ToString(p: number): string;
  _malloc(n: number): number;
  _free(p: number): void;
  _nw_init(rate: number): void;
  _nw_add_file(name: number, data: number, len: number): number;
  _nw_clear_files(): void;
  _nw_open(data: number, len: number, name: number, playerId: number): number;
  _nw_close(): void;
  _nw_last_error(): number;
  _nw_start(subsong: number): number;
  _nw_render(stereo: number, voices: number, frames: number, stride: number): number;
  _nw_last_flags(): number;
  _nw_voice_count(): number;
  _nw_subsong_count(): number;
  _nw_default_subsong(): number;
  _nw_position(): number;
  _nw_seek(frame: number): number;
  _nw_snapshot(frame: number, out: number): number;
  _nw_vu(out: number, cap: number): number;
  _nw_pans(out: number, cap: number): number;
  _nw_set_repeat(n: number): void;
  _nw_set_mute_mask(mask: number): void;
  _nw_set_separation(x: number): number;
  _nw_meta(key: number): number;
  _nw_instrument_count(): number;
  _nw_instrument_name(n: number): number;
  _nw_instrument_index(n: number): number;
  _nw_player_id(): number;
  _nw_player_name(): number;
  _nw_player_count(): number;
  _nw_player_id_at(i: number): number;
  _nw_probe(data: number, len: number, name: number): number;
  _nw_probe_with(id: number, data: number, len: number, name: number): number;
  _nw_caps(): number;
  _nw_state_size(): number;
  _nw_state_read(offset: number, len: number, out: number): number;
  _nw_cell_write(pattern: number, row: number, channel: number, values: number, count: number): number;
  _nw_instrument_write(instrument: number, param: number, value: number): number;
}


/** A NUL-terminated copy of `s` in the module's heap; the caller frees it. */
export function cstr(m: NuadeModule, s: string): number {
  const b = new TextEncoder().encode(s);
  const p = m._malloc(b.length + 1);
  m.HEAPU8.set(b, p);
  m.HEAPU8[p + b.length] = 0;
  return p;
}

/** A copy of `data` in the module's heap; the caller frees it. */
export function heapBytes(m: NuadeModule, data: Uint8Array): number {
  const p = m._malloc(data.length || 1);
  m.HEAPU8.set(data, p);
  return p;
}

/** One named player's probe on these bytes: 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
export function probeWith(m: NuadeModule, playerId: string, data: Uint8Array, fileName: string): number {
  const id = cstr(m, playerId), p = heapBytes(m, data), n = cstr(m, fileName);
  const r = m._nw_probe_with(id, p, data.length, n);
  m._free(id); m._free(p); m._free(n);
  return r;
}
