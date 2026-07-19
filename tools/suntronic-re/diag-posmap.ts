import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const raw = new Uint8Array(readFileSync(join(CORPUS, 'shades.src')));
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const song: any = parseSunTronicFile(ab, 'shades.src');
const native = song.sunTronicNative;
const score: any = parseSunTronicV13Score(raw);
console.log('patterns=', song.patterns.length, 'native.positions=', native.positions.length, 'subsong entries=', score.subsongs[0].entries.length);
// distinct sunPosition values in pattern 27 ch3
const p = song.patterns[27];
const set = new Set<number>();
for (const c of p.channels[3].rows) if (c && c.sunPosition !== undefined) set.add(c.sunPosition);
console.log('pat27 ch3 sunPosition values:', [...set]);
// what does native.positions[27] transpose look like vs entry 27
console.log('native.positions[27].transpose=', native.positions[27]?.transpose, 'entry27.transposes=', score.subsongs[0].entries[27].transposes);
// find a mismatch cell and print its full provenance
for (let r = 0; r < p.channels[3].rows.length; r++) {
  const c = p.channels[3].rows[r];
  if (c && c.note === 94) { console.log('cell row', r, 'note', c.note, 'bi', c.sunBlockIndex, 'ri', c.sunRowInBlock, 'pos', c.sunPosition, 'poolNote', native.blocks[c.sunBlockIndex][c.sunRowInBlock].note, 'transpose@pos', native.positions[c.sunPosition].transpose[3]); break; }
}
