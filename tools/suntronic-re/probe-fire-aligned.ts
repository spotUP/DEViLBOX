/** probe-fire-aligned.ts — sample UADE per NOTE-HANDLER FIRE (PC pcLo, 128-sample
 * chunk detection — the SAME clock the committed golden is emitted on), reading v0
 * $24(vib)/$2d(row)/$20(period). Prints vib steps since previous FIRE and marks row
 * changes, so the cadence is measured on the golden's own clock (not aliased 1024
 * buffers). This is the ground truth the native tick() must match 1:1. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, CH = 128, N = 64;
const STEP = Number(process.argv[3] ?? 0x1f40);

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
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 300; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, wb = -1; for (const [p, n] of hist) if (n > wb) { wb = n; pcLo = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 80; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  mod._uade_wasm_stop(); load();
  const out: string[] = [];
  let prev = -1, lastRow = -1, fires = 0, guard = 0, samplesSinceFire = 0;
  const gaps: number[] = [];
  while (fires < N && guard++ < N * 40) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    samplesSinceFire += CH;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const vib = rW(base0 + 0x24), row = rB(base0 + 0x2d), per = rW(base0 + 0x20);
    const steps = prev < 0 ? 0 : Math.round((((vib - prev) & 0xffff) << 16 >> 16) / STEP);
    const bnd = row !== lastRow ? `  <ROW ${row}>` : '';
    out.push(`f${String(fires).padStart(2)} vib=${vib.toString(16).padStart(4, '0')} steps=${steps} p=${per}${bnd}  (~${samplesSinceFire}samp)`);
    if (fires > 0) gaps.push(samplesSinceFire);
    prev = vib; lastRow = row; fires++; samplesSinceFire = 0;
  }
  console.log(`\n${name} base0=${base0.toString(16)} pcLo=${pcLo.toString(16)} meanGap=${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)}`);
  console.log(out.join('\n'));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run(process.argv[2] ?? 'gliders.src'); })().catch((e) => { console.error(e); process.exit(1); });
