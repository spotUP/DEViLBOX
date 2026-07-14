/** probe-golden-diag.ts — per-tick diff of native vs golden for a chosen ciaTick, to
 * locate the FIRST divergence and read the cadence. ciaTick=1024 reproduces the old
 * flat-6 model (rowLen=6×1024, GNN every 6 audio ticks) that was byte-exact t0-t10.
 * NOT committed. */
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

const name = process.argv[2] ?? 'gliders.src';
const ciaTick = Number(process.argv[3] ?? 1024);
const audioTick = Number(process.argv[4] ?? 1024);
const offset = Number(process.argv[5] ?? 1); // golden[i+offset] vs native[i]
const rowPhase = Number(process.argv[6] ?? 16);

const samples = golden.modules[name];
const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
const score = parseSunTronicV13Score(data);
const player = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: ciaTick, audioTickSamples: audioTick, rowPhaseSamples: rowPhase });

console.log(`${name} ciaTick=${ciaTick} audioTick=${audioTick} offset=${offset}`);
let bad = 0, firstBad = -1;
for (let i = 0; i + offset < samples.length; i++) {
  const nv = player.tick().voices;      // always advance native (stateful)
  if (i + offset < 0) continue;         // golden index not yet valid
  const g = samples[i + offset].voices;
  const diffs: string[] = [];
  for (let v = 0; v < 4; v++) {
    if (g[v].period !== nv[v].period || g[v].acc !== (nv[v].acc & 0xffff) || g[v].flags !== nv[v].flags) {
      bad++;
      diffs.push(`v${v} g{p${g[v].period} a${g[v].acc.toString(16)} f${g[v].flags.toString(16)}} n{p${nv[v].period} a${(nv[v].acc & 0xffff).toString(16)} f${nv[v].flags.toString(16)}}`);
    }
  }
  if (diffs.length && i < 80) console.log(`  t${i}: ${diffs.join(' | ')}`);
  if (diffs.length && firstBad < 0) firstBad = i;
}
console.log(`total mismatches=${bad}  firstBad=t${firstBad}`);
