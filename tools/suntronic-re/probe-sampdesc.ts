import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'comming0.src';
const idxs = (process.argv[3] ?? '0').split(',').map(Number);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p: any = new (SunTronicPlayer as any)(score);
console.log(name, 'sampledTable len', p.sampledTable.length);
for (const i of idxs){
  const d = p.sampledTable[i];
  if (!d) { console.log(`idx${i}: NULL`); continue; }
  const clone:any = {}; for (const k of Object.keys(d)) { const v=(d as any)[k]; clone[k]=(v&&v.length!==undefined&&typeof v!=='string')?`[len ${v.length}]`:v; }
  console.log(`idx${i}:`, JSON.stringify(clone));
}
