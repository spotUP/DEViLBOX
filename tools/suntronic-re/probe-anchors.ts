/**
 * probe-anchors.ts — search hunk#1 for the PERIODS ramp signature (known
 * replayer-constant words 428,453,480,508,538,570,604,640 = index 0x20..0x28)
 * to confirm the table is identical + relocation-independently locatable across
 * modules. Prints match offset and implied table base (match - 0x40). NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const SIG = [428, 453, 480, 508, 538, 570, 604, 640];

function search(name: string): void {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const h1 = score.h1;
  const hits: number[] = [];
  for (let o = 0; o + SIG.length * 2 <= h1.length; o += 2) {
    let ok = true;
    for (let i = 0; i < SIG.length; i++) {
      if (((h1[o + i * 2] << 8) | h1[o + i * 2 + 1]) !== SIG[i]) { ok = false; break; }
    }
    if (ok) hits.push(o);
  }
  console.log(`${name}: deltaA=${score.deltaA} hits=[${hits.map((h) => h.toString(16)).join(',')}] tableBase(match-0x40)=[${hits.map((h) => (h - 0x40).toString(16)).join(',')}]`);
}

search(process.argv[2] ?? 'gliders.src');
search(process.argv[3] ?? 'ballblaser.src');
