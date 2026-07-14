/** probe-align-sweep.ts — find the constant tick offset between native tick stream
 * and the golden. For each offset d, compare native[i] to golden[i+d] over all 4
 * voices (period+acc+flags) and report the mismatch count. A sharp minimum at some
 * d≠1 means the restored single-clock player is byte-exact but phase-shifted by a
 * constant startup lag (a note-on/vibrato seeding offset), NOT a waveform-shape bug. */
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
  // pre-run native ticks into an array
  const player = new SunTronicPlayer(score, { subsong: 0 });
  const native: Row[][] = [];
  for (let i = 0; i < samples.length; i++) {
    const vs = player.tick().voices;
    native.push(vs.map((v) => ({ period: v.period, acc: v.acc & 0xffff, vol: v.volume & 0xff, flags: v.flags & 0xff })));
  }
  console.log(`\n=== ${name} ===`);
  for (let d = -4; d <= 4; d++) {
    let accMM = 0, perMM = 0, flMM = 0, tot = 0;
    for (let i = 0; i < native.length; i++) {
      const gi = i + d;
      if (gi < 0 || gi >= samples.length) continue;
      const g = samples[gi].voices;
      for (let v = 0; v < 4; v++) {
        tot++;
        const gv = g[v], mv = native[i][v];
        if (gv.acc !== mv.acc) accMM++;
        if (gv.period !== mv.period) perMM++;
        if (gv.flags !== mv.flags) flMM++;
      }
    }
    console.log(`  d=${d >= 0 ? '+' : ''}${d}: acc=${accMM} period=${perMM} flags=${flMM} /${tot}`);
  }
}
