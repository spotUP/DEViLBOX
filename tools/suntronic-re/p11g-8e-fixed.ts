// Fixed walk: follow trackPtrs, stop each voice's walk at 0x00-terminated note groups
// up to a generous row cap, across all positions. Report 0x8e/0x8d decoded as opcodes.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseHunks, parseSunTronicV13Score, sunCommandLen, type SunCmdWidths } from '../../src/lib/import/formats/SunTronicV13';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = readdirSync(CORPUS).filter(f=>statSync(join(CORPUS,f)).isFile());
function walkModule(f:string){
  const buf=new Uint8Array(readFileSync(join(CORPUS,f)));
  const h1=parseHunks(buf).hunks[1].data;
  const score:any=parseSunTronicV13Score(buf);
  const widths:SunCmdWidths={arpShift:score.arpShift??4,volSlideRateFromStream:score.volSlideRateFromStream??true};
  const rowsPP=score.rowsPerPositionDefault||16;
  const found:{op:number;ch:number;pos:number;row:number;operand:number[]}[]=[];
  for(const ss of score.subsongs){
    for(let ch=0;ch<4;ch++){
      for(let pi=0;pi<ss.entries.length;pi++){
        const e=ss.entries[pi]; let ptr=e.trackPtrs[ch]>>>0;
        if(!ptr||(ptr&0x80000000))continue;
        let row=0,guard=0;
        while(row<rowsPP&&ptr<h1.length&&guard++<5000){
          const b=h1[ptr];
          if(b===0x00){ptr++;row++;continue;}
          const len=sunCommandLen(h1,ptr,widths);
          if(b===0x8e||b===0x8d) found.push({op:b,ch,pos:pi,row,operand:[h1[ptr+1],h1[ptr+2]]});
          ptr+=len;
        }
      }
    }
  }
  return found;
}
let modsWith=0; const detail:string[]=[];
for(const f of files){ try{
  const fnd=walkModule(f);
  const has8e=fnd.some(x=>x.op===0x8e), has8d=fnd.some(x=>x.op===0x8d);
  if(has8e||has8d){modsWith++; detail.push(`${f}: ${fnd.map(x=>`${x.op.toString(16)}@ch${x.ch}pos${x.pos}row${x.row}[${x.operand}]`).join(' ')}`);}
}catch{}}
console.log(`${modsWith} modules DECODE 0x8e/0x8d as a note opcode.`);
console.log(detail.slice(0,25).join('\n'));
console.log('\n--- ballblaser specifically ---');
const bb=walkModule('ballblaser.src');
console.log(bb.length? bb.map(x=>JSON.stringify(x)).join('\n') : '  NONE — ballblaser emits no 0x8e/0x8d opcode');
