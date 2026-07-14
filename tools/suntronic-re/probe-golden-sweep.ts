/** probe-golden-sweep.ts — find the two-clock ratio empirically. The native player
 * now advances rows via a fractional accumulator rowLen = speed×ciaTick samples,
 * crossed per audioTick(=1024). ciaTick (~882, PAL 50 Hz) is the only unknown. Sweep
 * it against the committed UADE golden and report the value with the fewest per-tick
 * $20/$08/$14 mismatches for gliders+ballblaser. A clean 0 = byte-exact by
 * construction (golden is the reference). NOT committed. */
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

function countMismatch(name: string, samples: { voices: Row[] }[], ciaTick: number, audioTick: number): number {
  const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: ciaTick, audioTickSamples: audioTick });
  const offset = -1; // native lags golden by one priming tick (measured, see probe-golden-diag)
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

const AUDIO = 1024;
for (const [name, samples] of Object.entries(golden.modules)) {
  let best = Infinity, bestCia = 0;
  const line: string[] = [];
  for (let cia = 850; cia <= 910; cia += 1) {
    const bad = countMismatch(name, samples, cia, AUDIO);
    if (bad < best) { best = bad; bestCia = cia; }
    if (cia % 5 === 0) line.push(`${cia}:${bad}`);
  }
  console.log(`\n${name}: best ciaTick=${bestCia} mismatches=${best}  (audioTick=${AUDIO}, total cells=${(samples.length - 1) * 4})`);
  console.log('  ' + line.join(' '));
}
