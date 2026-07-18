import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const name=process.argv[2]??'comming0.src';
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const score:any=parseSunTronicV13Score(data);
console.log('score keys:', Object.keys(score).join(', '));
for(const k of Object.keys(score)){ const v=(score as any)[k];
  if(Array.isArray(v)) console.log(`  ${k}: Array(${v.length})`);
  else if(v&&typeof v==='object') console.log(`  ${k}: {${Object.keys(v).slice(0,8).join(',')}}`);
  else console.log(`  ${k}: ${v}`);
}
