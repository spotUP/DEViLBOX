// debug script — temporary
import { parseMEDFile } from '../src/lib/import/formats/MEDParser';
import { readFileSync } from 'fs';

const buf = readFileSync('public/data/songs/formats/funky nightmare.mmd1');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const song = parseMEDFile(buf.buffer, 'funky nightmare.mmd1') as any;
console.log('numChannels:', song.numChannels);
console.log('songPositions:', JSON.stringify(song.songPositions?.slice(0,10)));
console.log('initialSpeed:', song.initialSpeed, 'initialBPM:', song.initialBPM);
const pat = song.patterns[20];
if (pat) {
  console.log('Pat 20 channels:', pat.channels?.length);
  for (let r = 0; r < 16; r++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (pat.channels as any[])?.map((ch: any) => {
      const cell = ch.rows?.[r];
      if (!cell) return '----';
      const n = String(cell.note).padStart(2,' ');
      const i = String(cell.instrument).padStart(2,' ');
      const et = (cell.effTyp??0).toString(16);
      const ef = (cell.eff??0).toString(16).padStart(2,'0');
      return `n${n}i${i}e${et}${ef}`;
    }).join(' | ');
    console.log(`Row ${String(r).padStart(2,' ')}:`, row);
  }
}
