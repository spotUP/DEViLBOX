/** probe-fire-eclock.ts — EXACT (1-sample) gap measurement to settle the two-clock
 * ratio. Renders 1 sample at a time; at each sample records (a) whether the note
 * handler PC fired (capture latch) and (b) whether voice0 $24 changed (a CIA tick).
 * Prints the exact sample index of every fire + every $24 change and the gap
 * histograms, so we read UADE's real integer period instead of a swept constant.
 * NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, SAMPLES = 55000, MAXEV = 70;

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
  // discover busiest write-PC (the note handler) + lowest a0 = base0
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

  // 1-sample loop: record exact sample index of each handler fire + each $24 change
  mod._uade_wasm_stop(); load();
  const fires: number[] = [], vibs: number[] = [];
  let prevVib = rW(base0 + 0x24);
  for (let s = 0; s < SAMPLES && (fires.length < MAXEV || vibs.length < MAXEV); s++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap) && fires.length < MAXEV) fires.push(s);
    const cur = rW(base0 + 0x24);
    if (cur !== prevVib && vibs.length < MAXEV) { vibs.push(s); prevVib = cur; }
  }
  const gaps = (a: number[]): number[] => a.slice(1).map((v, i) => v - a[i]);
  const h = (g: number[]): string => { const m = new Map<number, number>(); for (const x of g) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join(' '); };
  const fg = gaps(fires), vg = gaps(vibs);
  const mean = (a: number[]): string => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  console.log(`\n${name} pc=${pc.toString(16)} base0=${base0.toString(16)}`);
  console.log(`  FIRE gaps (n=${fg.length}) mean=${mean(fg)}  hist: ${h(fg)}`);
  console.log(`  $24  gaps (n=${vg.length}) mean=${mean(vg)}  hist: ${h(vg)}`);
  console.log(`  first fires: ${fires.slice(0, 16).join(',')}`);
  console.log(`  first $24s:  ${vibs.slice(0, 16).join(',')}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
