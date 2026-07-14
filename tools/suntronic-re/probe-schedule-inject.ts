/** probe-schedule-inject.ts — DECISIVE diagnostic. Extract UADE's exact per-fire CIA
 * sub-tick count (from voice0 $24 phase deltas / freqEnvSpeed, measured on the SAME
 * note-handler-FIRE clock the golden uses), then inject that schedule into
 * SunTronicPlayer (subtickSchedule option) and diff vs golden. Separates two questions:
 *   (a) is the player's note/vib/period LOGIC correct given the exact schedule? and
 *   (b) can a constant clock GENERATE the schedule?
 * If injected → 0 golden mismatches, the port target is just schedule generation.
 * NOT committed. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, '../..', 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
const golden: { modules: Record<string, { tick: number; voices: Row[] }[]> } = JSON.parse(readFileSync(GOLDEN, 'utf8'));

/** Replicate emit-note-timeline-golden's fire detection: render CH=128 chunks, read
 *  voice0 $24 after each; a "fire" is a chunk in which $24 changed. Count vibrato
 *  sub-ticks in that fire = round(|Δphase|/freqEnvSpeed). Returns subticks-per-fire. */
async function extractSchedule(name: string, nFires: number, freqEnvSpeed: number): Promise<number[]> {
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
  const CH = 128;
  const Lb = mod._malloc(1024 * 4), Rb = mod._malloc(1024 * 4), L = mod._malloc(CH * 4), R = mod._malloc(CH * 4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
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
  // fire detection identical to golden emitter: subticks per detected fire
  const sched: number[] = []; let prev = rW(base0 + 0x24); let pending = 0;
  const chunksNeeded = nFires * 12; // generous; detect nFires fires
  for (let c = 0; c < chunksNeeded && sched.length < nFires; c++) {
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    const ph = rW(base0 + 0x24);
    if (ph !== prev) {
      let d = (ph - prev) & 0xffff; if (d > 0x8000) d -= 0x10000;
      pending += Math.max(1, Math.round(Math.abs(d) / freqEnvSpeed));
      prev = ph;
    }
    // a fire = a 1024-window boundary (8 chunks); flush pending as that fire's count
    if ((c + 1) % 8 === 0) { sched.push(pending); pending = 0; }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return sched;
}

function countMismatch(name: string, score: ReturnType<typeof parseSunTronicV13Score>, sched: number[]): { total: number; first: number } {
  const player = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: sched });
  const samples = golden.modules[name]; let bad = 0, first = -1;
  for (let i = 0; i + -1 < samples.length; i++) {
    const nv = player.tick().voices;
    if (i - 1 < 0) continue;
    const g = samples[i - 1].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) {
        bad++; if (first < 0) first = i;
      }
    }
  }
  return { total: bad, first };
}

function detail(name: string, score: ReturnType<typeof parseSunTronicV13Score>, sched: number[]): void {
  const player = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: sched });
  const samples = golden.modules[name];
  for (let i = 0; i - 1 < samples.length; i++) {
    const nv = player.tick().voices;
    if (i - 1 < 0) continue;
    const g = samples[i - 1].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) {
        console.log(`    t${i} v${v}: g{p${g[v].period} a${g[v].acc}} n{p${nv[v].period} a${nv[v].acc & 0xffff}}`);
      }
    }
  }
}

/** the accumulator's OWN per-tick subtick counts at ciaTick=881.5 — harness sanity check */
function accumulatorSchedule(n: number, ciaTick = 881.5): number[] {
  const out: number[] = []; let acc = 0;
  for (let f = 0; f < n; f++) { acc += 1024; let c = 0; while (acc >= ciaTick) { acc -= ciaTick; c++; } out.push(c); }
  return out;
}

(async () => {
  const name = 'gliders.src'; // freqEnvSpeed=8000 known-good; ballblaser needs real fes first
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const nFires = golden.modules[name].length + 4;

  // 1) SANITY: inject the accumulator's own schedule → must reproduce the committed 3.
  const accSched = accumulatorSchedule(nFires);
  const sane = countMismatch(name, score, accSched);
  console.log(`SANITY accumulator-self-schedule: mismatches=${sane.total} first=t${sane.first} (expect 3/t6)`);
  console.log(`  acc doubles = [${accSched.map((v, i) => (v >= 2 ? i : -1)).filter((i) => i >= 0).slice(0, 10).join(',')}]`);

  // 2) UADE schedule, swept over a small index offset (priming alignment).
  const sched = await extractSchedule(name, nFires + 4, 8000);
  console.log(`  uade doubles = [${sched.map((v, i) => (v >= 2 ? i : -1)).filter((i) => i >= 0).slice(0, 10).join(',')}] sum=${sched.reduce((a, b) => a + b, 0)}`);
  for (let off = -2; off <= 2; off++) {
    const shifted = off >= 0 ? sched.slice(off) : [...Array(-off).fill(1), ...sched];
    const r = countMismatch(name, score, shifted);
    console.log(`  UADE sched offset ${off >= 0 ? '+' : ''}${off}: mismatches=${r.total} first=t${r.first}`);
  }
  console.log(`  DETAIL (UADE sched offset +1):`);
  detail(name, score, sched.slice(1));
})().catch((e) => { console.error(e); process.exit(1); });
