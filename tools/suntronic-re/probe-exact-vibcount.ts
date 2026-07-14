/** probe-exact-vibcount.ts — measure UADE's EXACT per-note-fire vibrato-advance count, cycle-true.
 * Render 1 sample at a time; read voice0 $24 each sample and count changes (each change = one
 * advanceVib, since only ~7 CPU cycles run per 1-sample render). Arm PC capture on the note
 * handler; each fire flushes the accumulated change count = that fire's exact vibAdvance count.
 * Then inject via subtickSchedule and count golden mismatches. If → 0, native LOGIC is correct
 * and the only remaining work is generating/embedding the exact schedule. If not, the period math
 * is wrong. Also prints the exact double-schedule for both songs. NOT committed. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, NFIRE = 84;
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, '../..', 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
const golden: { modules: Record<string, { tick: number; voices: Row[] }[]> } = JSON.parse(readFileSync(GOLDEN, 'utf8'));

async function exactSchedule(name: string): Promise<number[]> {
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
  const Lb = mod._malloc(SPT * 4), Rb = mod._malloc(SPT * 4), L1 = mod._malloc(4), R1 = mod._malloc(4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(Lb, Rb, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pc = 0, best = -1; for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < NFIRE; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(Lb, Rb, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const r24 = (): number => { mod._uade_wasm_read_memory((base0 + 0x24) >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  // single 1-sample pass: count $24 changes, flush per note-fire
  mod._uade_wasm_stop(); load();
  const sched: number[] = []; let prev = r24(); let pending = 0;
  for (let s = 0; s < NFIRE * 1400 && sched.length < NFIRE; s++) {
    mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L1, R1, 1) <= 0) break;
    const now = r24(); if (now !== prev) { pending++; prev = now; }
    if (mod._uade_wasm_get_capture(cap) && capU32(17)) { sched.push(pending); pending = 0; }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return sched;
}

function countMismatch(name: string, sched: number[], off: number): { total: number; first: number } {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR, name))));
  const s = off >= 0 ? sched.slice(off) : [...Array(-off).fill(1), ...sched];
  const player = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: s });
  const samples = golden.modules[name]; let bad = 0, first = -1;
  for (let i = 0; i - 1 < samples.length; i++) {
    const nv = player.tick().voices; if (i - 1 < 0) continue; const g = samples[i - 1].voices;
    for (let v = 0; v < 4; v++) if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) { bad++; if (first < 0) first = i; }
  }
  return { total: bad, first };
}

(async () => {
  for (const name of ['gliders.src', 'ballblaser.src']) {
    const sched = await exactSchedule(name);
    const doubles = sched.map((v, i) => (v >= 2 ? i : -1)).filter((i) => i >= 0);
    console.log(`\n${name}: exact per-fire vibAdvance = [${sched.slice(0, 20).join(',')}...] sum=${sched.reduce((a, b) => a + b, 0)}`);
    console.log(`  exact doubles at fires [${doubles.join(',')}]`);
    for (const off of [-1, 0, 1]) {
      const r = countMismatch(name, sched, off);
      console.log(`  inject exact schedule offset ${off >= 0 ? '+' : ''}${off}: mismatches=${r.total} first=t${r.first}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
