import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any; const REG_PER=3,REG_VOL=4;
const N=20;
async function uadeVol(mod:A,name:string,V:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const vol:number[]=[];let curV=-1;
  for(let c=0;c<N*3&&vol.length<N;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const packed=hh[base+i*3];const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff,val=packed&0xffff;
      if(ch!==V)continue; if(reg===REG_VOL)curV=val; else if(reg===REG_PER)vol.push(curV);}
  }
  mod._free(L);mod._free(R);mod._free(lg);
  return vol;
}
async function main(){
  const songs=process.argv.slice(2);
  const mod:A=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  for(const name of songs){
    let score:A;try{const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));score=parseSunTronicV13Score(data);}catch(e){console.log(`${name}: PARSEFAIL ${(e as Error).message.slice(0,40)}`);continue;}
    // native
    const player:A=new (SunTronicPlayer as A)(score);
    const nslide:number[][]=[[],[],[],[]],nvol:number[][]=[[],[],[],[]];
    for(let c=0;c<N;c++){const vs=player.stepVblankOnce().voices;for(let v=0;v<4;v++){nvol[v].push(vs[v].outVolume&0xff);nslide[v].push((player.voices[v].volumeSlide<<24>>24));}}
    for(let v=0;v<4;v++){
      // only voices with a nonzero slide at some point
      if(!nslide[v].some(s=>s!==0))continue;
      const uv=await uadeVol(mod,name,v);if(!uv)continue;
      const slideVals=[...new Set(nslide[v].filter(s=>s!==0))];
      console.log(`${name} v${v} slide={${slideVals.join(',')}}`);
      console.log(`   NAT: ${nvol[v].slice(0,N).join(',')}`);
      console.log(`   UAD: ${uv.slice(0,N).join(',')}`);
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
