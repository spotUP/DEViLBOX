import * as fs from 'fs';
import * as path from 'path';

// Replicate EXACTLY the real parser's h1 by importing parseHunks path indirectly.
// parseHunks isn't exported, but parseSunTronicV13Score is. We patch the module's
// internal by re-deriving deltaA path is unnecessary; we just need h1. The score
// parser throws before returning for failing files, so we can't get its h1 that way.
// Instead: reproduce the exact bound check the parser applies and see which branch
// rejects, using the SAME hunk walk that produced valid sig hits.

function u32(b: Uint8Array, o: number) { return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0; }
function s16BE(b: Uint8Array, o: number) { const v=(b[o]<<8)|b[o+1]; return v & 0x8000 ? v - 0x10000 : v; }

function extractHunks(buf: Uint8Array): { data: Uint8Array; fileOffset: number; type: number }[] {
  let p = 0;
  if (u32(buf, 0) !== 0x000003f3) throw new Error('not HUNK_HEADER');
  p = 4;
  while (u32(buf, p) !== 0) { const n = u32(buf, p); p += 4 + n*4; }
  p += 4;
  const tableSize = u32(buf, p); p += 4;
  const first = u32(buf, p); p += 4;
  const last = u32(buf, p); p += 4;
  const count = last - first + 1;
  for (let i = 0; i < count; i++) { p += 4; }
  void tableSize; void first;
  const hunks: { data: Uint8Array; fileOffset: number; type: number }[] = [];
  let hi = 0;
  while (p < buf.length && hi < count) {
    const type = u32(buf, p) & 0x3fffffff; p += 4;
    if (type === 0x3e9 || type === 0x3ea || type === 0x3eb) {
      const words = u32(buf, p); p += 4;
      if (type === 0x3eb) { hunks.push({ data: new Uint8Array(0), fileOffset: p, type }); hi++; }
      else { const bytes = words*4; hunks.push({ data: buf.subarray(p, p+bytes), fileOffset: p, type }); p += bytes; hi++; }
    } else if (type === 0x3ec) {
      while (true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4;p+=n*4;}
    } else if (type === 0x3f2) { /* end */ }
    else if (type === 0x3f0) { while(true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4*n;p+=4;} }
    else break;
  }
  return hunks;
}

const REF_DRIN_SIG = [0x42,0x45,0x1a,0x28,0x00,0x0e];
const MAIN=0xe94d, VERSA=0xe74d;

const dir = path.resolve(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['ready','time10.src','witõka.src','tank','Lightforce','orbital.src','paradroid.01','Bio-1.src','sound1.s'];

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`MISSING ${f}`); continue; }
  const buf = new Uint8Array(fs.readFileSync(p));
  let hunks;
  try { hunks = extractHunks(buf); } catch(e:any){ console.log(`${f}: hunk err ${e.message}`); continue; }
  const h1 = hunks[1]?.data;
  if (!h1) { console.log(`${f}: no h1`); continue; }
  // Exact replica of parser loop lines 836-848
  let drinOff=-1, arpShift=0, rejectReason='';
  for (let i=0;i+12<=h1.length;i+=2){
    if (h1[i]!==0x47||h1[i+1]!==0xfa) continue;
    let ok=true; for(let k=0;k<REF_DRIN_SIG.length;k++){if(h1[i+4+k]!==REF_DRIN_SIG[k]){ok=false;break;}}
    if(!ok) continue;
    const off=(i+2)+s16BE(h1,i+2);
    const shiftWord=(h1[i+10]<<8)|h1[i+11];
    const shift= shiftWord===MAIN?4: shiftWord===VERSA?3:0;
    if(shift===0){rejectReason=`shiftWord 0x${shiftWord.toString(16)} not MAIN/VERSA`;continue;}
    if(off<0){rejectReason=`off<0 (${off})`;continue;}
    if(off+(1<<shift)*16>h1.length){rejectReason=`bound: off(${off})+${(1<<shift)*16} > h1.len(${h1.length})`;continue;}
    drinOff=off; arpShift=shift; break;
  }
  const hunkTypeName = hunks[1].type===0x3e9?'CODE':hunks[1].type===0x3ea?'DATA':hunks[1].type===0x3eb?'BSS':'?';
  console.log(`${f}: h1=${h1.length}B(${hunkTypeName}) drinOff=${drinOff} shift=${arpShift}${drinOff<0?'  REJECT: '+rejectReason:''}`);
}
