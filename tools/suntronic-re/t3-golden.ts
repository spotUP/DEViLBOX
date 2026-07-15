import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSynthTick, createVoiceState, createPrng } from '../../src/engine/suntronic/SunTronicSynthVoice';
const hex=(b:Int8Array|Uint8Array)=>{let s='';for(let i=0;i<b.length;i++)s+=(b[i]&0xff).toString(16).padStart(2,'0');return s;};
function capture(mod:any,name:string,data:Uint8Array):Set<string>{
  const cf=882,chunks=300;const ptr=mod._malloc(data.byteLength);mod.HEAPU8.set(data,ptr);
  const hp=mod._malloc(name.length*4+1);mod.stringToUTF8(name,hp,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(ptr,data.byteLength,hp)!==0)throw new Error('load');mod._free(ptr);mod._free(hp);
  mod._uade_wasm_enable_paula_log(1);
  const pL=mod._malloc(cf*4),pR=mod._malloc(cf*4),lp=mod._malloc(512*3*4),mb=mod._malloc(8192);
  const loc=[0,0,0,0],lenW=[0,0,0,0],lch=[0,0,0,0];const set=new Set<string>();
  for(let c=0;c<chunks;c++){if(mod._uade_wasm_render(pL,pR,cf)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lp,512);const base=lp>>2;const h=new Uint32Array(mod.HEAPU8.buffer);
    for(let i=0;i<n;i++){const pk=h[base+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
      if(ch>3)continue;if(reg===0)lch[ch]=val;else if(reg===1)loc[ch]=(((lch[ch]<<16)|val)>>>0);else if(reg===2)lenW[ch]=val;}
    for(let ch=0;ch<4;ch++){if(!loc[ch]||!lenW[ch])continue;mod._uade_wasm_read_memory(loc[ch],mb,lenW[ch]*2);set.add(hex(new Uint8Array(mod.HEAPU8.buffer.slice(mb,mb+lenW[ch]*2))));}}
  return set;
}
async function main(){
  const name=process.argv[2]??'ox.src';
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const score=parseSunTronicV13Score(data);
  const mod:any=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const uade=capture(mod,name,data);
  for(const inst of score.synthInstruments.filter((s:any)=>s.synthType===3)){
    const st=createVoiceState();const prng=createPrng();
    const ticks=Math.max(1,inst.arpLen)*2+4;let found=false;
    for(let t=0;t<ticks;t++){
      const arpIdx=st.arpIndex;const d1=inst.arpTable[arpIdx]??0;
      const buf=renderSynthTick(inst,st,prng);const hx=hex(buf);
      if(uade.has(hx)){console.log(`MATCH rec=0x${inst.recordOff.toString(16)} wwl=${inst.waveWordLen} tick=${t} arpIdxUsed=${arpIdx} d1=${d1} len=${buf.length}`);console.log(`  hex=${hx}`);found=true;break;}
    }
    if(!found)console.log(`no match rec=0x${inst.recordOff.toString(16)} wwl=${inst.waveWordLen}`);
  }
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
