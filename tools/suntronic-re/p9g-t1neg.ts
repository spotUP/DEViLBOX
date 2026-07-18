import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const s8=(b:number)=>(b<<24)>>24;
const files=readdirSync(CORPUS_DIR).filter(f=>f.endsWith('.src'));
type Row={f:string;idx:number;arp0:number;negCount:number;arpLen:number};
const rows:Row[]=[];
for(const f of files){
  let score; try{ score=parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))); }catch{ continue; }
  score.synthInstruments.forEach((ins,idx)=>{
    if(ins.synthType!==1) return;
    const t=ins.arpTable; if(!t||t.length===0) return;
    let neg=0; for(let i=0;i<t.length;i++){const v=s8(t[i]); if(v<0&&v!==-1&&v!==-2)neg++;}
    if(neg>0) rows.push({f,idx,arp0:s8(t[0]),negCount:neg,arpLen:t.length});
  });
}
rows.sort((a,b)=>b.negCount-a.negCount);
console.log(`type-1 instruments with delta-body negatives: ${rows.length}`);
for(const r of rows.slice(0,20)) console.log(`  ${r.f} inst#${r.idx} arpLen=${r.arpLen} neg=${r.negCount} arp[0]=${r.arp0}`);
