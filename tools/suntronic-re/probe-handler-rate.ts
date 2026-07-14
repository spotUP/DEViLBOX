/** probe-handler-rate.ts — definitive music-tick rate. Gate on the tempo-handler
 * entry PC 0x26606, 1 sample/render, record the absolute sample of each hit. The gap
 * between hits IS the true handler period — no $15/$24 flush buffering, no 1024-block
 * quantization. Resolves whether the handler runs at uniform 1024 (43Hz), 882 (50Hz),
 * or a mixed rate that makes speed=6 rows come out 5 audio-blocks long. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const ENTRY = 0x26606, HITS = 40;
async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
  const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
  mod._free(p); mod._free(h);
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(72);
  const fires: number[] = [];
  for (let s = 0; s < 60000 && fires.length < HITS; s++) {
    mod._uade_wasm_arm_capture_pc(ENTRY, (ENTRY + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) fires.push(s);
  }
  const gaps: number[] = [];
  for (let i = 1; i < fires.length; i++) gaps.push(fires[i] - fires[i - 1]);
  console.log(`\n${name} handler(0x26606) hit samples (first ${HITS}):`);
  console.log(`  fires: ${fires.join(',')}`);
  console.log(`  gaps : ${gaps.join(',')}`);
  const uniq = [...new Set(gaps)].sort((a, b) => a - b);
  console.log(`  distinct gaps: ${uniq.join(', ')}  | mean=${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); })().catch(e => { console.error(e); process.exit(1); });
