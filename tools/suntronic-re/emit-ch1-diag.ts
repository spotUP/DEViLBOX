/** emit-ch1-diag.ts — Path-B step 1 (diagnostic, print-only, does NOT overwrite golden).
 * Locate the tick-handler write-PC + voice base0 with the proven CH=128 passes (identical to
 * emit-note-timeline-golden), then sample the $20 period per NOTE-handler fire but reading the
 * period the instant AFTER it is written — by arming a MEMORY-WRITE capture on voice0 $20 and
 * rendering fine. Compares CH=128 (current golden method) vs a period-write-triggered stream to
 * see the cycle-true, chunk-artifact-free vibrato. Prints v0 period[0..15] + double-fire count.
 * If the write-triggered stream is uniform (1 vib step/fire, no doubles), that is the CH=1
 * cycle-true oracle and the uniform native model (ciaTick=1024) should match it. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba, SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICKS = 80;

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
  const SPT = 882;
  const L = mod._malloc(SPT * 4), R = mod._malloc(SPT * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // pass0: detect handler write-PC (proven CH-large histogram argmax)
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  const pcHi = (pcLo + 2) >>> 0;
  // pass1: base0 = min A0 at that PC
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < TICKS; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const per0 = (): number => rW(base0 + 0x20);

  // METHOD A: current golden method — one fire per CH=128 chunk with a PC hit, read $20 at chunk end.
  const runCH = (CH: number): number[] => {
    mod._uade_wasm_stop(); load();
    const out: number[] = []; let guard = 0;
    while (out.length < 16 && guard++ < TICKS * 20) {
      mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
      if (mod._uade_wasm_render(L, R, CH) <= 0) break;
      if (mod._uade_wasm_get_capture(cap)) out.push(per0());
    }
    return out;
  };
  const ch128 = runCH(128);
  const ch32 = runCH(32);
  const ch8 = runCH(8);

  // METHOD B: period-write-triggered — arm memory-write capture on voice0 $20, render fine, record
  // the value each time $20 is written (the true settled per-write period stream, no chunk aliasing).
  const writeStream = (renderN: number): number[] => {
    mod._uade_wasm_stop(); load();
    const wr: number[] = []; let guard = 0;
    while (wr.length < TICKS && guard++ < TICKS * 2000) {
      mod._uade_wasm_arm_capture(base0 + 0x20, 2); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
      if (mod._uade_wasm_render(L, R, renderN) <= 0) break;
      if (mod._uade_wasm_get_capture(cap)) wr.push(per0());
    }
    return wr;
  };
  const wr1 = writeStream(1);
  const wr882 = writeStream(882);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  const eq = (a: number[], b: number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
  console.log(`\n${name}  base0=0x${base0.toString(16)} pcLo=0x${pcLo.toString(16)}`);
  console.log(`  CH=128 v0[0..15]     = ${ch128.join(',')}`);
  console.log(`  CH=32  v0[0..15]     = ${ch32.join(',')}`);
  console.log(`  CH=8   v0[0..10]     = ${ch8.join(',')}`);
  console.log(`  $20-write render=1   = ${wr1.slice(0, 16).join(',')}`);
  console.log(`  $20-write render=882 = ${wr882.slice(0, 16).join(',')}`);
  console.log(`  render1==render882? ${eq(wr1, wr882)}   len ${wr1.length}/${wr882.length}`);
  console.log(`  FULL write render=1 (${wr1.length}): ${wr1.join(',')}`);
}

(async () => { for (const n of ['gliders.src', 'ballblaser.src']) await run(n); })().catch((e) => { console.error(e); process.exit(1); });
