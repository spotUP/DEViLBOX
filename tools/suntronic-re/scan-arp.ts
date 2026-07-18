import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, process.env.SONG ?? 'ready')));
const s: any = parseSunTronicV13Score(data);
const h1: Uint8Array = s.h1;
// scan every track pointer used across positions for 0x9c (arp selector) opcodes
const ptrs = new Set<number>();
for (const e of s.subsongs[0].entries) for (const p of e.trackPtrs) if (p>0) ptrs.add(p>>>0);
let total9c = 0;
for (const p of [...ptrs].sort((a,b)=>a-b)) {
  // decode forward until a 0x00 group-end appears ~a few groups; just scan 64 bytes
  let n9c = 0, sels: number[] = [];
  for (let i=p; i<Math.min(p+80,h1.length); i++){ if(h1[i]===0x9c){ n9c++; sels.push(h1[i+1]); } }
  if (n9c>0){ total9c+=n9c; console.log(`track ${p}: ${n9c}x 0x9c arp, sel bytes ${JSON.stringify(sels.slice(0,8))}`); }
}
console.log(`\ntotal 0x9c across tracks: ${total9c}`);
console.log(`arpTable lens: ${s.synthInstruments.map((x:any)=>x.arpLen).join(',')}`);
