/** p8e-pc-histogram.ts — histogram the FIRST captured PC per render chunk within a
 *  window, to see which instructions of the type-1 block actually execute. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'sound-test.src';
  const lo = parseInt(process.argv[3] ?? '0x26c8a', 16);
  const hi = parseInt(process.argv[4] ?? '0x26cf0', 16);
  const maxTicks = parseInt(process.argv[5] ?? '250', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4);
  const hist = new Map<number, number>(); const d0at = new Map<number, Set<number>>();
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(lo, hi);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const pc = hh[(cap >> 2) + 16] >>> 0; const d0 = (hh[(cap >> 2)] << 24) >> 24;
    hist.set(pc, (hist.get(pc) ?? 0) + 1);
    if (!d0at.has(pc)) d0at.set(pc, new Set());
    d0at.get(pc)!.add(d0);
  }
  mod._free(L); mod._free(R); mod._free(cap);
  console.log(`[p8e] ${name} PC histogram in ${hx(lo)}..${hx(hi)}:`);
  for (const [pc, n] of [...hist.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`   ${hx(pc)}  x${n}  d0(int8)={${[...d0at.get(pc)!].sort((a, b) => a - b).join(',')}}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
