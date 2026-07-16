/** probe-rpp-sweep.ts — HYPOTHESIS: ballblaser's position length is 17 rows, not the
 * parsed default 16. Force rowsPerPos to each candidate and count golden mismatches. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const golden: any = JSON.parse(readFileSync(GOLDEN, 'utf8'));

function run(name: string, rpp: number | null): { mm: number; det: string } {
  const samples = golden.modules[name];
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, name))));
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  if (rpp !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of (pl as any).voices) v.rowsPerPos = rpp;
  }
  const tl = pl.renderTimeline(samples.length);
  let mm = 0; const det: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i - 1].voices, mv = tl[i].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== mv[v].period || g[v].acc !== (mv[v].acc & 0xffff) || (g[v].flags & 0xff) !== (mv[v].flags & 0xff)) {
        mm++; if (det.length < 6) det.push(`t${i}v${v}dP${mv[v].period - g[v].period}`);
      }
    }
  }
  return { mm, det: det.join(' ') };
}

for (const name of ['gliders.src', 'ballblaser.src']) {
  for (const rpp of [null, 16, 17, 18]) {
    const { mm, det } = run(name, rpp);
    // eslint-disable-next-line no-console
    console.log(`${name} rpp=${rpp ?? 'parsed'}: ${mm}/316  ${det}`);
  }
}
