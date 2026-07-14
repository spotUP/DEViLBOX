/**
 * p7l-reg-capture.ts — capture the SunTronic synth's LIVE CPU registers at the exact
 * moment its output loop writes the first byte to a channel's Paula buffer (loc).
 *
 * New UADE-WASM facility: uade_wasm_arm_capture(addr) snapshots D0-D7,A0-A7,PC on the
 * first chip-RAM write to `addr`. Per tick we arm at each channel's loc (stable in
 * steady state), render, and read back the registers. This gives, with ZERO struct
 * guessing:
 *   A2 (regs[10]) = output write ptr (loc+something)
 *   A3 (regs[11]) = wave1 stream ptr  (CALC13/14: wave1_base + reads_so_far)
 *   A4 (regs[12]) = feedback src ptr
 *   PC            = which routine did the write (synth loop vs copy) — vs module bounds
 *
 * Usage: npx tsx tools/suntronic-re/p7l-reg-capture.ts [module.src] [ch] [tick]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const targetCh = parseInt(process.argv[3] ?? '0', 10);
  const wantTick = parseInt(process.argv[4] ?? '80', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  mod._uade_wasm_enable_paula_log(1);
  mod._uade_wasm_enable_module_trace(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const cap = mod._malloc(18 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  let modLo = 0, modHi = 0;
  for (let c = 0; c <= wantTick; c++) {
    // arm capture over a wide window around the target's buffer region (catches
    // whichever half of the double buffer the synth writes this tick)
    if (loc[targetCh]) mod._uade_wasm_arm_capture((loc[targetCh] & ~0x1ff) >>> 0, 0x400);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (c === 0) {
      const mb = mod._malloc(8); mod._uade_wasm_get_module_bounds(mb);
      const hb = new Uint32Array(mod.HEAPU8.buffer);
      modLo = hb[mb >> 2]; modHi = hb[(mb >> 2) + 1]; mod._free(mb);
      console.log(`[p7l] module bounds ${hx(modLo)}..${hx(modHi)}`);
    }
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    if (c !== wantTick) continue;
    const hit = mod._uade_wasm_get_capture(cap);
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    console.log(`[p7l] tick${c} ch${targetCh} loc=${hx(loc[targetCh])} byteLen=${len[targetCh] * 2} captureHit=${hit} hitAddr=${hx(r[17])}`);
    if (hit) {
      const pc = r[16];
      const inMod = pc >= modLo && pc < modHi;
      console.log(`   PC=${hx(pc)} ${inMod ? '(in replayer)' : '(OUTSIDE replayer — likely copy/system)'}`);
      console.log(`   D0-D7: ${r.slice(0, 8).map(hx).join(' ')}`);
      console.log(`   A0=${hx(r[8])} A1=${hx(r[9])} A2=${hx(r[10])} A3=${hx(r[11])}`);
      console.log(`   A4=${hx(r[12])} A5=${hx(r[13])} A6=${hx(r[14])} A7=${hx(r[15])}`);
    }
  }
  mod._free(L); mod._free(R); mod._free(lg); mod._free(cap);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
