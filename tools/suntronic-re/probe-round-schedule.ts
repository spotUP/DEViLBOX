/** probe-round-schedule.ts — test the ROUND step schedule S(b)=round(b*1024/P)
 * against the committed golden, independent of the player's accumulator. Measured
 * (probe-step-gaps) gliders schedule: base 1024/step + extra steps at buckets
 * round(k*6.25), i.e. total steps by bucket b = round(b*29/25) = round(b*1024/882.76).
 * This drives SunTronicPlayer.stepAll() exactly S(b)-S(b-1) times per bucket and
 * counts golden mismatches, sweeping P to find the true per-song vblank period. */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stepAllOnce(pl: any): void { pl.stepAll(); }

function mismatchForP(name: string, samples: { voices: Row[] }[], P: number, roundMode: boolean): number {
  const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  // drive stepAll() by the explicit schedule S(b)=round or floor (b*1024/P)
  const raw: Row[][] = [];
  const AUDIO = 1024;
  let prevS = 0;
  for (let b = 1; b <= samples.length; b++) {
    const x = (b * AUDIO) / P;
    const S = roundMode ? Math.round(x) : Math.floor(x);
    const n = S - prevS; prevS = S;
    for (let i = 0; i < n; i++) stepAllOnce(pl);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = (pl as any).voices.map((v: any) => ({ period: v.period, acc: v.pitch & 0xffff, vol: v.volume & 0xff, flags: v.flags & 0xff }));
    raw.push(vs);
  }
  let mm = 0;
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i - 1].voices, mv = raw[i];
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== mv[v].period || g[v].acc !== mv[v].acc || g[v].flags !== mv[v].flags) mm++;
    }
  }
  return mm;
}

for (const [name, samples] of Object.entries(golden.modules)) {
  let best = 1e9, bestP = 0, bestMode = false;
  for (const mode of [true, false]) {
    for (let P = 878; P <= 888; P += 0.01) {
      const mm = mismatchForP(name, samples, P, mode);
      if (mm < best) { best = mm; bestP = P; bestMode = mode; }
    }
  }
  console.log(`${name}: best=${best} at P=${bestP.toFixed(2)} mode=${bestMode ? 'round' : 'floor'}`);
}
