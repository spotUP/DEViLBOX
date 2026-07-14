/**
 * p7q-capture-calc14.ts — PC-filtered capture of the REAL CALC13/14 feedback loop.
 * Arms a wide chip-RAM window but only fires when PC is inside the CALC13/14 body
 * (located by opcode signature via p7p). Reports the true A2(out)/A3(wave1)/A4(fb)
 * pointers + D-registers at the loop's first store, per tick, until it fires.
 *
 * Usage: npx tsx tools/suntronic-re/p7q-capture-calc14.ts [module.src] [pcLo] [pcHi] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'we_music_two.src';
  const pcLo = parseInt(process.argv[3] ?? '0x26dec', 16);
  const pcHi = parseInt(process.argv[4] ?? '0x26f40', 16);
  const maxTicks = parseInt(process.argv[5] ?? '400', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4);
  mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
  let fired = 0;
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000); // re-arm each tick (resets hit)
    mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    console.log(`[p7q] ${name} tick${c} CALC14 FIRED  hitAddr=${hx(r[17])} PC=${hx(r[16])}`);
    console.log(`   D0=${hx(r[0])} D1=${hx(r[1])} D2=${hx(r[2])} D3=${hx(r[3])} D4=${hx(r[4])} D5=${hx(r[5])}`);
    console.log(`   A2(out)=${hx(r[10])} A3(wave1)=${hx(r[11])} A4(fb)=${hx(r[12])} A0(rec)=${hx(r[8])}`);
    console.log(`   D2.w=${hx(r[2] & 0xffff)} D3.w=${hx(r[3] & 0xffff)}  inPlace(A2==A3||A2==A4)=${r[10] === r[11] || r[10] === r[12]}`);
    if (++fired >= 3) break;
  }
  if (!fired) console.log(`[p7q] ${name}: CALC13/14 never fired in ${maxTicks} ticks (PC ${hx(pcLo)}..${hx(pcHi)})`);
  mod._free(L); mod._free(R); mod._free(cap);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
