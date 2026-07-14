/** probe-native-vs-golden.ts — run SunTronicPlayer.tick() against the committed
 * golden (same comparison as sunTronicNoteTimeline.golden.test.ts) and print the
 * exact per-tick mismatches. Phase A confirmation: with the clock proven a constant
 * 1024 samples/tick (probe-fullsong-fires), any residual is per-tick ARITHMETIC,
 * not timing — this locates the 14 off-by-one ticks and their deltas. LOCAL. */
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

for (const [name, samples] of Object.entries(golden.modules)) {
  const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });
  const mismatches: string[] = [];
  let total = 0;
  for (let i = 0; i + 1 < samples.length; i++) {
    const voices = player.tick().voices;
    const g = samples[i + 1].voices;
    for (let v = 0; v < 4; v++) {
      const gv = g[v], mv = voices[v];
      total++;
      if (gv.period !== mv.period || gv.acc !== (mv.acc & 0xffff) || gv.flags !== mv.flags) {
        const dP = mv.period - gv.period;
        mismatches.push(
          `t${i} v${v}: dPeriod=${dP >= 0 ? '+' : ''}${dP} ` +
          `golden{p${gv.period} a${gv.acc.toString(16)} f${gv.flags.toString(16)}} ` +
          `native{p${mv.period} a${(mv.acc & 0xffff).toString(16)} f${mv.flags.toString(16)}}`,
        );
      }
    }
  }
  console.log(`\n=== ${name}: ${mismatches.length}/${total} mismatches (${samples.length} ticks) ===`);
  for (const m of mismatches) console.log('  ' + m);
}
