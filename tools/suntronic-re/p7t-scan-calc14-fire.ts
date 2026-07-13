/**
 * p7t-scan-calc14-fire.ts — find corpus modules that actually EXECUTE the CALC13/14
 * feedback loop at 0x26dc8 (store at 0x26e36). PC-filtered register capture; reports
 * byteLen (D6+1), out base (A2-1), wave1 base (A3-1), and the live D0/D2/D3.
 *
 * Usage: npx tsx tools/suntronic-re/p7t-scan-calc14-fire.ts [maxTicks] [globSubstr]
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);
const PC_LO = 0x26e08, PC_HI = 0x26e3a; // 0x26dc8 CALC14 loop body

async function scan(name: string, maxTicks: number): Promise<string | null> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  try {
    if (mod._uade_wasm_init(44100) !== 0) return null;
    addCompanions(mod, loadInstrCompanions());
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) { mod._free(ptr); mod._free(hp); return null; }
    mod._free(ptr); mod._free(hp);
    const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4);
    for (let c = 0; c < maxTicks; c++) {
      mod._uade_wasm_arm_capture(0x20000, 0x10000);
      mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
      if (mod._uade_wasm_render(L, R, 882) <= 0) break;
      if (!mod._uade_wasm_get_capture(cap)) continue;
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
      const len = (r[6] & 0xffff) + 1; // D6 remaining+1 at first store ~ byteLen
      mod._free(L); mod._free(R); mod._free(cap);
      return `tick${c} FIRED PC=${hx(r[16])} D6=${hx(r[6] & 0xffff)} lenGuess=${len} A2=${hx(r[10])} A3=${hx(r[11])} A4=${hx(r[12])} D0=${hx(r[0] & 0xffff)} D2=${hx(r[2] & 0xffff)} D3=${hx(r[3] & 0xffff)}`;
    }
    mod._free(L); mod._free(R); mod._free(cap);
  } finally { try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } }
  return null;
}

async function main(): Promise<void> {
  const maxTicks = parseInt(process.argv[2] ?? '150', 10);
  const sub = (process.argv[3] ?? '').toLowerCase();
  const mods = readdirSync(CORPUS_DIR).filter((f) => !f.startsWith('.') && f.toLowerCase().includes(sub) && /\.(src|pc)$|^mule|^Lightforce|^kompo2$/i.test(f));
  console.log(`[p7t] scanning ${mods.length} modules for CALC13/14 (0x26dc8) execution`);
  let found = 0;
  for (const m of mods) {
    let res: string | null = null;
    try { res = await scan(m, maxTicks); } catch (e) { console.log(`  ${m}: ERR ${(e as Error).message}`); continue; }
    if (res) { found++; console.log(`### ${m}: ${res}`); }
  }
  console.log(`[p7t] done. ${found}/${mods.length} run CALC13/14.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
