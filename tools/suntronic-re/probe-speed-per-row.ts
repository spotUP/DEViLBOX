/** probe-speed-per-row.ts — is $30 (speed) constant or pattern-driven? Static disasm
 * wraps $2c at $30, so $30=6 → 6-tick rows unconditionally. But measured rows are
 * 5,5,5,5,5,6. The only reconciliation: $30 changes per row (GNN sets it from a note
 * stream tempo command). Gate on voice0 $2d write (row boundary, GNN just ran), read
 * $30 + $2d immediately. If $30 reads 5,5,5,5,5,6 the speed is pattern-driven and the
 * native flat-6 tick() is the bug. Also read voice0 $34 (the per-voice delay counter
 * found at 0x26670) to rule it in/out. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, ROWS = 20;
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
  const rB = (a: number, n: number): number[] => { mod._uade_wasm_read_memory(a >>> 0, rd, n); const b: number[] = []; for (let i = 0; i < n; i++) b.push(mod.HEAPU8[rd + i]); return b; };
  const rW = (a: number): number => { const b = rB(a, 2); return (b[0] << 8) | b[1]; };
  mod._uade_wasm_stop(); load();
  console.log(`\n${name} base0=${base0.toString(16)} — $30/$34 at each row boundary ($2d write):`);
  let row = 0, lastS = 0;
  for (let s = 0; s < 200000 && row < ROWS; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x2d) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) {
      const sp = rB(base0 + 0x30, 1)[0], rr = rB(base0 + 0x2d, 1)[0], d34 = rW(base0 + 0x34), pos = rB(base0 + 0x2e, 1)[0];
      const gap = s - lastS; lastS = s;
      console.log(`  row${String(row).padStart(2)} s=${String(s).padStart(6)} gap=${String(gap).padStart(5)} | $30(speed)=${sp} $2d=${rr} $2e(pos)=${pos} $34(delay)=${d34}`);
      row++;
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
