/**
 * p8b-dispatch-map.ts — map SunTronic synthType (record+0x23) -> loaded CALC body PC
 * by PC-capturing the MEGAEFFECTS jump-table dispatch `jmp (a3)` at 0x26c5a. At that
 * point a3 (r[11]) = the resolved CALC target PC and a1 (r[9]) = current record;
 * read (a1)+0x23 for the synthType. Also grabs D1 (r[1], arp value) since type-1
 * internally branches noise(d1=-1)/pulse on it.
 *
 * Usage: npx tsx tools/suntronic-re/p8b-dispatch-map.ts [module.src] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);
const PC_LO = 0x26c5a, PC_HI = 0x26c5c; // the `jmp (a3)` dispatch

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const maxTicks = parseInt(process.argv[3] ?? '400', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(4);
  const seen = new Map<string, number>(); // "type,pc" -> count
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const a1 = r[9] >>> 0, a3 = r[11] >>> 0, d1 = (r[1] << 24) >> 24;
    mod._uade_wasm_read_memory((a1 + 0x23) >>> 0, rd, 1);
    const synthType = mod.HEAPU8[rd];
    const key = `${synthType},${hx(a3)},d1=${d1}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  console.log(`[p8b] ${name} dispatch map (synthType, targetPC, d1):`);
  for (const [k, n] of [...seen.entries()].sort()) console.log(`   type=${k}  x${n}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
