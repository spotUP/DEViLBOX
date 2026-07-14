import { readFileSync } from 'fs';
import { parseSunTronicV13Score, decodeSunBlock } from '../../src/lib/import/formats/SunTronicV13';
const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/mule.src'));
const score = parseSunTronicV13Score(buf);
console.log('block: idx off notes rows byteSize');
score.blocks.forEach((b,i)=>console.log(`  fp${i} 0x${b.h1Offset.toString(16)} n=${b.noteCount} rows=${b.rowCount} sz=${b.byteSize}`));
const sub=score.subsongs[0];
console.log('rowsPerPositionDefault', score.rowsPerPositionDefault);
// does any block have rowCount > rowsDefault(32)? that would truncate in walk
score.blocks.forEach((b,i)=>{ if(b.rowCount>score.rowsPerPositionDefault) console.log(`  fp${i} rowCount ${b.rowCount} > default ${score.rowsPerPositionDefault} -> WALK TRUNCATES`); });
// voice2 entries -> block rowCounts
for(const v of [2,3]){
  console.log(`voice ${v} entry blocks (fp:rows:notes):`, sub.entries.map(e=>{const idx=score.blockIndexByOffset.get(e.trackPtrs[v]); return idx===undefined?'-':`${idx}:${score.blocks[idx].rowCount}:${score.blocks[idx].noteCount}`;}).join(' '));
}
