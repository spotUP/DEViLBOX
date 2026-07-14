/** probe-tick-rate.ts — the un-masked $2c sequence. Render EXACTLY 1024 samples
 * per step (proven CIA tick period) and read $2c/$30/$2d at each tick boundary. On a
 * normal tick the readback = the addq result (1..5); on a wrap tick the handler ran
 * addq then clr so it reads 0. So the sequence reveals the true ticks/row directly:
 * [1,2,3,4,5,0] = 6-tick rows (wrap at 6), [1,2,3,4,0] = 5-tick rows (wrap at 5). This
 * settles the disasm(6) vs $15-count(5) contradiction with zero same-render masking.
 * NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICK = 1024, N = 40;
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
  const BIG = TICK * (N + 2);
  const L = mod._malloc(BIG * 4), R = mod._malloc(BIG * 4), cap = mod._malloc(72), rd = mod._malloc(8);
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
  const fires: number[] = [];
  for (let sm = 0; sm < 80000 && fires.length < N; sm++) {
    mod._uade_wasm_arm_capture((base0 + 0x15) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) fires.push(sm);
  }
  const gaps: number[] = []; for (let i = 1; i < fires.length; i++) gaps.push(fires[i] - fires[i-1]);
  const uniq = [...new Set(gaps)].sort((a,b)=>a-b);
  console.log(`\n${name} base0=${base0.toString(16)} $30=${rB(base0 + 0x30)} — $15-write (per-tick) sample gaps:`);
  console.log('  gaps: ' + gaps.join(','));
  console.log('  distinct: ' + uniq.join(', ') + ' | mean=' + (gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
