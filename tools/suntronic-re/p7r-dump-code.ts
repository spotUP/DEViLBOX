/** p7r-dump-code.ts — hex-dump loaded replayer code windows for manual disassembly. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => (n >>> 0).toString(16);
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'we_music_two.src';
  const wins = (process.argv[3] ?? '0x265e0:0x26640,0x26e00:0x26f00').split(',').map((s) => s.split(':').map((x) => parseInt(x, 16)));
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4);
  for (let c = 0; c < 4; c++) mod._uade_wasm_render(L, R, 882);
  mod._free(L); mod._free(R);
  for (const [lo, hi] of wins) {
    const len = hi - lo; const out = mod._malloc(len);
    mod._uade_wasm_read_memory(lo, out, len);
    const buf = mod.HEAPU8.slice(out, out + len); mod._free(out);
    console.log(`\n=== ${hx(lo)}..${hx(hi)} ===`);
    for (let i = 0; i < len; i += 16) {
      let line = hx(lo + i).padStart(6, '0') + ': ';
      for (let j = 0; j < 16 && i + j < len; j += 2) {
        line += buf[i + j].toString(16).padStart(2, '0') + buf[i + j + 1].toString(16).padStart(2, '0') + ' ';
      }
      console.log(line);
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
