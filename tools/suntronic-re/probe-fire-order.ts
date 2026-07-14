/** probe-fire-order.ts — read voice0 $24(vibPhase) $26(vibIndex) $08(pitch) $20(period)
 * right AFTER each uniform 1024 fire, gliders fires 0..11, plus the instrument's
 * freqEnvSpeed + vibDepth[] (from the JS parser). Lets us reproduce the exact 68k
 * EFFECTS compute order (which $24/$26 the period is read at on a double fire) offline
 * and match the golden 251,253,256,258,256,252,... NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, FIRES = 12;

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
  mod._uade_wasm_stop(); load();
  console.log(`\n${name} base0=${base0.toString(16)}`);
  for (let f = 0; f < FIRES; f++) {
    if (mod._uade_wasm_render(L, R, 1024) <= 0) break;
    const ph = (rW(base0 + 0x24) << 16) >> 16, idx = rW(base0 + 0x26), pit = rW(base0 + 0x08), per = rW(base0 + 0x20);
    console.log(`  f${String(f).padStart(2)} phase=${String(ph).padStart(7)} idx=${idx} pitch=${pit.toString(16)} period=${per}`);
  }
  // dump instrument freqEnvSpeed + vibDepth via the JS parser
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyScore = score as any;
  const insts = anyScore.instruments ?? anyScore.synths ?? [];
  if (insts.length) {
    const i0 = insts[0];
    console.log(`  inst0 freqEnvSpeed=${i0.freqEnvSpeed} freqEnvLen=${i0.freqEnvLen} freqEnvLoop=${i0.freqEnvLoop} vibDepth=[${Array.from(i0.vibDepth ?? []).join(',')}]`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); })().catch((e) => { console.error(e); process.exit(1); });
