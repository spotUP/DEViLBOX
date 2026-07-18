import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const NAME=process.argv[2]??'comming0.src'; const N=parseInt(process.argv[3]??'40',10);
async function main(){
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(NAME.length*4+1);mod.stringToUTF8(NAME,h,NAME.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4);
  const c0=mod._malloc(CH*4),c1=mod._malloc(CH*4),c2=mod._malloc(CH*4),c3=mod._malloc(CH*4);
  const rms=(ptr:number,n:number)=>{const a=new Float32Array(mod.HEAPU8.buffer,ptr,n);let s=0,pk=0;for(let i=0;i<n;i++){s+=a[i]*a[i];pk=Math.max(pk,Math.abs(a[i]));}return[Math.sqrt(s/n),pk];};
  console.log('frame | v0rms v1rms v2rms v3rms | v1peak');
  for(let c=0;c<N;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const got=mod._uade_wasm_read_channel_samples(c0,c1,c2,c3,CH);
    const [r0]=rms(c0,got),[r1,p1]=rms(c1,got),[r2]=rms(c2,got),[r3]=rms(c3,got);
    console.log(`${String(c).padStart(3)} | ${r0.toFixed(3)} ${r1.toFixed(3)} ${r2.toFixed(3)} ${r3.toFixed(3)} | pk=${p1.toFixed(3)}`);
  }
  mod._free(L);mod._free(R);mod._free(c0);mod._free(c1);mod._free(c2);mod._free(c3);
}
main().catch(e=>{console.error(e);process.exit(1);});
