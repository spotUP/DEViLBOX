import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, 'ready')));
const s: any = parseSunTronicV13Score(data);
console.log('top keys:', Object.keys(s));
for (const k of Object.keys(s)) {
  const v = (s as any)[k];
  if (Array.isArray(v)) console.log(`  ${k}: array[${v.length}]`, v.length && typeof v[0]==='object' ? Object.keys(v[0]) : v.slice(0,8));
  else if (v && typeof v==='object') console.log(`  ${k}: obj`, Object.keys(v).slice(0,12));
  else console.log(`  ${k}:`, v);
}
