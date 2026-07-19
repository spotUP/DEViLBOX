import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/analgestic2.src');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const song: any = parseSunTronicFile(ab, 'analgestic2.src');
const score: any = parseSunTronicV13Score(new Uint8Array(ab));
// stamped rows per position for ch1
const per = new Map<number, number>();
for (const pat of song.patterns) for (const c of pat.channels[1].rows) {
  if (c && c.sunPosition !== undefined) per.set(c.sunPosition, (per.get(c.sunPosition)??0)+1);
}
// show positions where <16 rows stamped
console.log('ch1 positions with != 16 stamped rows:');
for (const [p,n] of [...per].sort((a,b)=>a[0]-b[0])) if (n !== 16) console.log(`  pos ${p}: ${n} rows`);
// block rowCounts + the ptr for ch1 pos 81
const sub = score.subsongs[0];
const e = sub.entries[81];
const ptr = e.trackPtrs[1];
const fp = score.blockIndexByOffset.get(ptr);
console.log('ch1 pos81 ptr=', ptr, 'blockIndex=', fp, 'block.rowCount=', fp!==undefined?score.blocks[fp].rowCount:'n/a');
console.log('rowsPerPositionDefault=', score.rowsPerPositionDefault);
console.log('sample block rowCounts:', score.blocks.slice(0,10).map((b:any)=>b.rowCount));
