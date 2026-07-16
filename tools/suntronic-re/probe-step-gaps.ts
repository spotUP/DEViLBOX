/** probe-step-gaps.ts — dump the EXACT per-player-step sample schedule from UADE.
 * Render 1 sample at a time; each time $24 (voice0 vibPhase) advances by k*0x1f40
 * record the sample index. Print the inter-step gap sequence (the real fire schedule)
 * and its stats. This is the ground truth the TS clock must reproduce: is it a clean
 * floor/ceil of a constant period (→ replicable accumulator) or scheduler-jittered? */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const name = process.argv[2] ?? 'gliders.src';
const base0 = name === 'gliders.src' ? 0x26f8a : 0x25f6a;
const NSAMP = 60 * 1024;
(async () => {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    mod._uade_wasm_load(p, data.byteLength, h); mod._free(p); mod._free(h);
  };
  const L = mod._malloc(4), R = mod._malloc(4), rd = mod._malloc(64);
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const s16 = (x: number): number => (x & 0x8000) ? x - 0x10000 : x;
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  let prev = s16(rW(base0 + 0x24));
  const stepSamples: number[] = [];   // sample index of each advance (double counts as 2 at same idx)
  console.log('step | sample | n | $2c $2d $2e $30 $34  $20  $08');
  let stepNo = 0;
  for (let s = 0; s < NSAMP; s++) {
    if (mod._uade_wasm_render(L, R, 1) <= 0) { console.log('ended at', s); break; }
    const c = s16(rW(base0 + 0x24));
    if (c !== prev) {
      let d = c - prev; if (d < -4000) d += 65536;
      const n = Math.max(1, Math.round(d / 8000));
      for (let k = 0; k < n; k++) stepSamples.push(s);
      if (stepNo < 60) {
        const c2c = rB(base0 + 0x2c), c2d = rB(base0 + 0x2d), c2e = rB(base0 + 0x2e);
        const c30 = rB(base0 + 0x30), c34 = rW(base0 + 0x34), p20 = rW(base0 + 0x20), p08 = rW(base0 + 0x08);
        console.log(`${String(stepNo).padStart(4)} | ${String(s).padStart(6)} | ${n} | ${String(c2c).padStart(2)} ${String(c2d).padStart(2)} ${String(c2e).padStart(2)} ${String(c30).padStart(2)} ${String(c34).padStart(3)}  ${String(p20).padStart(4)} ${p08.toString(16).padStart(4)}${n >= 2 ? '  <== DOUBLE' : ''}`);
      }
      stepNo += n; prev = c;
    }
  }
  const gaps: number[] = [];
  for (let i = 1; i < stepSamples.length; i++) gaps.push(stepSamples[i] - stepSamples[i - 1]);
  const nz = gaps.filter((g) => g > 0);
  const mean = nz.reduce((a, b) => a + b, 0) / nz.length;
  console.log(`${name}: ${stepSamples.length} steps over ${NSAMP} samples`);
  console.log(`first step at sample ${stepSamples[0]}`);
  console.log(`gap sequence (0 = double at same sample):`);
  console.log(gaps.slice(0, 80).join(','));
  const hist = new Map<number, number>();
  for (const g of gaps) hist.set(g, (hist.get(g) ?? 0) + 1);
  console.log('gap histogram:', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([g, n]) => `${g}:${n}`).join(' '));
  console.log(`mean nonzero gap = ${mean.toFixed(3)} samples (=${(44100 / mean).toFixed(3)} Hz)`);
})();
