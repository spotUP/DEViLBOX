import * as fs from 'fs'; import * as path from 'path';
function u32(b:Uint8Array,o:number){return((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;}
function extract(buf:Uint8Array){let p=4;while(u32(buf,p)!==0){const n=u32(buf,p);p+=4+n*4;}p+=4;p+=4;const first=u32(buf,p);p+=4;const last=u32(buf,p);p+=4;const c=last-first+1;for(let i=0;i<c;i++)p+=4;const H:any[]=[];let hi=0;while(p<buf.length&&hi<c){const t=u32(buf,p)&0x3fffffff;p+=4;if(t===0x3e9||t===0x3ea||t===0x3eb){const w=u32(buf,p);p+=4;if(t===0x3eb){H.push(new Uint8Array(0));hi++;}else{H.push(buf.subarray(p,p+w*4));p+=w*4;hi++;}}else if(t===0x3ec){while(true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4;p+=n*4;}}else if(t===0x3f2){}else if(t===0x3f0){while(true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4*n;p+=4;}}else break;}return H;}
const dir=path.resolve(process.cwd(),'public/data/songs/formats/SUNTronicTunes');
for(const f of ['time10.src','ready']){
  const buf=new Uint8Array(fs.readFileSync(path.join(dir,f)));const h1=extract(buf)[1];
  for(let i=0;i+12<=h1.length;i+=2){if(h1[i]!==0x47||h1[i+1]!==0xfa)continue;
    let ok=true;const sig=[0x42,0x45,0x1a,0x28,0x00,0x0e];for(let k=0;k<6;k++)if(h1[i+4+k]!==sig[k]){ok=false;break;}if(!ok)continue;
    const win=Array.from(h1.subarray(i,i+12)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
    const s16=((h1[i+2]<<8)|h1[i+3]);const off=(i+2)+(s16&0x8000?s16-0x10000:s16);
    console.log(`${f}: lea site @${i}: [${win}] -> drinOff=${off}, trailing bytes=${h1.length-off}`);
  }
}
