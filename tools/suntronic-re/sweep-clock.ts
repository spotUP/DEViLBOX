/**
 * sweep-clock.ts — Phase B: find a closed-form two-clock schedule that makes BOTH
 * songs 0/316. Model: note clock period T_a, EFFECTS clock period P_v; per note row i
 * the base is 1 EFFECTS step + 1 extra whenever the fractional accumulator
 * frac(s + i*(T_a/P_v - 1)) wraps. Sweeps the per-song start phase s (and optionally
 * P_v) and reports, for each song, the phase(s) giving 0 mismatches — then whether a
 * single phase rule fits both. TEMPORARY.
 */
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const REPO = process.cwd();
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { modules: Record<string, { tick: number; voices: Row[] }[]> };
const MODULES = ['gliders.src', 'ballblaser.src'];

/** Build a per-row EFFECTS-step schedule from a float accumulator. */
function schedule(n: number, R: number, s: number): number[] {
  const out: number[] = [];
  let acc = s;
  for (let i = 0; i < n; i++) {
    const before = Math.floor(acc);
    acc += R;
    const after = Math.floor(acc);
    out.push(1 + (after - before)); // base 1 + number of integer crossings
  }
  return out;
}

function mismatches(name: string, sched: number[]): number {
  const samples = golden.modules[name];
  const data = new Uint8Array(readFileSync(join(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: sched } as any);
  const timeline = player.renderTimeline(samples.length);
  let m = 0;
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i - 1].voices, mv = timeline[i].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== mv[v].period || g[v].acc !== (mv[v].acc & 0xffff) || g[v].flags !== (mv[v].flags & 0xff)) m++;
    }
  }
  return m;
}

const T_a = 1024;
// Sweep P_v around the measured 880.57 and phase s in [0,1).
const best: Record<string, { s: number; pv: number; m: number }[]> = {};
for (const name of MODULES) {
  const n = golden.modules[name].length;
  const zeros: { s: number; pv: number; m: number }[] = [];
  let globalBest = { s: 0, pv: 0, m: 9999 };
  for (let pv = 878; pv <= 883; pv += 0.05) {
    const R = T_a / pv - 1;
    for (let s = 0; s < 1; s += 0.01) {
      const m = mismatches(name, schedule(n, R, s));
      if (m < globalBest.m) globalBest = { s: +s.toFixed(3), pv: +pv.toFixed(3), m };
      if (m === 0) zeros.push({ s: +s.toFixed(3), pv: +pv.toFixed(3), m });
    }
  }
  best[name] = zeros.length ? zeros : [globalBest];
  // eslint-disable-next-line no-console
  console.log(`${name}: ${zeros.length ? `${zeros.length} zero-configs, e.g. ${JSON.stringify(zeros.slice(0, 3))}` : `NO zero; best=${JSON.stringify(globalBest)}`}`);
}

// Overlap: is there a single (pv,s) that zeros BOTH?
if (best[MODULES[0]][0].m === 0 && best[MODULES[1]][0].m === 0) {
  const a = new Set(best[MODULES[0]].map((z) => `${z.pv}|${z.s}`));
  const shared = best[MODULES[1]].filter((z) => a.has(`${z.pv}|${z.s}`));
  // eslint-disable-next-line no-console
  console.log(`\nshared (pv,s) zeroing BOTH: ${shared.length ? JSON.stringify(shared.slice(0, 5)) : 'NONE — phase is per-song'}`);
}
