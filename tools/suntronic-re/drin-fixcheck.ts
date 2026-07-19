import * as fs from 'fs'; import * as path from 'path';
function u32(b:Uint8Array,o:number){return((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;}
function s16(b:Uint8Array,o:number){const v=(b[o]<<8)|b[o+1];return v&0x8000?v-0x10000:v;}
function extract(buf:Uint8Array){let p=4;while(u32(buf,p)!==0){const n=u32(buf,p);p+=4+n*4;}p+=4;p+=4;const first=u32(buf,p);p+=4;const last=u32(buf,p);p+=4;const c=last-first+1;for(let i=0;i<c;i++)p+=4;const H:Uint8Array[]=[];let hi=0;while(p<buf.length&&hi<c){const t=u32(buf,p)&0x3fffffff;p+=4;if(t===0x3e9||t===0x3ea||t===0x3eb){const w=u32(buf,p);p+=4;if(t===0x3eb){H.push(new Uint8Array(0));hi++;}else{H.push(buf.subarray(p,p+w*4));p+=w*4;hi++;}}else if(t===0x3ec){while(true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4;p+=n*4;}}else if(t===0x3f2){}else if(t===0x3f0){while(true){const n=u32(buf,p);p+=4;if(n===0)break;p+=4*n;p+=4;}}else break;}return H;}
const sig=[0x42,0x45,0x1a,0x28,0x00,0x0e];const dir=path.resolve(process.cwd(),'public/data/songs/formats/SUNTronicTunes');
const throwers=['Bio-1.src','Lightforce','MIC-sound-1.src','R-DEMO-II','ROUTINE0','Techno0.src','orbital.src','paradroid.01','rock-1','shadowfire-2.src','sound1.s','tank','tank7','time10.src','time11.src','time12.src','time13.src','time20.src','time30.src','time40.src','w-sound1','witõka.src'];
let fixed=0;
for(const f of throwers){const h1=extract(new Uint8Array(fs.readFileSync(path.join(dir,f))))[1];let found=false;
  for(let i=0;i+12<=h1.length;i+=2){if(h1[i]!==0x47||h1[i+1]!==0xfa)continue;let ok=true;for(let k=0;k<6;k++)if(h1[i+4+k]!==sig[k]){ok=false;break;}if(!ok)continue;
    const off=(i+2)+s16(h1,i+2);const sw=(h1[i+10]<<8)|h1[i+11];const shift=sw===0xe94d?4:sw===0xe74d?3:0;
    // PROPOSED relaxed gate: real site if valid shift + off in-bounds (drop the *16 trailing requirement)
    if(shift!==0&&off>=0&&off<h1.length){found=true;break;}}
  if(found)fixed++;else console.log('STILL FAILS:',f);}
console.log(`Proposed relaxed gate parses ${fixed}/22 previously-throwing files`);
