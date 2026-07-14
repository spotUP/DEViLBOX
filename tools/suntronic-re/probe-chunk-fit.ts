/** probe-chunk-fit.ts — DECISIVE Path-A test. Generate a per-fire CIA sub-tick schedule
 * from a 128-CHUNK eclock accumulator (UADE processes CIA interrupts at 128-sample chunk
 * boundaries, which can push an interrupt across a 1024-fire boundary vs a continuous
 * per-1024 accumulator — the sub-fire phase offset), inject via subtickSchedule, and count
 * golden mismatches on BOTH songs. Sweep (P eclocks, phase). If min→0 for a single (P,phase),
 * Path A (replace the per-fire float accumulator with a 128-chunk eclock accumulator inside
 * tick()) reaches byte-exact against the COMMITTED golden — no oracle change. NOT committed. */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
const ECLOCK = 709379, SR = 44100, CH = 128;
const dE = CH * ECLOCK / SR; // eclocks per 128-chunk (~2058.97)

interface Row { period: number; acc: number; vol: number; flags: number }
interface Golden { modules: Record<string, { tick: number; voices: Row[] }[]> }
const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const NAMES = ['gliders.src', 'ballblaser.src'];
const scores = new Map(NAMES.map((n) => [n, parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, n))))]));

/** 128-chunk accumulator → per-fire CIA sub-tick counts for `fires` fires.
 *  acc advances dE per chunk; each chunk emits floor-steps of P; counted into the
 *  1024-fire the chunk belongs to. This is what UADE's chunked interrupt processing does. */
function chunkSchedule(P: number, phase: number, fires: number): number[] {
  const perFire = new Array(fires).fill(0);
  let acc = phase;
  const chunks = fires * (1024 / CH);
  for (let c = 0; c < chunks; c++) {
    acc += dE;
    while (acc >= P) { acc -= P; const f = Math.floor((c * CH) / 1024); if (f < fires) perFire[f]++; }
  }
  return perFire;
}

function mismatches(name: string, sched: number[], off: number): number {
  const samples = golden.modules[name];
  const player = new SunTronicPlayer(scores.get(name)!, { subsong: 0, subtickSchedule: off >= 0 ? sched.slice(off) : [...Array(-off).fill(1), ...sched] });
  let bad = 0;
  for (let i = 0; i - 1 < samples.length; i++) {
    const nv = player.tick().voices;
    if (i - 1 < 0) continue;
    const g = samples[i - 1].voices;
    for (let v = 0; v < 4; v++) if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) bad++;
  }
  return bad;
}

const P0 = 881.5 * ECLOCK / SR;
console.log(`dE=${dE.toFixed(3)}  P(881.5)=${P0.toFixed(1)}  sweeping P∈[${(P0 - 500).toFixed(0)},${(P0 + 500).toFixed(0)}]`);
const fires = Math.max(...NAMES.map((n) => golden.modules[n].length)) + 6;

let best = { tot: Infinity, P: 0, phase: 0, off: 0, g: 0, b: 0 };
for (let P = Math.round(P0 - 500); P <= Math.round(P0 + 500); P += 1) {
  for (let ph = 0; ph < P; ph += 16) {
    const sched = chunkSchedule(P, ph, fires);
    for (const off of [-1, 0, 1]) {
      const g = mismatches('gliders.src', sched, off);
      if (g > best.tot) continue; // early skip: gliders alone already worse than best total
      const b = mismatches('ballblaser.src', sched, off);
      if (g + b < best.tot) best = { tot: g + b, P, phase: ph, off, g, b };
    }
  }
}
console.log(`\nBEST total=${best.tot} (gliders ${best.g}, ballblaser ${best.b})  P=${best.P} phase=${best.phase} off=${best.off} ciaTick=${(best.P * SR / ECLOCK).toFixed(4)}`);
console.log(`  schedule doubles = [${chunkSchedule(best.P, best.phase, fires).map((v, i) => (v >= 2 ? i : -1)).filter((i) => i >= 0).join(',')}]`);
