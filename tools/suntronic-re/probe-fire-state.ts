/** probe-fire-state.ts — now that fires are known-uniform (exactly 1024 samples,
 * see probe-fire-eclock.ts), render exactly 1024 samples per step and read voice0
 * state right after each fire: $24(vib) $2c(tempoTick) $2d(row) $30(speed) $20(period).
 * Reveals how the row counter actually advances (the 5-mostly-6 cadence) under a
 * uniform clock + static speed — i.e. the true mechanism, no accumulator guess.
 * NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, FIRES = 40;

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
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4), cap = mod._malloc(72), rd = mod._malloc(8);
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
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  console.log(`\n${name} pc=${pc.toString(16)} base0=${base0.toString(16)}`);
  let lastRow = -1, lastVib = 0;
  for (let f = 0; f < FIRES; f++) {
    if (mod._uade_wasm_render(L, R, 1024) <= 0) break;
    const vib = (rW(base0 + 0x24) << 16) >> 16, tc = rB(base0 + 0x2c), row = rB(base0 + 0x2d);
    const spd = rB(base0 + 0x30), per = rW(base0 + 0x20);
    const dv = f === 0 ? 0 : vib - lastVib, steps = Math.round(dv / 0x1f40);
    console.log(`  f${String(f).padStart(2)} $2c=${String(tc).padStart(2)} $2d=${String(row).padStart(2)}${row !== lastRow ? ' <ROW>' : '     '} spd=${spd} vib=${String(vib).padStart(7)} dSteps=${steps} p=${per}`);
    lastRow = row; lastVib = vib;
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
