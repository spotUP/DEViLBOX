import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { reprojectSunGrid } from '../../src/lib/import/formats/sunReproject';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const name = process.argv[2] ?? 'shades.src';
const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const song: any = parseSunTronicFile(ab, name);
const native = song.sunTronicNative;
const isGlide = (c:any)=>[c.effTyp,c.effTyp2,c.effTyp3,c.effTyp4,c.effTyp5].includes(3);
// snapshot original walk notes
const orig: number[][][] = song.patterns.map((p:any)=>p.channels.map((ch:any)=>ch.rows.map((c:any)=>c?c.note:0)));
reprojectSunGrid(song.patterns, native);
let diverge=0, transposedNoted=0;
for (let pi=0; pi<song.patterns.length; pi++){
  const p = song.patterns[pi];
  for (let ch=0; ch<4; ch++){
    for (let r=0; r<p.channels[ch].rows.length; r++){
      const c = p.channels[ch].rows[r];
      if (!c) continue;
      const o = orig[pi][ch][r];
      if (o<=0) continue;
      if (isGlide(c)) continue;                 // glide model = agent B domain
      if (o===1 || o===96) continue;            // clamp-boundary = agent B domain
      const pos = c.sunPosition;
      const t = pos!==undefined ? native.positions[pos]?.transpose[ch] : 0;
      if (t) transposedNoted++;
      if (c.note !== o){ diverge++; if (diverge<=10) console.log(`pat${pi} ch${ch} row${r} orig=${o} reproj=${c.note} t=${t}`); }
    }
  }
}
console.log(`${name}: plain-note divergences after reproject(unchanged pool) = ${diverge}; transposed plain notes checked = ${transposedNoted}`);
