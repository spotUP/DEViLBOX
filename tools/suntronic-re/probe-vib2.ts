/**
 * probe-vib2.ts — per-tick dump of voice0 vibrato accumulator $24, row index $2e,
 * tempo counters $2c/$2d, flags $14, period $20, freq-acc $08, PLUS voice2 flags,
 * clocked on the handler-entry PC 0x2660e at fine sub-tick chunks. Goal: find what
 * distinguishes the ticks where UADE's $24 gains an EXTRA freqEnvSpeed step (the
 * t5/t12 double-advance) — correlate with $2e row changes and note-on flag flips.
 * NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba;
const PC_LO = 0x2660e, PC_HI = 0x26610;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const ticks = parseInt(process.argv[3] ?? '24', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
    mod._free(ptr); mod._free(hp);
  };
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  mod._uade_wasm_stop(); load();
  // pass 1: base0
  let base0 = 0xffffffff;
  for (let c = 0; c < ticks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a0 = new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + 8] >>> 0;
    if (a0 < base0) base0 = a0;
  }
  const v0 = base0, v2 = (base0 + 2 * STRIDE) >>> 0;
  mod._uade_wasm_stop(); load();
  const rdB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  const rdW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const hx = (n: number, w = 4): string => (n & (w === 2 ? 0xff : 0xffff)).toString(16).padStart(w, '0');
  let prev24 = 0;
  console.log('  t | $24   d   |$2e $2c/$2d $14 $20  $08  |v2$14');
  let got = 0;
  while (got < ticks) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 64) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a24 = rdW(v0 + 0x24), d = (a24 - prev24) & 0xffff; prev24 = a24;
    const steps = d / 0x1f40;
    console.log(`${String(got).padStart(3)} | ${hx(a24)} ${steps.toFixed(1).padStart(4)} | ${rdB(v0 + 0x2e)} ${rdB(v0 + 0x2c)}/${rdB(v0 + 0x2d)}  ${hx(rdB(v0 + 0x14), 2)} ${String(rdW(v0 + 0x20)).padStart(4)} ${hx(rdW(v0 + 0x08))} | ${hx(rdB(v2 + 0x14), 2)}`);
    got++;
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
}
main().catch((e) => { console.error(e); process.exit(1); });
