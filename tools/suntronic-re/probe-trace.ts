import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, 'gliders.src')));
const s = parseSunTronicV13Score(data);
const e = s.subsongs[0].entries[0];
console.log('deltaA', s.deltaA, 'periodsOff', (0x318+s.deltaA+0x11ae).toString(16), 'drinOff', (0x318+s.deltaA+0x1daf).toString(16));
for (let ch=0; ch<4; ch++){
  const start = e.trackPtrs[ch];
  const bytes = [...s.h1.slice(start, start+28)].map(b=>b.toString(16).padStart(2,'0'));
  console.log(`v${ch} tp=0x${start.toString(16)} tr=${e.transposes[ch]}: ${bytes.join(' ')}`);
}
// dump drin + periods head
const dOff=0x318+s.deltaA+0x1daf, pOff=0x318+s.deltaA+0x11ae;
console.log('drin[0..15]', [...s.h1.slice(dOff,dOff+16)].map(b=>((b<<24)>>24)).join(','));
console.log('periods[20..28]w', [0,1,2,3,4,5,6,7,8].map(i=>{const o=pOff+(20+i)*2;return ((s.h1[o]<<8)|s.h1[o+1]);}).join(','));
