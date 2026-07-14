/** probe-fullsong-fires.ts — Phase A (corrected): the real SunTronic clock.
 *
 * probe-fire-eclock showed the note-PC fire and the $24 vibrato update are in
 * LOCKSTEP, exactly 1024 samples apart, over the first ~53 fires — one clock, not
 * two, and not 881.5. This extends the measurement over the WHOLE song to answer:
 *   (1) is the fire gap always 1024, or does it change (tempo changes)?
 *   (2) at each fire, what is voice0's $20 period? → cross-ref the golden to see if
 *       the 14 residual mismatches sit at anomalous-gap ticks (a TIMING problem) or
 *       at constant-1024 ticks with a wrong period (a vibrato-MATH problem).
 * The answer decides whether the fix lives at the clock layer (port timing) or the
 * arithmetic layer (vibrato accumulator). LOCAL diagnosis; not committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;
const STRIDE = 0x1ba;
const MAX_SAMPLES = 700 * 1100; // ~700 ticks headroom
const MAX_FIRES = 700;

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
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;

  // pass0: busiest write-PC (the per-tick voice loop) + base0.
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 300; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pc = 0, best = -1;
  for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };

  // full-song 1-sample loop: record every fire's sample index + voice0 period.
  mod._uade_wasm_stop(); load();
  const fires: number[] = [];
  const periods: number[] = [];
  for (let s = 0; s < MAX_SAMPLES && fires.length < MAX_FIRES; s++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    const r = mod._uade_wasm_render(L, R, 1);
    if (r <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) {
      fires.push(s);
      periods.push(rW(base0 + 0x20));
    }
  }
  const gaps = fires.slice(1).map((v, i) => v - fires[i]);
  const gh = new Map<number, number>();
  for (const g of gaps) gh.set(g, (gh.get(g) ?? 0) + 1);
  const ghStr = [...gh.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join(' ');
  const anomalies = gaps.map((g, i) => ({ g, i })).filter((x) => x.g !== 1024);

  console.log(`\n=== ${name} pc=${pc.toString(16)} base0=${base0.toString(16)} ===`);
  console.log(`  fires: ${fires.length}`);
  console.log(`  gap histogram: ${ghStr}`);
  console.log(`  non-1024 gaps: ${anomalies.length}` +
    (anomalies.length ? ` at tick indices ${anomalies.slice(0, 40).map((x) => `${x.i}(${x.g})`).join(',')}` : ''));
  console.log(`  voice0 period[0..24]: ${periods.slice(0, 25).join(',')}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

(async () => {
  await run('gliders.src');
  await run('ballblaser.src');
})().catch((e) => { console.error(e); process.exit(1); });
