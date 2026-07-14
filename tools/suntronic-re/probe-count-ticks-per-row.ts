/** probe-count-ticks-per-row.ts — resolve the static/dynamic contradiction. Static
 * disasm: $2c only ever ++ (0x2667a) or clr→0 (0x26688), wrap at $30=6 → 6-tick rows
 * always. Dynamic sample-gap: rows are 5120/6144 = 5 or 6 ticks. Count the ACTUAL
 * $2c-increment events between $2d changes. Gate every $2c write, read back $2c: the
 * addq leaves nonzero, the wrap clr leaves 0 — count only nonzero hits (true tick).
 * When $2d increments, emit the tick count since the last boundary. If it prints 6
 * uniformly the sample-gap interpretation was wrong; if 5/6 the disasm model of $2c is
 * incomplete (a write we haven't located). NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, ROWS = 16;
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
  let wpc = 0, wbest = -1; for (const [p, n] of hist) if (n > wbest) { wbest = n; wpc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(wpc, (wpc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  console.log(`\n${name} base0=${base0.toString(16)} — $2c-increment events between $2d changes:`);
  let row = 0, ticks = 0, lastRR = rB(base0 + 0x2d), seq: number[] = [];
  for (let s = 0; s < 200000 && row < ROWS; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x2c) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) {
      const tc = rB(base0 + 0x2c);           // value after this $2c write
      if (tc !== 0) { ticks++; seq.push(tc); } // nonzero = addq (real tick); 0 = wrap clr
      const rr = rB(base0 + 0x2d);
      if (rr !== lastRR) {
        console.log(`  row${String(row).padStart(2)} ticks=${ticks} seq=[${seq.join(',')}] ($2d ${lastRR}->${rr})`);
        row++; ticks = 0; seq = []; lastRR = rr;
      }
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
