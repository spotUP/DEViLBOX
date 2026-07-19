import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score, sunCommandLen } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunGroup } from '../../src/lib/import/formats/sunGroupCodec';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const score: any = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'shades.src'))));
const h1 = score.h1;
const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
const numSampled = score.sampledInstruments.length;
console.log('arpShift', score.arpShift, 'volSlideRateFromStream', score.volSlideRateFromStream);
console.log('len(0x94@11894)=', sunCommandLen(h1, 11894, widths), 'bytes', [11894,11895,11896,11897].map(o=>'0x'+h1[o].toString(16)).join(' '));
for (const t of [0, 24]) {
  const d = decodeSunGroup(h1, 11894, t, 0, numSampled, widths);
  console.log(`t=${t}: note=${d.cell.note} nextPos=${d.nextPos} eff3=${d.cell.effTyp3}/${d.cell.eff3}`);
}
