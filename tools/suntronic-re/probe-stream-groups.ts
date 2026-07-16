/** probe-stream-groups.ts — count 0x00-terminated opcode groups in each song's
 * position-0 v0 note-stream, from the position-0 seq-entry trackPtr[0] up to the
 * next position's trackPtr[0]. Resolves whether GNN is per-row (~16 groups) or
 * per-tick (~96 groups), and shows exactly which group native's wrap skips. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');

for (const name of ['gliders.src', 'ballblaser.src']) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score: any = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, name))));
  const h1 = score.h1 as Uint8Array;
  const seq = score.subsongs[0].entries as Array<{ trackPtrs: number[] }>;
  const p0 = seq[0].trackPtrs[0];
  // pos0 v0 stream end = smallest trackPtr[0] across positions that is > p0, else h1 end.
  let p1 = h1.length;
  for (const e of seq) { const q = e.trackPtrs[0]; if (q > p0 && q < p1) p1 = q; }
  // eslint-disable-next-line no-console
  console.log(`== ${name} == pos0 v0 stream 0x${p0.toString(16)}..0x${p1.toString(16)} (len ${p1 - p0})`);
  let a = p0, group = 0;
  const groups: string[] = [];
  while (a < p1 && group < 40) {
    const start = a;
    const bytes: string[] = [];
    for (;;) {
      const d0 = h1[a++] ?? 0;
      bytes.push('0x' + d0.toString(16).padStart(2, '0'));
      if (d0 === 0x00) break;
      if (a >= p1) break;
    }
    groups.push(`g${group}@0x${start.toString(16)}:[${bytes.join(' ')}]`);
    group++;
  }
  // eslint-disable-next-line no-console
  console.log(`  ${group} groups until next-pos ptr:`);
  for (const g of groups) console.log(`    ${g}`);
}
