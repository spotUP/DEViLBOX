/** probe-eclock-sweep.ts — INTEGER E-clock accumulator sweep (principled, no float
 * drift). Per uniform fire UAE advances the CIA counter by EPB = round(1024*ECLOCK/SR)
 * eclocks and underflows every P eclocks (the integer CIA reload). Sub-ticks/fire =
 * floor accumulation → exact 1-or-2 with exact phase. The existing tick() accumulator
 * (acc += audioTick; while acc>=ciaTick) IS this integer accumulator when fed integer
 * (EPB, P, phaseEclocks). Sweep P × phase for 0 golden mismatches. NOT committed. */
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
interface Golden { modules: Record<string, { tick: number; voices: Row[] }[]> }
const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));

const ECLOCK = 709379, SR = 44100;
const EPB = Math.round(1024 * ECLOCK / SR); // 16474
const offset = -1;
const names = Object.keys(golden.modules);
const scores = new Map(names.map((n) => [n, parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, n))))]));

function countMismatch(name: string, P: number, phase: number): number {
  const player = new SunTronicPlayer(scores.get(name)!, { subsong: 0, audioTickSamples: EPB, ciaTickSamples: P, rowPhaseSamples: phase });
  const samples = golden.modules[name];
  let bad = 0;
  for (let i = 0; i + offset < samples.length; i++) {
    const nv = player.tick().voices;
    if (i + offset < 0) continue;
    const g = samples[i + offset].voices;
    for (let v = 0; v < 4; v++) if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) bad++;
  }
  return bad;
}

// coarse P range: 50Hz reload ≈ 14188; float-best 881.5 ↔ P≈14180. Sweep ±.
const PLO = Number(process.argv[2] ?? 14176), PHI = Number(process.argv[3] ?? 14196), PSTEP = 1;
const PHSTEP = Number(process.argv[4] ?? 64); // phase step in eclocks
let bestGlobal = { total: Infinity, P: 0, phase: 0, per: [] as number[] };
for (let P = PLO; P <= PHI; P += PSTEP) {
  let bestP = { total: Infinity, phase: 0, per: [] as number[] };
  for (let phase = 0; phase < P; phase += PHSTEP) {
    const per = names.map((n) => countMismatch(n, P, phase));
    const total = per.reduce((a, b) => a + b, 0);
    if (total < bestP.total) bestP = { total, phase, per };
  }
  console.log(`P=${P} (cia≈${(P * 1024 / EPB).toFixed(3)}samp) best phase=${bestP.phase} total=${bestP.total} [${bestP.per.join(',')}]`);
  if (bestP.total < bestGlobal.total) bestGlobal = { total: bestP.total, P, phase: bestP.phase, per: bestP.per };
}
console.log(`\nEPB=${EPB} BEST: P=${bestGlobal.P} phase=${bestGlobal.phase} total=${bestGlobal.total} [${bestGlobal.per.join(',')}]`);
