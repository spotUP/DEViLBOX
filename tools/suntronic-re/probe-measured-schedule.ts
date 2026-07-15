/** probe-measured-schedule.ts — measure UADE's EXACT per-1024-bucket player-step
 * count (Δ$24/0x1f40 across each 1024-sample render), then drive SunTronicPlayer
 * .stepAll() by that measured schedule and count golden mismatches. DECISIVE:
 *  - 0 mismatches => the residual is ENTIRELY the per-bucket step schedule (a pure
 *    timing/beat effect); the fix is to port UADE's sample/vsync accumulators to TS.
 *  - >0 => a period-arithmetic bug remains independent of timing.
 * The measured schedule is used ONLY as a discriminator here (a probe), never shipped. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
interface Golden { modules: Record<string, { tick: number; voices: Row[] }[]> }

async function measureSchedule(name: string, nBuckets: number): Promise<number[]> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
  const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_stop(); mod._uade_wasm_load(p, data.byteLength, h); mod._free(p); mod._free(h);
  const base0 = name === 'gliders.src' ? 0x26f8a : 0x25f6a;
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4), rd = mod._malloc(8);
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const s16 = (x: number): number => (x & 0x8000) ? x - 0x10000 : x;
  const sched: number[] = [];
  let prev = s16(rW(base0 + 0x24));
  for (let b = 0; b < nBuckets; b++) {
    if (mod._uade_wasm_render(L, R, 1024) <= 0) { sched.push(1); continue; }
    const c = s16(rW(base0 + 0x24));
    let d = c - prev; while (d < -4000) d += 65536; while (d > 60000) d -= 65536;
    let n = Math.round(d / 8000);
    if (n < 1 || n > 3) n = 1;   // retrigger clr.w $24 contamination → assume single
    sched.push(n); prev = c;
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return sched;
}

(async () => {
  const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const useGliders = process.argv.includes('--cross');
  const formulaArg = process.argv.find((a) => a.startsWith('--formula='));
  const formulaP = formulaArg ? parseFloat(formulaArg.split('=')[1]) : 0;
  const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
  const phase0 = phaseArg ? parseFloat(phaseArg.split('=')[1]) : 0;
  // formula schedule: extra "double" player-steps land at bucket = round(k*di + phase),
  // di = P/(1024-P) = the beat period of the 1024-sample golden bucket against the
  // ~883-sample PAL player-fire period. n(bucket)=2 there, else 1. This reproduces the
  // measured doubles 6,13,19,25,31,38,44,50 (round(k*6.25)) exactly. NO hardcoded array.
  const formulaSched = (len: number): number[] => {
    const di = formulaP / (1024 - formulaP);
    const dbl = new Set<number>();
    for (let k = 1; Math.round(k * di + phase0) <= len; k++) dbl.add(Math.round(k * di + phase0));
    const s: number[] = [];
    for (let b = 0; b < len; b++) s.push(dbl.has(b) ? 2 : 1);
    return s;
  };
  // measure the (song-independent) timing schedule once from gliders (clean, no retrigger clr)
  const glidersSched = useGliders ? await measureSchedule('gliders.src', 400) : null;
  for (const [name, samples] of Object.entries(golden.modules)) {
    const sched = formulaP ? formulaSched(samples.length + 2) : (glidersSched ?? await measureSchedule(name, samples.length + 2));
    const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
    const score = parseSunTronicV13Score(data);
    const pl = new SunTronicPlayer(score, { subsong: 0 });
    const raw: Row[][] = [];
    for (let b = 0; b < samples.length; b++) {
      const n = sched[b] ?? 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (let i = 0; i < n; i++) (pl as any).stepAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw.push((pl as any).voices.map((v: any) => ({ period: v.period, acc: v.pitch & 0xffff, vol: v.volume & 0xff, flags: v.flags & 0xff })));
    }
    let mm = 0; const detail: string[] = [];
    for (let i = 1; i < samples.length; i++) {
      const g = samples[i - 1].voices, mv = raw[i];
      for (let v = 0; v < 4; v++) {
        if (g[v].period !== mv[v].period || g[v].acc !== mv[v].acc || g[v].flags !== mv[v].flags) {
          mm++; if (detail.length < 12) detail.push(`t${i} v${v}: dP=${mv[v].period - g[v].period} g${g[v].period} n${mv[v].period}`);
        }
      }
    }
    console.log(`\n=== ${name}: ${mm}/316 with MEASURED schedule ===`);
    console.log('sched[0..40]:', sched.slice(0, 40).join(''));
    for (const d of detail) console.log('  ' + d);
  }
})();
