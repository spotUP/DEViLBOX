import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const s8=(b:number)=>(b<<24)>>24;
const files=readdirSync(CORPUS_DIR).filter(f=>f.endsWith('.src'));
for(const f of files){
  let score; try{ score=parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))); }catch{ continue; }
  score.synthInstruments.forEach((ins,idx)=>{
    if(ins.synthType!==1) return;
    const t=ins.arpTable; if(!t) return;
    const pos:number[]=[]; for(let i=0;i<t.length;i++) if(s8(t[i])===-2) pos.push(i);
    if(pos.length){
      // played range: index cycles 0..arpLen-1 then loops to arpLoop
      const inCycle=pos.filter(p=>p<ins.arpLen);
      console.log(`${f} inst#${idx} arpLen=${ins.arpLen} arpLoop=${ins.arpLoop} -2@[${pos.join(',')}] playedIdx=[${inCycle.join(',')}] arp=[${Array.from(t).map(s8).join(',')}]`);
    }
  });
}
