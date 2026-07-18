/** Is native decode periodic? Compare loop1 vs loop2 PER/VOL per voice. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';

const name = process.argv[2] ?? 'ready';
const ticks = 5200;
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p: any = new (SunTronicPlayer as any)(score);
const per: number[][] = [[],[],[],[]], vol: number[][] = [[],[],[],[]], pos: number[] = [];
for (let c=0;c<ticks;c++){ const s=p.stepVblankOnce();
  for(let v=0;v<4;v++){ per[v].push(s.voices[v].period); vol[v].push(paulaAudxVol(s.voices[v].outVolume&0xff)); }
  pos.push(p.debugVoice(0).position); }
let loopLen=-1, left=false;
for(let c=1;c<ticks;c++){ if(pos[c]!==0) left=true; if(left&&pos[c]===0&&pos[c-1]!==0){ loopLen=c; break; } }
console.log('loopLen(pos0 return) =', loopLen);
for(let L=2400;L<2800;L++){
  let bad=0; for(let v=0;v<4;v++) for(let c=0;c<2000;c++){ if(per[v][c]!==per[v][c+L]||vol[v][c]!==vol[v][c+L]) bad++; }
  if(bad<50) console.log(`period L=${L}: mismatch=${bad}/8000`);
}
// detail at exact loop length
console.log('--- per-voice mismatch loop1 vs loop2 at L=2555 (first 2000 ticks) ---');
const L=2555;
for(let v=0;v<4;v++){
  let pbad=0,vbad=0,firstP=-1,firstV=-1;
  for(let c=0;c<2000;c++){
    if(per[v][c]!==per[v][c+L]){ pbad++; if(firstP<0)firstP=c; }
    if(vol[v][c]!==vol[v][c+L]){ vbad++; if(firstV<0)firstV=c; }
  }
  console.log(`v${v}: PERdiff=${pbad} (first@tick ${firstP}, pos ~${Math.floor(firstP/80)})  VOLdiff=${vbad} (first@${firstV})`);
}
