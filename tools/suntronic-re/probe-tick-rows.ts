/** probe-tick-rows.ts — DECISIVE 6-vs-10 resolver. Gates on voice0 $15 write
 * (outVolume, one clean write per EFFECTS/CIA tick, from frame 0 — no $24-poll
 * s16 aliasing). At each tick reads $2c/$2d/$2e (tempo counters) + $30(speed) +
 * period + pitch-hi. Answers: at which CIA tick does $2d reach row 2 (the
 * ballblaser note change)? If tick 10 → rows are ~5 (native flat-6 wrong); if
 * tick 12 → note-late is pure GNN/EFFECTS ordering. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba, TICKS = 16;
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
  // base0 discovery via busiest write PC in scan range
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
  const rW = (a: number): number => { const b = rB(a, 2); return (b[0] << 8) | b[1]; };
  // $15-gated tick clock from frame 0
  mod._uade_wasm_stop(); load();
  console.log(`\n${name} base0=${base0.toString(16)} $15-gated per-CIA-tick from frame 0:`);
  let tick = 0, prevPitchHi = -1;
  for (let s = 0; s < 60000 && tick < TICKS; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x15) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) {
      const b = base0;
      const tc = rB(b + 0x2c, 1)[0], rr = rB(b + 0x2d, 1)[0], pos = rW(b + 0x2e);
      const sp = rB(b + 0x30, 1)[0], per = rW(b + 0x20), pitchHi = rB(b + 0x08, 1)[0];
      const changed = pitchHi !== prevPitchHi;
      console.log(`  t${String(tick).padStart(2)} $2c=${tc} $2d=${rr} $2e=${pos} $30=${sp} per=${per} pitchHi=${pitchHi}${changed ? ' <-- PITCH CHANGE' : ''}`);
      prevPitchHi = pitchHi; tick++;
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
