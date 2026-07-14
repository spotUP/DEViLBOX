/** probe-greedy-schedule.ts — pure-JS (no WASM). The golden $20 stream is proven cycle-true
 * (emit-ch1-diag: render-independent). Greedily pick each fire's vibrato-advance count to make
 * native voice0 period match golden, then evaluate whether that SAME global schedule also makes
 * voices 1-3 (never fitted) match. One CIA clock drives all voices, so if the v0-fitted schedule
 * zeroes all voices, the residual is purely a global vib-advance schedule (find the CIA constant);
 * if v0 zeroes but others don't, it is a deeper per-voice desync. NOT committed. */
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

function build(name: string): { sched: number[]; v0fail: number } {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, name))));
  const g = golden.modules[name];
  const N = g.length;
  const sched: number[] = [];
  let v0fail = 0;
  // fire t period = P(sum sched[0..t-1]); sched[j] is the lever for fire j+1 vs golden[j].
  for (let j = 0; j < N; j++) {
    let bestC = 1, bestOk = false, bestDelta = Infinity;
    for (const c of [1, 2, 0, 3]) {
      const trial = [...sched, c];
      const p = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: [...trial, ...Array(N + 2).fill(1)] });
      let per = 0; for (let t = 0; t <= j + 1; t++) per = p.tick().voices[0].period; // read fire j+1
      const want = g[j].voices[0].period;
      const d = Math.abs(per - want);
      if (per === want) { bestC = c; bestOk = true; break; }
      if (d < bestDelta) { bestDelta = d; bestC = c; }
    }
    sched.push(bestC);
    if (!bestOk) v0fail++;
  }
  return { sched, v0fail };
}

function evalAll(name: string, sched: number[]): { total: number; byVoice: number[]; first: number } {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, name))));
  const g = golden.modules[name];
  const p = new SunTronicPlayer(score, { subsong: 0, subtickSchedule: [...sched, ...Array(8).fill(1)] });
  let total = 0, first = -1; const byVoice = [0, 0, 0, 0];
  for (let i = 0; i - 1 < g.length; i++) {
    const nv = p.tick().voices; if (i - 1 < 0) continue; const gg = g[i - 1].voices;
    for (let v = 0; v < 4; v++) if (gg[v].period !== nv[v].period || gg[v].acc !== (nv[v].acc & 0xffff) || gg[v].flags !== nv[v].flags) { total++; byVoice[v]++; if (first < 0) first = i; }
  }
  return { total, byVoice, first };
}

for (const name of ['gliders.src', 'ballblaser.src']) {
  const { sched, v0fail } = build(name);
  const doubles = sched.map((v, i) => (v !== 1 ? `${i}:${v}` : '')).filter(Boolean);
  const r = evalAll(name, sched);
  console.log(`\n${name}: v0-greedy schedule non-1 fires = [${doubles.join(' ')}]`);
  console.log(`  v0 unmatchable fires=${v0fail}`);
  console.log(`  ALL-VOICE eval with v0 schedule: total=${r.total} byVoice=${r.byVoice.join('/')} first=t${r.first}`);
}
