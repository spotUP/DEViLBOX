/** p8a-dump-calc3-bin.ts — dump loaded MEGAEFFECTS code window to a raw bin for capstone. */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const lo = parseInt(process.argv[3] ?? '0x26c00', 16);
  const hi = parseInt(process.argv[4] ?? '0x26e40', 16);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4);
  for (let c = 0; c < 4; c++) mod._uade_wasm_render(L, R, 882);
  mod._free(L); mod._free(R);
  const len = hi - lo; const out = mod._malloc(len);
  mod._uade_wasm_read_memory(lo, out, len);
  const buf = Buffer.from(mod.HEAPU8.slice(out, out + len)); mod._free(out);
  const outPath = join(process.cwd(), 'scratch-calc3.bin');
  writeFileSync(outPath, buf);
  console.log(`wrote ${len} bytes @0x${lo.toString(16)} -> ${outPath}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
