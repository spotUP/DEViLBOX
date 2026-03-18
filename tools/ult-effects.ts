import { parseULTFile } from '../src/lib/import/formats/ULTParser';
import { readFileSync } from 'fs';
const buf = readFileSync('./public/data/songs/formats/seasons.ult');
const song = parseULTFile(buf.buffer, 'seasons.ult') as any;
console.log('numPatterns:', song?.patterns?.length || 'undefined');
console.log('songPositions:', JSON.stringify(song?.songPositions));
// Find all F effects
const fEffects: string[] = [];
if (song?.patterns) {
  for (let pi = 0; pi < song.patterns.length; pi++) {
    const pat = song.patterns[pi] as any;
    const rowCount = pat?.channels?.[0]?.rows?.length;
    if (rowCount !== 64) console.log(`Pat ${pi} has ${rowCount} rows!`);
    for (let ci = 0; ci < (pat?.channels?.length ?? 0); ci++) {
      const ch = pat.channels[ci];
      for (let ri = 0; ri < (ch?.rows?.length ?? 0); ri++) {
        const row = ch.rows[ri];
        if (row && row.effTyp === 0x0F && row.eff > 0) {
          fEffects.push(`Pat${pi} Row${ri} Ch${ci}: F${row.eff.toString(16).padStart(2,'0')}`);
        }
      }
    }
  }
}
console.log('F effects:', JSON.stringify(fEffects));
