import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const s8=(b:number)=>(b<<24)>>24;
const files=readdirSync(CORPUS_DIR).filter(f=>f.endsWith('.src'));
let t1insts=0, t1arpBytes=0, minV=999,maxV=-999;
const valHist=new Map<number,number>();
for(const f of files){
  let score; try{ score=parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))); }catch{ continue; }
  for(const ins of score.synthInstruments){
    if(ins.synthType!==1) continue; t1insts++;
    const t=ins.arpTable; if(!t) continue;
    for(let i=0;i<t.length;i++){const v=s8(t[i]); t1arpBytes++; minV=Math.min(minV,v);maxV=Math.max(maxV,v); valHist.set(v,(valHist.get(v)??0)+1);}
  }
}
console.log(`type-1 instruments=${t1insts} arpBytes=${t1arpBytes} range=[${minV},${maxV}]`);
const negs=[...valHist.keys()].filter(v=>v<0).sort((a,b)=>a-b);
console.log(`negative values present on type-1 arp tables: ${negs.length?negs.map(v=>`${v}(x${valHist.get(v)})`).join(' '):'NONE'}`);
