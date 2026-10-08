/**
 * Node-side loader of the native Hippel ST player (public/hippelst/HippelST.js),
 * for the oracle tests and the tools. The app loads the same module in the
 * worklet (HippelStEngine).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hstNativeSong, type HstNativeSong } from '@/lib/import/formats/JochenHippelSTNative';

export const HST_YM_REGS = 11;

interface HippelStModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _hst_load(p: number, len: number, shortAdr: number, later: number, sid: number): number;
  _hst_start(sub1: number): void;
  _hst_tick(): void;
  _hst_run(ticks: number, out: number): void;
  _hst_regs(out: number): void;
  _hst_song_ends(): number;
  _hst_first_end(): number;
  _hst_state(out: number, max: number): number;
  _hst_pos_step(): number;
  _hst_pos_row(): number;
  _hst_key_prepare(): void;
  _hst_key_on(note: number, instrument: number, transpose: number, attenuation: number): void;
  _hst_ym_init(rate: number): void;
  _hst_ym_reset(): void;
  _hst_set_mute(mask: number): void;
  _hst_set_gate(open: number): void;
  _hst_render(out: number, frames: number): number;
  _hst_tick(): void;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
}

export interface NodeHippelSt {
  song: HstNativeSong;
  /** YM register values (11 per tick) of the first `ticks` ticks of subsong `sub` (0-based). */
  run(sub: number, ticks: number): Uint8Array;
  songEnds(): number;
  /** The tick (1-based) on which the song first ended in the last run, 0 if it did not. */
  firstEnd(): number;
  /** Mono audio of subsong `sub` (0-based): the player's registers through the YM2149 core. */
  render(sub: number, frames: number, sampleRate?: number, muteMask?: number): Float32Array;
  /** Playhead after `ticks` ticks of subsong `sub`: the step and the row in it. */
  positionAfter(sub: number, ticks: number): { step: number; row: number };
  /** A second player over the same song with its sequencer parked: keys start notes on it. */
  key(): Promise<NodeHippelStKey>;
  /** The player's state block (YM shadow, counters, voice records) after the last run. */
  state(): Uint8Array;
}

export interface NodeHippelStKey {
  /** Audio of one note: the instrument (0-based) at the pattern note byte, for `frames` frames. */
  note(instrument: number, note: number, frames: number, sampleRate?: number, transpose?: number, attenuation?: number): Float32Array;
  /** The YM registers (11 per tick) of the first `ticks` ticks after the key. */
  regs(instrument: number, note: number, ticks: number, transpose?: number, attenuation?: number): Uint8Array;
}

export async function loadHippelStNode(image: Uint8Array): Promise<NodeHippelSt> {
  // The emscripten file is a CommonJS factory inside an ES-module package: evaluate it.
  const dir = join(process.cwd(), 'public/hippelst');
  const code = readFileSync(join(dir, 'HippelST.js'), 'utf8');
  const mx: { exports: unknown } = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', code)(mx, mx.exports, (id: string) => import.meta.resolve(id), dir, join(dir, 'HippelST.js'));
  const create = mx.exports as (o: { wasmBinary: ArrayBuffer }) => Promise<HippelStModule>;
  const bin = readFileSync(join(dir, 'HippelST.wasm'));
  const mod = await create({ wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer });
  const song = hstNativeSong(image);
  const p = mod._malloc(song.song.length);
  mod.HEAPU8.set(song.song, p);
  if (!mod._hst_load(p, song.song.length, song.shortPointers ? 1 : 0, song.laterPlayer ? 1 : 0, song.newSid ? 1 : 0)) throw new Error('hst_load failed');
  mod._free(p);
  const instance = async (): Promise<HippelStModule> => {
    const m = await create({ wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer });
    const q = m._malloc(song.song.length);
    m.HEAPU8.set(song.song, q);
    if (!m._hst_load(q, song.song.length, song.shortPointers ? 1 : 0, song.laterPlayer ? 1 : 0, song.newSid ? 1 : 0)) throw new Error('hst_load failed');
    m._free(q);
    return m;
  };
  const pull = (m: HippelStModule, frames: number): Float32Array => {
    const o = m._malloc(frames * 4);
    m._hst_render(o, frames);
    const r = new Float32Array(m.HEAPU8.buffer.slice(o, o + frames * 4));
    m._free(o);
    return r;
  };
  return {
    song,
    render(sub, frames, sampleRate = 44100, muteMask = 0) {
      mod._hst_ym_init(sampleRate);
      mod._hst_start(sub + 1);
      mod._hst_set_mute(muteMask);
      mod._hst_set_gate(1);
      return pull(mod, frames);
    },
    positionAfter(sub, ticks) {
      mod._hst_start(sub + 1);
      for (let t = 0; t < ticks; t++) mod._hst_tick();
      return { step: mod._hst_pos_step(), row: mod._hst_pos_row() };
    },
    async key() {
      const m = await instance();
      return {
        note(instrument, note, frames, sampleRate = 44100, transpose = 0, attenuation = 0) {
          m._hst_ym_init(sampleRate);
          m._hst_start(1);
          m._hst_key_prepare();
          m._hst_set_mute(6); // voice A only
          m._hst_set_gate(1);
          m._hst_key_on(note, instrument, transpose, attenuation);
          return pull(m, frames);
        },
        regs(instrument, note, ticks, transpose = 0, attenuation = 0) {
          m._hst_start(1);
          m._hst_key_prepare();
          m._hst_key_on(note, instrument, transpose, attenuation);
          const out = m._malloc(ticks * HST_YM_REGS);
          m._hst_run(ticks, out);
          const r = m.HEAPU8.slice(out, out + ticks * HST_YM_REGS);
          m._free(out);
          return r;
        },
      };
    },
    run(sub, ticks) {
      mod._hst_start(sub + 1);
      const out = mod._malloc(ticks * HST_YM_REGS);
      mod._hst_run(ticks, out);
      const r = mod.HEAPU8.slice(out, out + ticks * HST_YM_REGS);
      mod._free(out);
      return r;
    },
    songEnds: () => mod._hst_song_ends(),
    firstEnd: () => mod._hst_first_end(),
    state() {
      const o = mod._malloc(512);
      const n = mod._hst_state(o, 512);
      const r = mod.HEAPU8.slice(o, o + n);
      mod._free(o);
      return r;
    },
  };
}
