/**
 * probe-tickspace.ts — measure the sample-spacing between successive handler-entry
 * (PC 0x2660e) fires, to find whether the CIA-B tick is uniform or whether row
 * ticks fire two handler runs close together (the suspected source of the golden
 * clock's "2-step $24" collapse). Renders tiny chunks and logs the cumulative
 * sample index of every chunk in which 0x2660e fired. NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const PC_LO = 0x2660e, PC_HI = 0x26610;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const chunk = parseInt(process.argv[3] ?? '8', 10);
  const nSamples = parseInt(process.argv[4] ?? '9000', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(chunk * 4), R = mod._malloc(chunk * 4), cap = mod._malloc(18 * 4);
  const hits: number[] = [];
  let pos = 0;
  while (pos < nSamples) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, chunk) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hits.push(pos);
    pos += chunk;
  }
  let prev = 0;
  console.log(`n hits=${hits.length} over ${pos} samples (avg ${(pos / hits.length).toFixed(1)} samp/hit)`);
  for (let i = 0; i < hits.length; i++) {
    const d = hits[i] - prev; prev = hits[i];
    console.log(`hit ${String(i).padStart(3)} @${String(hits[i]).padStart(6)}  d=${d}`);
  }
  mod._free(L); mod._free(R); mod._free(cap);
}
main().catch((e) => { console.error(e); process.exit(1); });
