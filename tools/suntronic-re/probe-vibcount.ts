/** probe-vibcount.ts — per audio-tick, read UADE voice0 $24(vibPhase) and $2d(row),
 * print the number of freqEnvSpeed steps $24 advanced since the previous tick and
 * mark row-boundary ticks. Reveals whether vibrato advances == CIA ticks elapsed
 * (my model) and how that lines up with the $2d boundary schedule. freqEnvSpeed is
 * read from the loaded instrument record. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICK = 1024, N = 64;
const STEP = Number(process.argv[3] ?? 0x1f40); // freqEnvSpeed of v0's instrument

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
  const L = mod._malloc(TICK * 4), R = mod._malloc(TICK * 4), cap = mod._malloc(72), rd = mod._malloc(8);
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
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  let prev = rW(base0 + 0x24), lastRow = rB(base0 + 0x2d);
  const out: string[] = [];
  for (let t = 0; t < N; t++) {
    mod._uade_wasm_render(L, R, TICK);
    const vib = rW(base0 + 0x24), row = rB(base0 + 0x2d);
    const delta = ((vib - prev) & 0xffff);
    const steps = STEP ? Math.round(((delta << 16) >> 16) / STEP) : 0;
    const bnd = row !== lastRow ? `  <ROW ${row}>` : '';
    out.push(`t${String(t).padStart(2)} vib=${vib.toString(16).padStart(4, '0')} steps=${steps}${bnd}`);
    prev = vib; lastRow = row;
  }
  console.log(`\n${name} base0=${base0.toString(16)} step=0x${STEP.toString(16)}`);
  console.log(out.join('\n'));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run(process.argv[2] ?? 'gliders.src'); })().catch((e) => { console.error(e); process.exit(1); });
