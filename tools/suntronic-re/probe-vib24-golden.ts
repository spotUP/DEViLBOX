/** probe-vib24-golden.ts — capture UADE golden per-fire $24(vibPhase)/$20(period)/
 * $08(acc) for gliders v0 at the tick-handler fire PC, and compare against native
 * SunTronicPlayer per-tick $24/$20/$08. Since pitch($08) matches at d=-1 but period
 * doesn't, the divergence is the vibrato $24 term — this shows whether native $24
 * tracks golden $24 (→ alignment/seed) or differs in value (→ freqEnvSpeed/advance). */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICKS = 24, SPT = 882;
const name = process.argv[2] ?? 'gliders.src';

async function run(): Promise<void> {
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
  const L = mod._malloc(SPT * 4), R = mod._malloc(SPT * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  const pcHi = (pcLo + 2) >>> 0;
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 80; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const rB = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 1); return mod.HEAPU8[rd]; };
  const s16 = (x: number): number => (x & 0x8000) ? x - 0x10000 : x;
  // per-fire golden: read $24/$20/$08 + tempo counters at each PC fire (chunk=128)
  mod._uade_wasm_stop(); load();
  const gold: { p24: number; p20: number; p08: number; c2c: number; c30: number; c2d: number; c31: number; c34: number }[] = [];
  let guard = 0;
  while (gold.length < TICKS && guard++ < TICKS * 40) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, 128) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) gold.push({
      p24: s16(rW(base0 + 0x24)), p20: rW(base0 + 0x20), p08: rW(base0 + 0x08),
      c2c: rB(base0 + 0x2c), c30: rB(base0 + 0x30), c2d: rB(base0 + 0x2d), c31: rB(base0 + 0x31), c34: rW(base0 + 0x34),
    });
  }
  console.log(`\n=== ${name} v0 tempo counters per fire ===`);
  console.log('gi  $2c/$30  $2d/$31  $34   $24     $20');
  for (let gi = 0; gi < gold.length; gi++) {
    const g = gold[gi];
    console.log(`${String(gi).padStart(2)}   ${g.c2c}/${g.c30}     ${g.c2d}/${g.c31}    ${g.c34}   ${String(g.p24).padStart(7)} ${g.p20}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // native
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  const nat: { p24: number; p20: number; p08: number }[] = [];
  for (let i = 0; i < TICKS + 2; i++) {
    const v = pl.tick().voices[0];
    // read internal $24 via any-cast (vibPhase), period, pitch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vv = (pl as any).voices[0];
    nat.push({ p24: s16(vv.vibPhase & 0xffff), p20: v.period, p08: v.acc & 0xffff });
  }
  console.log(`\n=== ${name} v0 :: golden fire vs native tick ===`);
  console.log('gi   gold[$24  $20  $08]     nat[i-1][$24  $20  $08]   nat[i][$24 $20]');
  for (let gi = 0; gi < gold.length; gi++) {
    const g = gold[gi];
    const nm1 = nat[gi] ?? { p24: 0, p20: 0, p08: 0 };   // d=-1: native[gi+1]==golden[gi] → native idx gi is the "priming+gi"; native[gi] aligns golden[gi-1]; use nat[gi] as candidate
    const n0 = nat[gi + 1] ?? { p24: 0, p20: 0, p08: 0 };
    console.log(
      `${String(gi).padStart(2)}  ${String(g.p24).padStart(7)} ${String(g.p20).padStart(4)} ${g.p08.toString(16).padStart(4)}   ` +
      `${String(nm1.p24).padStart(7)} ${String(nm1.p20).padStart(4)} ${nm1.p08.toString(16).padStart(4)}   ` +
      `${String(n0.p24).padStart(7)} ${String(n0.p20).padStart(4)}`,
    );
  }
}
run();
