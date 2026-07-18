import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, process.env.SONG ?? 'ready')));
const s: any = parseSunTronicV13Score(data);
console.log('keys:', Object.keys(s));
for (const k of Object.keys(s)) {
  const v = s[k];
  if (Array.isArray(v)) console.log(`  ${k}: array len ${v.length}`, v.length<24?JSON.stringify(v):JSON.stringify(v.slice(0,12)));
  else if (typeof v !== 'object' || v===null) console.log(`  ${k}:`, v);
  else console.log(`  ${k}: obj keys`, Object.keys(v||{}));
}
