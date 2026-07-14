/** probe-golden-diff.ts — run the native SunTronicPlayer against the committed
 * fire-based (note-clock) golden and report the true mismatch count for both
 * alignments (native i vs golden[i] and golden[i+1]). Decides whether, on the
 * SINGLE CIA clock proven by probe-fieldwatch, the native player is already
 * byte-exact. NOT committed. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { CORPUS_DIR } from './suntronicLib';

interface Row { period: number; acc: number; vol: number; flags: number }
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, '../../src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { modules: Record<string, { tick: number; voices: Row[] }[]> };

function diffAt(name: string, samples: { voices: Row[] }[], warmup: number): { count: number; first: string[] } {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });
  for (let w = 0; w < warmup; w++) player.tick(); // discard native priming tick(s)
  const first: string[] = []; let count = 0;
  for (let i = 0; i < samples.length; i++) {
    const mv = player.tick().voices;
    const g = samples[i].voices;
    for (let v = 0; v < 4; v++) {
      const gv = g[v], m = mv[v];
      if (gv.period !== m.period || gv.acc !== (m.acc & 0xffff) || gv.flags !== m.flags) {
        count++;
        if (first.length < 10) first.push(`t${i} v${v}: G{p${gv.period} a${gv.acc.toString(16)} f${gv.flags.toString(16)}} N{p${m.period} a${(m.acc & 0xffff).toString(16)} f${m.flags.toString(16)}}`);
      }
    }
  }
  return { count, first };
}

for (const [name, samples] of Object.entries(golden.modules)) {
  const total = samples.length * 4;
  for (const warmup of [0, 1, 2]) {
    const { count, first } = diffAt(name, samples, warmup);
    console.log(`\n${name} warmup=${warmup}: ${count}/${total} cell-mismatches`);
    for (const f of first.slice(0, 6)) console.log('   ' + f);
  }
}
