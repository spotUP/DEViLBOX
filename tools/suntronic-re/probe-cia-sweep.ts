/** probe-cia-sweep.ts — 2D sweep of the CIA-clock model (ciaTick × rowPhase) against
 * the committed UADE golden. Under the new model vibrato steps once per CIA tick
 * (floor((phase+audioTick)/ciaTick) = 1-2 per audio buffer) and GNN fires on the $2c
 * wrap. Find (ciaTick,rowPhase) giving 0 per-tick $20/$08/$14 mismatches for BOTH
 * songs = byte-exact by construction. NOT committed. */
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

const AUDIO = 1024;
const offset = Number(process.argv[2] ?? -1);

function countMismatch(name: string, samples: { voices: Row[] }[], cia: number, phase: number): number {
  const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: cia, audioTickSamples: AUDIO, rowPhaseSamples: phase });
  let bad = 0;
  for (let i = 0; i + offset < samples.length; i++) {
    const nv = player.tick().voices;
    if (i + offset < 0) continue;
    const g = samples[i + offset].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) bad++;
    }
  }
  return bad;
}

const names = Object.keys(golden.modules);
const CLO = Number(process.argv[3] ?? 878), CHI = Number(process.argv[4] ?? 887), CSTEP = Number(process.argv[5] ?? 0.25);
let best = { total: Infinity, cia: 0, phase: 0, per: [] as number[] };
for (let cia = CLO; cia <= CHI; cia += CSTEP) {
  for (let phase = 0; phase < cia; phase += 1) {
    const per = names.map((n) => countMismatch(n, golden.modules[n], cia, phase));
    const total = per.reduce((a, b) => a + b, 0);
    if (total < best.total) best = { total, cia, phase, per };
  }
}
console.log(`offset=${offset} best ciaTick=${best.cia} rowPhase=${best.phase} total=${best.total}`);
names.forEach((n, i) => console.log(`  ${n}: ${best.per[i]}`));
