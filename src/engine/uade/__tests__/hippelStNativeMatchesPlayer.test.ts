/**
 * The native Hippel ST player (hippelst-wasm: the WT player transpiled by
 * tools/asm68k-to-c) leaves the same YM2149 registers, tick for tick, as the
 * original running in UADE. UADE's ST player keeps the register values in a
 * shadow (11 longs, register r at byte 4r + 2) before it turns them into Paula
 * writes; the test finds that shadow in chip RAM and samples it once per player tick.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../../tools/uade-audit/uadeRenderCore';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';
import { HstSongEdit } from '@/lib/import/formats/JochenHippelSTSong';
import { loadHippelStNode, HST_YM_REGS } from '@/engine/hippelst/hippelStNodeCore';

interface Oracle extends UADEModule {
  _uade_wasm_read_memory(addr: number, out: number, len: number): number;
  _uade_wasm_get_player_tick_count(): number;
  _uade_wasm_set_subsong(n: number): number;
  _uade_wasm_get_subsong_min(): number;
}

const SONGS: Array<[string, string]> = [
  ['hippel-st', 'crown arabia.hst'],
  ['hippel-st', 'crown england.hst'],
  ['hippel-st', 'crown japan.hst'],
  ['hippel-st', 'crown russia.hst'],
  ['hippel-st', 'crown viking.hst'],
  ['hippel-st', 'demo music10.sog'],
  ['formats', 'astaroth.sog'],
  ['hippel-st-coso', 'ghostbattle titletune.soc'],
];

async function loadOracle(image: Uint8Array, name: string): Promise<{ mod: Oracle; read: (addr: number, len: number) => Uint8Array }> {
  const mod = (await loadUADEModule(false)) as Oracle;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init');
  const hint = uadePlayerHint(name.replace(/\.[^.]+$/, '.hst'));
  const ptr = mod._malloc(image.length);
  refreshHeap(mod);
  mod.HEAPU8.set(image, ptr);
  const hp = mod._malloc(hint.length * 4 + 1);
  mod.stringToUTF8(hint, hp, hint.length * 4 + 1);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, image.length, hp) !== 0) throw new Error('uade load');
  const buf = mod._malloc(0x10000);
  const read = (addr: number, len: number): Uint8Array => {
    mod._uade_wasm_read_memory(addr, buf, len);
    refreshHeap(mod);
    return mod.HEAPU8.slice(buf, buf + len);
  };
  return { mod, read };
}

/**
 * Where the player keeps its YM shadow: 11 longs [reg, 0, value, 0]. The player's
 * binary can sit in memory more than once (loaded image, relocated copy); the live
 * one is the copy that changes while the song plays.
 */
async function findShadow(image: Uint8Array, name: string): Promise<number> {
  const { mod, read } = await loadOracle(image, name);
  const found: number[] = [];
  for (let base = 0; base < 0x400000; base += 0xff00) {
    const chunk = read(base, 0x10000);
    for (let i = 0; i + 44 <= chunk.length && i < 0xff00; i++) {
      let ok = true;
      for (let r = 0; r < 11 && ok; r++) ok = chunk[i + r * 4] === r && chunk[i + r * 4 + 1] === 0 && chunk[i + r * 4 + 3] === 0;
      if (ok) found.push(base + i);
    }
  }
  const snap = (a: number): string => Array.from(read(a, 44)).join(',');
  const before = found.map(snap);
  const pL = mod._malloc(882 * 4), pR = mod._malloc(882 * 4);
  for (let i = 0; i < 60; i++) mod._uade_wasm_render(pL, pR, 882);
  const live = found.filter((a, i) => snap(a) !== before[i]);
  mod._uade_wasm_stop();
  if (live.length !== 1) throw new Error(`YM shadow candidates ${found.map((a) => a.toString(16))}, changing: ${live.map((a) => a.toString(16))}`);
  return live[0];
}

/**
 * The player's YM registers (11 per tick) after each of its first `ticks` interrupts. A
 * watchpoint on the shadow logs every byte the player writes; each Play ends with the write
 * of the noise register (byte 4 * 6 + 2), so the log splits into ticks exactly, however many
 * interrupts one render call runs.
 */
