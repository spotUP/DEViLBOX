/** probe-joint-greedy.ts — DECISIVE model test. Every constant-rate accumulator (float, 128-chunk,
 * E-clock) floors at 14 golden mismatches. The v0-only greedy zeroes v0 but worsens v1-v3. Question:
 * can ANY per-fire integer vib-advance schedule (0/1/2/3 advances at each fire, one global count per
 * fire shared by all voices — the physical CIA model) zero ALL 4 voices at once? Greedily pick each
 * fire's count to minimise the 4-voice mismatch AT THAT FIRE, then report the floor. If floor==0 the
 * integer-count model is correct and only the schedule GENERATOR (C-level CIA emulation) is missing;
 * if floor>0 the per-fire-integer model itself cannot express the golden and vibrato is sub-fire
 * continuous. NOT committed. */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
const golden: { modules: Record<string, { tick: number; voices: Row[] }[]> } = JSON.parse(readFileSync(GOLDEN, 'utf8'));

// mismatch of a single fire index f (native fire f == golden[f-1]) under a given global schedule prefix
function fireMism(score: ReturnType<typeof parseSunTronicV13Score>, g: { voices: Row[] }[], sched: number[], f: number): number {
  const p = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: [...sched, ...Array(4).fill(1)] });
  let nv: Row[] = [];
  for (let t = 0; t <= f; t++) nv = p.tick().voices as unknown as Row[];
  if (f - 1 < 0) return 0;
  const gg = g[f - 1].voices;
  let bad = 0;
  for (let v = 0; v < 4; v++) if (gg[v].period !== nv[v].period || gg[v].acc !== (nv[v].acc & 0xffff) || gg[v].flags !== nv[v].flags) bad++;
  return bad;
}

for (const name of ['gliders.src', 'ballblaser.src']) {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, name))));
  const g = golden.modules[name];
  const N = g.length;
  const sched: number[] = [];
  let floor = 0;
  const doubles: string[] = [];
  // sched[j] is the lever for fire j+1 (compute-then-advance). Greedily choose sched[j] to minimise
  // the 4-voice mismatch at fire j+1.
  for (let j = 0; j < N; j++) {
    let bestC = 1, bestBad = Infinity;
    for (const c of [1, 2, 0, 3]) {
      const bad = fireMism(score, g, [...sched, c], j + 1);
      if (bad < bestBad) { bestBad = bad; bestC = c; if (bad === 0) break; }
    }
    sched.push(bestC);
    floor += bestBad;
    if (bestC !== 1) doubles.push(`${j}:${bestC}`);
  }
  console.log(`${name}: joint-greedy 4-voice FLOOR=${floor}  doubles=[${doubles.join(' ')}]`);
}
