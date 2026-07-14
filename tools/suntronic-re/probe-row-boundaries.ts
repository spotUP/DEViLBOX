/** probe-row-boundaries.ts — the EXACT audio-tick indices at which UADE advances a row
 * ($2d increments). Render 1024 samples/tick (proven audio-tick), read voice0 $2d each
 * tick, record the tick index whenever it changes. This is the ground-truth boundary
 * schedule the native accumulator must reproduce; comparing gaps tells us the true CIA
 * period (rowLen = gap×1024 ≈ speed×ciaTick). NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICK = 1024, N = 80;
async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
    mod._free(p); mod._free(h);
  };
  const BIG = TICK, L = mod._malloc(BIG * 4), R = mod._malloc(BIG * 4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let wpc = 0, wbest = -1; for (const [p, n] of hist) if (n > wbest) { wbest = n; wpc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(wpc, (wpc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  const bounds: number[] = [];
  let last = rB(base0 + 0x2d);
  for (let t = 0; t < N; t++) {
    mod._uade_wasm_render(L, R, TICK);
    const rr = rB(base0 + 0x2d);
    if (rr !== last) { bounds.push(t); last = rr; }
  }
  const gaps: number[] = []; for (let i = 1; i < bounds.length; i++) gaps.push(bounds[i] - bounds[i - 1]);
  console.log(`\n${name} base0=${base0.toString(16)} $30=${rB(base0 + 0x30)} — row-boundary audio-tick indices:`);
  console.log('  bounds=[' + bounds.join(',') + ']');
  console.log('  gaps  =[' + gaps.join(',') + ']  mean=' + (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3));
  console.log('  implied ciaTick = mean_gap*1024/6 = ' + (gaps.reduce((a, b) => a + b, 0) / gaps.length * 1024 / 6).toFixed(2));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
