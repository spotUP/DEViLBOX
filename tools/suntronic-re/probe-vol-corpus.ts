import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3,REG_VOL=4;
async function one(mod:AnyMod,name:string,nSteps:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const per:number[][]=[[],[],[],[]], vol:number[][]=[[],[],[],[]]; const curV=[-1,-1,-1,-1];
  for(let c=0;c<nSteps*3;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const packed=hh[base+i*3];const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff,val=packed&0xffff;
      if(ch>3)continue; if(reg===REG_VOL)curV[ch]=val; else if(reg===REG_PER){per[ch].push(val);vol[ch].push(curV[ch]);}}
    if(Math.min(...per.map(a=>a.length))>=nSteps+2)break;
  }
  mod._free(L);mod._free(R);mod._free(lg);
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const np:number[][]=[[],[],[],[]],nv:number[][]=[[],[],[],[]];
  for(let c=0;c<nSteps;c++){const vs=player.stepVblankOnce().voices;for(let v=0;v<4;v++){np[v].push(vs[v].period);nv[v].push(paulaAudxVol(vs[v].outVolume&0xff));}}
  const res:{pm:number,vm:number,n:number,vbs:number}[]=[];
  for(let v=0;v<4;v++){let pm=0,t=0;for(let c=0;c<nSteps;c++){if(c>=per[v].length)break;t++;if(np[v][c]===per[v][c])pm++;}
    // VOL: best shift in -2..2 of UADE vol vs native
    let vm=0,vbs=0;for(let s=-2;s<=2;s++){let m=0;for(let c=0;c<t;c++){const ui=c+s;if(ui<0||ui>=vol[v].length)continue;if(nv[v][c]===vol[v][ui])m++;}if(m>vm){vm=m;vbs=s;}}
    res.push({pm,vm,n:t,vbs});}
  return res;
}
async function main(){
  const nSteps=parseInt(process.argv[2]??'80',10);
  const files=readdirSync(CORPUS_DIR).filter(f=>!f.startsWith('.')).slice(0, parseInt(process.argv[3]??'40',10));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  let perBad=0,volBad=0,ok=0,fail=0; let volMissTicks=0,volTotTicks=0,perfectVoices=0,totVoices=0;
  const volFails:string[]=[]; const perFails:string[]=[];
  for(const f of files){
    let r; try{r=await one(mod,f,nSteps);}catch{r=null;}
    if(!r){fail++;continue;}
    ok++;
    let songPerBad=false,songVolBad=false;
    for(let v=0;v<4;v++){if(r[v].n>0){volMissTicks+=r[v].n-r[v].vm;volTotTicks+=r[v].n;totVoices++;if(r[v].vm===r[v].n)perfectVoices++;}}
    for(let v=0;v<4;v++){if(r[v].n>0&&r[v].pm<r[v].n)songPerBad=true;if(r[v].n>0&&r[v].vm<r[v].n)songVolBad=true;}
    if(songPerBad){perBad++;perFails.push(f+' ['+r.map((x,v)=>x.pm<x.n?`v${v}:${x.pm}/${x.n}`:'').filter(Boolean).join(' ')+']');} if(songVolBad){volBad++;volFails.push(f+' ['+r.map((x,v)=>x.vm<x.n?`v${v}:${x.vm}/${x.n}@${x.vbs}`:'').filter(Boolean).join(' ')+']');}
  }
  console.log(`parsed=${ok} failload=${fail}  songs-with-PER-mismatch=${perBad}  songs-with-VOL-mismatch=${volBad}`);
  console.log(`VOL mismatch ticks=${volMissTicks}/${volTotTicks}  perfect voices=${perfectVoices}/${totVoices}`);
  if(process.env.QUIET)return;
  console.log('PER fails:'); perFails.forEach(x=>console.log('  '+x)); console.log('VOL fails:'); volFails.forEach(s=>console.log('  '+s));
}
main().catch(e=>{console.error(e);process.exit(1);});
