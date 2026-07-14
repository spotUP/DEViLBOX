/** probe-subtick-timing.ts — render 1 sample at a time, read voice0 $24 after each,
 * record the exact sample index of every phase change (= one vibrato SUB-TICK). Then
 * bucket sub-ticks per 1024-fire and dump inter-subtick gaps. This isolates the CIA
 * sub-tick clock from all note/row/period effects: if the sub-tick timing IS a clean
 * integer accumulator (gap alternates P,P or a Bresenham of two integers) we can fit
 * it exactly; if the gaps jitter irregularly the wall is confirmed. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, NSAMP = 40000;
const CH = Number(process.argv[2] ?? 1); // render chunk size: 1=cycle-true, 128=app quantum, 1024=coarse

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
  const L = mod._malloc(CH * 4), R = mod._malloc(CH * 4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // locate busiest write-PC in scan range, then base0 = its lowest a0
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  const Lb = mod._malloc(1024 * 4), Rb = mod._malloc(1024 * 4);
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(Lb, Rb, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pc = 0, best = -1; for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(Lb, Rb, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  mod._uade_wasm_stop(); load();
  let prev = rW(base0 + 0x24); const changes: number[] = [];
  for (let s = 0; s < NSAMP; s += CH) {
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    const ph = rW(base0 + 0x24);
    // phase can advance by >1 step in a chunk; count each 8000-step as a sub-tick
    if (ph !== prev) {
      let d = (ph - prev) & 0xffff; if (d > 0x8000) d -= 0x10000;
      const steps = Math.max(1, Math.round(Math.abs(d) / 8000));
      for (let k = 0; k < steps; k++) changes.push(s + CH - 1);
      prev = ph;
    }
  }
  // sub-ticks per 1024-fire
  const fires = Math.floor(NSAMP / 1024);
  const perFire = new Array(fires).fill(0);
  for (const s of changes) { const f = Math.floor(s / 1024); if (f < fires) perFire[f]++; }
  // inter-subtick gaps
  const gaps: number[] = []; for (let i = 1; i < changes.length; i++) gaps.push(changes[i] - changes[i - 1]);
  const gapHist = new Map<number, number>(); for (const g of gaps) gapHist.set(g, (gapHist.get(g) ?? 0) + 1);
  console.log(`\n${name} base0=${base0.toString(16)} subticks=${changes.length} in ${NSAMP} samp (~${fires} fires)`);
  console.log(`  perFire[0..${fires - 1}] = ${perFire.join('')}`);
  console.log(`  doubles = ${perFire.filter((n) => n === 2).length}, singles = ${perFire.filter((n) => n === 1).length}, zeros = ${perFire.filter((n) => n === 0).length}`);
  console.log(`  mean subtick gap = ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3)} samp`);
  console.log(`  gap histogram = ${[...gapHist.entries()].sort((a, b) => a[0] - b[0]).map(([g, n]) => `${g}:${n}`).join('  ')}`);
  // fire indices that double (for placement diff vs model)
  const dbl = perFire.map((n, f) => (n === 2 ? f : -1)).filter((f) => f >= 0);
  console.log(`  double fires = [${dbl.join(',')}]`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
