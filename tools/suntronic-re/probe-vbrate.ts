import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const REG_PER=3;
async function main(){
  const name=process.argv[2]??'multi-arp-long.src';
  const V=parseInt(process.argv[3]??'1',10);
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const SMALL=64; // fine-grained render to timestamp writes ~sample-accurate
  const L=mod._malloc(SMALL*4),R=mod._malloc(SMALL*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const writeSamplePos:number[]=[];
  let pos=0;
  const totalChunks=Math.floor(44100/SMALL); // ~1 second
  for(let c=0;c<totalChunks;c++){
    if(mod._uade_wasm_render(L,R,SMALL)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);
    const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){
      const packed=hh[base+i*3];
      const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff;
      if(ch===V&&reg===REG_PER) writeSamplePos.push(pos); // pos = chunk start (±SMALL)
    }
    pos+=SMALL;
  }
  const nw=writeSamplePos.length;
  console.log(`song=${name} v${V}  PER writes in ~1s=${nw}  => samples/write≈${(pos/nw).toFixed(3)}  (grid=882.759)`);
  // inter-write gaps
  const gaps:number[]=[];
  for(let i=1;i<Math.min(nw,30);i++) gaps.push(writeSamplePos[i]-writeSamplePos[i-1]);
  console.log('first gaps (samples between consecutive PER writes):', gaps.join(' '));
}
main().catch(e=>{console.error(e);process.exit(1);});
