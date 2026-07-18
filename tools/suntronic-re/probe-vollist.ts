import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3,REG_VOL=4;
async function main(){
  const name=process.argv[2]??'multi-arp-long.src';
  const nSteps=parseInt(process.argv[3]??'40',10);
  const V=parseInt(process.argv[4]??'1',10);
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  // per-vblank: collect [pers...],[vols...] between consecutive frames. Use PER write as frame delimiter.
  const frames:{per:number,vols:number[]}[]=[]; let cur:{per:number,vols:number[]}|null=null;
  for(let c=0;c<nSteps*3 && frames.length<nSteps+4;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const packed=hh[base+i*3];const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff,val=packed&0xffff;
      if(ch!==V)continue;
      if(reg===REG_PER){cur={per:val,vols:[]};frames.push(cur);}
      else if(reg===REG_VOL&&cur){cur.vols.push(val);}
    }
  }
  try{mod._uade_wasm_cleanup();}catch{}
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  console.log(`idx | nat per/vol | UADE per / vol-writes-this-frame`);
  for(let c=0;c<nSteps;c++){const t=player.stepVblankOnce().voices[V];const f=frames[c];
    console.log(`${String(c).padStart(3)} | ${String(t.period).padStart(5)} ${String(t.outVolume&0xff).padStart(3)} | ${String(f?.per??-1).padStart(5)}  [${f?f.vols.join(','):''}]`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
