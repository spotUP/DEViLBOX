import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunBlockPool, buildPoolRowIndex } from '../../src/lib/import/formats/sunNativeData';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const score: any = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'shades.src'))));
const pool = decodeSunBlockPool(score);
const idx = buildPoolRowIndex(score);
const b = score.blocks[44];
console.log('block44 offset', b.h1Offset, 'byteSize', b.byteSize, 'rowCount', b.rowCount);
// raw bytes
const raw = Array.from(score.h1.slice(b.h1Offset, b.h1Offset + b.byteSize)).map((x:number)=>x.toString(16).padStart(2,'0')).join(' ');
console.log('raw:', raw);
console.log('pool[44] notes:', pool[44].map((c:any,i:number)=>`${i}:${c.note}`).join(' '));
// which offsets does poolRowIndex map to (44,*)
const rev: string[] = [];
for (const [off, v] of idx.entries()) if (v.blockIndex===44) rev.push(`${off}->${v.rowInBlock}`);
console.log('idx (44,*):', rev.sort((a,b)=>+a.split('->')[0]-+b.split('->')[0]).join(' '));
