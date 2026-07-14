/** probe-row-lengths.ts — jitter-free row-length measurement. Gates on the voice0
 * $2d write (0x2668c addq.b #1,$2d — fires exactly once per row boundary). Reports
 * the sample gap between consecutive row boundaries → row length in samples; /1024
 * (proven tick size) = ticks per row. Settles whether UADE rows are a uniform 6
 * ticks or the first row differs (which would explain native's one-tick lag from
 * row 2 on). NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba;
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
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pc = 0, best = -1; for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rB = (a: number, n: number): number[] => { mod._uade_wasm_read_memory(a >>> 0, rd, n); const b: number[] = []; for (let i = 0; i < n; i++) b.push(mod.HEAPU8[rd + i]); return b; };
  // gate on voice0 $2d write (one per row boundary); record sample index of each
  mod._uade_wasm_stop(); load();
  const fires: number[] = []; const dvals: number[] = []; const svals: number[] = [];
  for (let s = 0; s < 80000 && fires.length < 12; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x2d) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { fires.push(s); dvals.push(rB(base0 + 0x2d, 1)[0]); svals.push(rB(base0 + 0x30, 1)[0]); }
  }
  console.log(`  $30 speed : ${svals.join(',')}`);
  const gaps: string[] = [];
  for (let i = 1; i < fires.length; i++) { const g = fires[i] - fires[i - 1]; gaps.push(`${g}(${(g / 1024).toFixed(2)}t)`); }
  console.log(`\n${name} base0=${base0.toString(16)} $2d-write row boundaries:`);
  console.log(`  fire sample: ${fires.join(',')}`);
  console.log(`  $2d after : ${dvals.join(',')}`);
  console.log(`  gaps      : ${gaps.join(' ')}`);
  console.log(`  first fire at sample ${fires[0]} = tick ${(fires[0] / 1024).toFixed(2)}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
