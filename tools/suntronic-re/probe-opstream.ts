/** Dump raw opcode stream per voice for pos 0 (hunk1-relative cursors). */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'comming0.src';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p: any = new (SunTronicPlayer as any)(score);
const h1: Uint8Array = p.h1;
const seq = p.sequence;
const entry = seq[0];
console.log(name, 'pos0 trackPtrs:', entry.trackPtrs.map((x:number)=>x.toString(16)));
for (let v=0; v<4; v++){
  let a = entry.trackPtrs[v];
  const bytes:number[]=[];
  for (let g=0; g<200 && a < h1.length; g++){ const b=h1[a++]; bytes.push(b); if(b===0) break; }
  const has91 = bytes.includes(0x91);
  console.log(`v${v} @${entry.trackPtrs[v].toString(16)} has0x91=${has91}:`, bytes.map(b=>b.toString(16).padStart(2,'0')).join(' '));
}
