/** Measure the true player-tick period: total $24 advances (each = one EFFECTS/
 * player-tick) over a long render, / total samples. Also detect whether doubles are
 * uniformly spaced (constant period) or clustered (data-driven). $24 advance=8000. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod=any; const SPT=882; const name=process.argv[2]??'gliders.src'; const NSAMP=300*1024;
(async()=>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0; addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(SPT*4),R=mod._malloc(SPT*4),rd=mod._malloc(64);
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  const base0=0x26f8a;
  mod._uade_wasm_stop();load();
  let prev=s16(rW(base0+0x24)),advances=0,firstAdv=-1,lastAdv=-1,doubles=0;
  const dblTicks:number[]=[];
  for(let s=0;s<NSAMP;s++){
    if(mod._uade_wasm_render(L,R,1)<=0){console.log('song ended at sample',s);break;}
    const c=s16(rW(base0+0x24)); if(c!==prev){let d=c-prev;if(d<-4000)d+=65536;const n=Math.round(d/8000);advances+=n;if(firstAdv<0)firstAdv=s;lastAdv=s;if(n>=2){doubles++;dblTicks.push(Math.round(s/1024));}prev=c;}
  }
  const span=lastAdv-firstAdv;
  console.log(`advances=${advances} over samples[${firstAdv}..${lastAdv}] span=${span}`);
  console.log(`player period = ${(span/(advances-1)).toFixed(3)} samples/tick  (=${(44100/(span/(advances-1))).toFixed(3)} Hz)`);
  console.log(`doubles=${doubles}, first 30 double-ticks:`,dblTicks.slice(0,30).join(','));
  const gaps=dblTicks.slice(1,30).map((t,i)=>t-dblTicks[i]);
  console.log('double gaps:',gaps.join(','));
})();
