/** p8d-scan-calc3.ts — find corpus modules that EXECUTE the type-1 pulse body @0x26d4a
 *  (as opposed to the noise body @0x26d1e). Reports fire count, arp, byteLen, in-place? */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const PC_LO = 0x26c8a, PC_HI = 0x26c8c;
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
    let fires = 0, freeSrc = 0; const arps = new Set<number>(); let bl = 0;
    for (let c = 0; c < maxTicks; c++) {
      mod._uade_wasm_arm_capture(0x20000, 0x10000);
      mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
      if (mod._uade_wasm_render(L, R, 882) <= 0) break;
      if (!mod._uade_wasm_get_capture(cap)) continue;
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
      fires++; arps.add(s8(r[0] & 0xff)); bl = (r[6] & 0xffff) + 1;
      if ((r[10] >>> 0) !== (r[11] >>> 0)) freeSrc++;
    }
    mod._free(L); mod._free(R); mod._free(cap);
    if (fires === 0) return null;
    return `fires=${fires} freeSrc(tick0)=${freeSrc} byteLen=${bl} arps={${[...arps].sort((a, b) => a - b).join(',')}}`;
  } finally { try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } }
}
async function main(): Promise<void> {
  const maxTicks = parseInt(process.argv[2] ?? '300', 10);
  const mods = readdirSync(CORPUS_DIR).filter((f) => /\.(src|pc)$/i.test(f) || /^mule|^kompo|^time|^glid|^para/i.test(f));
  console.log(`[p8d] scanning ${mods.length} modules for CALC3 pulse (0x26d4a)`);
  let found = 0;
  for (const m of mods) {
    let res: string | null = null;
    try { res = await scan(m, maxTicks); } catch (e) { console.log(`  ${m}: ERR ${(e as Error).message}`); continue; }
    if (res) { found++; console.log(`### ${m}: ${res}`); }
  }
  console.log(`[p8d] ${found} modules run CALC3 pulse.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
