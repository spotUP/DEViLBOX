import { readFileSync } from 'fs';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/ready'));
const s:any = parseSunTronicV13Score(buf);
console.log('subsongs:', s.subsongs.length);
s.subsongs.forEach((ss:any,i:number)=>console.log(`  subsong ${i}: entries=${ss.entries.length}`));
console.log('seqEndKind:', s.seqEndKind, 'blocks:', s.blocks.length);
// player subsong selection
