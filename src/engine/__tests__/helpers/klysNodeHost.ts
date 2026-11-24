/**
 * The klystrack WASM (public/klystrack) loaded for a test, doing what the worklet does for KlysEngine:
 * load a song, take step edits (klys_set_pattern_step), serialize (klys_save_song). KlysEngine itself needs an
 * AudioWorkletNode, so a test stands this host in for the engine singleton the exporter asks for.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { klysTransform } from '@/engine/klystrack/KlysEngine';

interface KlysWasm {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _klys_init(rate: number): void;
  _klys_load_song(p: number, len: number): number;
  _klys_save_song(p: number, len: number): number;
  _klys_get_pattern_data(pat: number, out: number, max: number): number;
  _klys_set_pattern_step(pat: number, step: number, note: number, inst: number, ctrl: number, vol: number, lo: number, hi: number): void;
}

export interface KlysNodeHost {
  load(bytes: Uint8Array): void;
  setStep(pat: number, step: number, note: number, inst: number, ctrl: number, vol: number, cmd: number): void;
  /** One step as the engine holds it: note, instrument, ctrl, volume, command. */
  getStep(pat: number, step: number): { note: number; instrument: number; ctrl: number; volume: number; command: number };
  serialize(): Uint8Array;
}

export async function loadKlysNodeHost(): Promise<KlysNodeHost> {
  const root = process.cwd();
  // The same transform the worklet gets (exposes HEAPU8 on the module).
  const js = klysTransform(readFileSync(join(root, 'public/klystrack/Klystrack.js'), 'utf8'));
  const factory = new Function(`${js}\nreturn createKlystrack;`)() as (o: { wasmBinary: Buffer }) => Promise<KlysWasm>;
  // The module is built for web and worker only; its environment probe reads process.versions.
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  let w: KlysWasm;
  try { w = await factory({ wasmBinary: readFileSync(join(root, 'public/klystrack/Klystrack.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', versions); }
  w._klys_init(44100);
  return {
    load(bytes) {
      const p = w._malloc(bytes.length);
      w.HEAPU8.set(bytes, p);
      const ok = w._klys_load_song(p, bytes.length);
      w._free(p);
      if (!ok) throw new Error('klystrack engine refused the song');
    },
    setStep(pat, step, note, inst, ctrl, vol, cmd) { w._klys_set_pattern_step(pat, step, note, inst, ctrl, vol, cmd & 0xFF, (cmd >> 8) & 0xFF); },
    getStep(pat, step) {
      const p = w._malloc(256 * 6);
      w._klys_get_pattern_data(pat, p, 256);
      const r = w.HEAPU8.slice(p + step * 6, p + step * 6 + 6);
      w._free(p);
      return { note: r[0], instrument: r[1], ctrl: r[2], volume: r[3], command: r[4] | (r[5] << 8) };
    },
    serialize() {
      const need = w._klys_save_song(0, 0);
      const p = w._malloc(need);
      const n = w._klys_save_song(p, need);
      const out = w.HEAPU8.slice(p, p + n);
      w._free(p);
      return out;
    },
  };
}
