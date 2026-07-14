/** probe-fixed-step.ts — SKIP-PROOF oracle. probe-clockcount proved one CIA tick =
 * uniform 1024 samples. So render exactly 1024 samples per step = advance exactly
 * one tick, snapshot all 4 voices — NO memory/PC gate to drop boundary ticks (the
 * flaw that made $15/$24 oracles run behind real CIA ticks and fake a "note one
 * tick late"). Sweeps a small sample phase offset to lock alignment, then reports
 * the min-mismatch phase vs the native player. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba, TICKS = 40, TICK_SAMPLES = 882;
type Snap = { period: number; acc: number; vol: number; flags: number; tc: number; rr: number };
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
  const BIG = TICK_SAMPLES * (TICKS + 4);
  const L = mod._malloc(BIG * 4), R = mod._malloc(BIG * 4), cap = mod._malloc(72), rd = mod._malloc(8);
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
  const rB = (a: number, n: number): number[] => { mod._uade_wasm_read_memory(a >>> 0, rd, n); const b: number[] = []; for (let i = 0; i < n; i++) b.push(mod.HEAPU8[rd + i]); return b; };
  const rW = (a: number): number => { const b = rB(a, 2); return (b[0] << 8) | b[1]; };
  const snapV = (vi: number): Snap => { const b = base0 + vi * STRIDE; return { period: rW(b + 0x20), acc: rW(b + 0x08), vol: rB(b + 0x0c, 1)[0], flags: rB(b + 0x14, 1)[0], tc: rB(b + 0x2c, 1)[0], rr: rB(b + 0x2d, 1)[0] } as Snap; };
  // capture the tick timeline at several sample-phase offsets; keep them all
  const capturePhase = (phase: number): Snap[][] => {
    mod._uade_wasm_stop(); load();
    if (phase > 0) mod._uade_wasm_render(L, R, phase);
    const out: Snap[][] = [];
    for (let t = 0; t < TICKS; t++) { mod._uade_wasm_render(L, R, TICK_SAMPLES); out.push([0, 1, 2, 3].map(snapV)); }
    return out;
  };
  const phases: number[] = []; for (let p = 0; p <= 1800; p += 63) phases.push(p);
  const golds = phases.map(capturePhase);
  // native reference
  const build = (warmup: number): SunTronicPlayer => {
    const score = parseSunTronicV13Score(data); const p = new SunTronicPlayer(score, { subsong: 0 });
    for (let w = 0; w < warmup; w++) p.tick(); return p;
  };
  let bestPh = 0, bestWarm = 0, bestMis = 1e9, bestFirst = '';
  for (let pi = 0; pi < phases.length; pi++) {
    for (const warmup of [0, 1, 2]) {
      const player = build(warmup); let mism = 0; let first = '';
      for (let i = 0; i < TICKS; i++) {
        const mv = player.tick().voices; const gv = golds[pi][i];
        for (let v = 0; v < 4; v++) {
          const g = gv[v], m = mv[v];
          if (g.period !== m.period || g.flags !== (m.flags & 0xff)) { mism++; if (!first) first = `t${i} v${v} G{p${g.period} f${g.flags.toString(16)}} N{p${m.period} f${(m.flags & 0xff).toString(16)}}`; }
        }
      }
      if (mism < bestMis) { bestMis = mism; bestPh = phases[pi]; bestWarm = warmup; bestFirst = first; }
    }
  }
  console.log(`\n${name} base0=${base0.toString(16)} FIXED-STEP: best phase=${bestPh} warmup=${bestWarm} → ${bestMis}/${TICKS * 4} mismatches`);
  console.log(`  first mismatch: ${bestFirst || '(none — byte-exact!)'}`);
  // detailed dump at the best phase/warmup
  const player = build(bestWarm); const gd = golds[phases.indexOf(bestPh)];
  for (let i = 0; i < Math.min(TICKS, 16); i++) {
    player.tick(); const gv = gd[i];
    // per-voice UADE $2c/$2d vs native tempoTick/tempoNote
    console.log(`  t${String(i).padStart(2)} ` + [0, 1, 2, 3].map(v => {
      const d = player.debugVoice(v);
      const mark = (gv[v].tc !== d.tempoTick || gv[v].rr !== d.tempoNote) ? '!' : ' ';
      return `v${v}${mark}$2c ${gv[v].tc}/${d.tempoTick} $2d ${gv[v].rr}/${d.tempoNote}`;
    }).join('  '));
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