async function uadeShadowTicks(image: Uint8Array, name: string, ticks: number, sub: number): Promise<Uint8Array> {
  const at = await findShadow(image, name);
  const mod = (await loadUADEModule(false)) as Oracle & {
    _uade_wasm_set_watchpoint(slot: number, addr: number, size: number, mode: number): void;
    _uade_wasm_get_watchpoint_hits(out: number, max: number): number;
  };
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init');
  mod._uade_wasm_set_watchpoint(0, at, 44, 2); // before the load: the first Play runs inside it
  const hint = uadePlayerHint(name.replace(/\.[^.]+$/, '.hst'));
  const ptr = mod._malloc(image.length);
  refreshHeap(mod);
  mod.HEAPU8.set(image, ptr);
  const hp = mod._malloc(hint.length * 4 + 1);
  mod.stringToUTF8(hint, hp, hint.length * 4 + 1);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, image.length, hp) !== 0) throw new Error('uade load');
  const pL = mod._malloc(64 * 4), pR = mod._malloc(64 * 4);
  const hitsPtr = mod._malloc(256 * 16);
  const state: number[] = Array.from({ length: HST_YM_REGS }, (_, r) => (r === 7 ? 0xff : 0));
  const regs = new Uint8Array(ticks * HST_YM_REGS);
  let n: number = 0;
  const drain = (): void => {
    const count = mod._uade_wasm_get_watchpoint_hits(hitsPtr, 256);
    refreshHeap(mod);
    const u32 = new Uint32Array(mod.HEAPU8.buffer, hitsPtr, count * 4);
    for (let i = 0; i < count && n < ticks; i++) {
      const off = u32[i * 4] - at;
      if ((off & 3) !== 2 || off >> 2 >= HST_YM_REGS) continue;
      state[off >> 2] = u32[i * 4 + 1] & 0xff;
      if (off >> 2 === 6) { regs.set(state, n * HST_YM_REGS); n++; }
    }
  };
  drain();
  if (sub > 0) { n = ticks; drain(); n = 0; mod._uade_wasm_set_subsong(mod._uade_wasm_get_subsong_min() + sub); drain(); }
  for (let f = 0; n < ticks && f < 44100 * 40; f += 64) {
    if (mod._uade_wasm_render(pL, pR, 64) <= 0) break;
    drain();
  }
  mod._uade_wasm_stop();
  return regs.slice(0, n * HST_YM_REGS);
}

describe('native Hippel ST player against the original player', () => {
  const TICKS = 1500; // 30 s
  for (const [dir, file] of SONGS) {
    it(`${file}: every subsong's YM registers equal the original's, tick for tick`, async () => {
      const src = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', dir, file)));
      const image = new HstSongEdit(src).image;
      const native = await loadHippelStNode(image);
      const bad: string[] = [];
      for (let sub = 0; sub < native.song.subsongs; sub++) {
        const want = await uadeShadowTicks(image, file, TICKS, sub);
        const n = want.length / HST_YM_REGS;
        const got = native.run(sub, n);
        // The original stops at the song's end: the native player reports the end on the same tick.
        const ended = native.songEnds();
        if (n < TICKS && ended === 0) bad.push(`subsong ${sub}: the original ended after ${n} ticks, the native player reported no song end`);
        expect(n, `subsong ${sub} ticks`).toBeGreaterThan(50);
        // UADE handles the song's end itself and may restart the player (astaroth subsong 3
        // shows one tick of the start state on the tick after the end), so what follows the
        // end tick is UADE's, not the player's.
        const compare = native.firstEnd() > 0 ? Math.min(n, native.firstEnd()) : n;
        for (let t = 0; t < compare && bad.length < 8; t++) {
          for (let r = 0; r < HST_YM_REGS; r++) {
            if (want[t * HST_YM_REGS + r] !== got[t * HST_YM_REGS + r]) bad.push(`subsong ${sub} tick ${t + 1} reg ${r}: original ${want[t * HST_YM_REGS + r]} native ${got[t * HST_YM_REGS + r]}`);
          }
        }
      }
      expect(bad).toEqual([]);
    }, 300_000);
  }
});

export { uadeShadowTicks };
