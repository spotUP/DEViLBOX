import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';
const s8=(b:number)=>(b<<24)>>24;
const files=readdirSync(CORPUS_DIR).filter(f=>f.endsWith('.src'));
let tot=0, neg2=0, neg1=0, negOther=0; const negVals=new Set<number>();
let filesWithNeg2=0, filesWithNegOther=0, parsed=0;
for(const f of files){
  let score;
  try{ score=parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))); }
  catch{ continue; }
  parsed++;
  let fNeg2=false, fNegO=false;
  for(const ins of score.synthInstruments){
    const t=ins.arpTable; if(!t) continue;
    for(let i=0;i<t.length;i++){ const v=s8(t[i]); tot++;
      if(v===-1)neg1++; else if(v===-2){neg2++;fNeg2=true;} else if(v<0){negOther++;negVals.add(v);fNegO=true;} }
  }
  if(fNeg2)filesWithNeg2++; if(fNegO)filesWithNegOther++;
}
console.log(`files=${files.length} parsed=${parsed} arpBytes=${tot}`);
console.log(`  -1 (noise): ${neg1}`);
console.log(`  -2 (escape): ${neg2}   in ${filesWithNeg2} files`);
console.log(`  other-neg (delta body): ${negOther}  in ${filesWithNegOther} files`);
console.log(`  distinct other-neg: ${[...negVals].sort((a,b)=>a-b).join(',')}`);
