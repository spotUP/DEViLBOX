import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const REG_PER=3, REG_VOL=4;
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
  const CH=882;
  const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  // ordered PER writes + track current VOL alongside each PER write
  const perSeq:number[]=[]; const volAt:number[]=[]; let curVol=-1;
  for(let c=0;c<nSteps*3 && perSeq.length<nSteps+4;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);
    const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){
      const packed=hh[base+i*3];
      const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff,val=packed&0xffff;
      if(ch!==V)continue;
      if(reg===REG_VOL) curVol=val;
      else if(reg===REG_PER){ perSeq.push(val); volAt.push(curVol); }
    }
  }
  try{mod._uade_wasm_cleanup();}catch{}
  // native ordered step sequence
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const nper:number[]=[]; const nvol:number[]=[];
  for(let c=0;c<nSteps;c++){const t=player.stepVblankOnce().voices[V];nper.push(t.period);nvol.push(t.outVolume&0xff);}
  // best integer shift of UADE-write-list vs native (search -3..+3)
  let bestShift=0,bestScore=-1;
  for(let s=-3;s<=3;s++){
    let m=0,t=0;
    for(let c=0;c<nSteps;c++){const ui=c+s; if(ui<0||ui>=perSeq.length)continue; t++; if(perSeq[ui]===nper[c])m++;}
    if(t>0 && m>bestScore){bestScore=m;bestShift=s;}
  }
  console.log(`song=${name} v${V}  UADE PER writes=${perSeq.length}  bestShift=${bestShift} (match ${bestScore}/${nSteps})`);
  console.log(`idx | native per/vol | UADE per/vol (shifted ${bestShift}) | dPer`);
  let pm=0,vm=0;
  for(let c=0;c<nSteps;c++){
    const ui=c+bestShift;
    const up=ui>=0&&ui<perSeq.length?perSeq[ui]:NaN;
    const uv=ui>=0&&ui<volAt.length?volAt[ui]:NaN;
    const dp=up-nper[c];
    if(up===nper[c])pm++; if(uv===nvol[c])vm++;
    console.log(`${String(c).padStart(3)} | ${String(nper[c]).padStart(5)} ${String(nvol[c]).padStart(3)} | ${String(up).padStart(5)} ${String(uv).padStart(3)} | ${Number.isNaN(dp)?'':dp===0?'.':dp}`);
  }
  console.log(`--- aligned PER ${pm}/${nSteps}  VOL ${vm}/${nSteps} ---`);
}
main().catch(e=>{console.error(e);process.exit(1);});
