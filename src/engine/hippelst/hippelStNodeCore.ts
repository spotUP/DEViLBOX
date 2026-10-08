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
  HEAPU8: Uint8Array;
}

export interface NodeHippelSt {
  song: HstNativeSong;
  /** YM register values (11 per tick) of the first `ticks` ticks of subsong `sub` (0-based). */
  run(sub: number, ticks: number): Uint8Array;
  songEnds(): number;
  /** The tick (1-based) on which the song first ended in the last run, 0 if it did not. */
  firstEnd(): number;
  /** The player's state block (YM shadow, counters, voice records) after the last run. */
  state(): Uint8Array;
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
  return {
    song,
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
