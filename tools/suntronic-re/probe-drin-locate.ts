import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const SIG = [428,453,480,508]; // PERIODS ramp, replayer constant
function findPeriods(mod:AnyMod):number{
  const scan = mod._malloc(0x80000);
  mod._uade_wasm_read_memory(0x20000, scan, 0x80000);
  for(let a=0;a+SIG.length*2<=0x80000;a+=2){
    let ok=true;
    for(let i=0;i<SIG.length;i++){const w=(mod.HEAPU8[scan+a+i*2]<<8)|mod.HEAPU8[scan+a+i*2+1];if(w!==SIG[i]){ok=false;break;}}
    if(ok) return 0x20000+a;
  }
  return -1;
}
async function loadSong(name:string):Promise<AnyMod>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const ptr=mod._malloc(data.byteLength);mod.HEAPU8.set(data,ptr);
  const hp=mod._malloc(name.length*4+1);mod.stringToUTF8(name,hp,name.length*4+1);
  mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(ptr,data.byteLength,hp)!==0)throw new Error('load '+name);
  const L=mod._malloc(1024*4),R=mod._malloc(1024*4);
  for(let i=0;i<40;i++)mod._uade_wasm_render(L,R,882);
  return mod;
}
function readMem(mod:AnyMod,abs:number,len:number):number[]{
  const rd=mod._malloc(len);mod._uade_wasm_read_memory(abs>>>0,rd,len);
  const o:number[]=[];for(let i=0;i<len;i++){const b=mod.HEAPU8[rd+i];o.push(b>127?b-256:b);}return o;
}
async function main(){
  // 1) gliders: periodsAbs + known drin 0x2828b -> gap
  const g=await loadSong('gliders.src');
  const pg=findPeriods(g);
  const gap=0x2828b - pg;
  console.log(`gliders periodsAbs=${pg.toString(16)} drin=0x2828b gap=${gap} (0x${(gap>>>0).toString(16)})`);
  try{g._uade_wasm_cleanup();}catch{}
  // 2) ready: periodsAbs -> drinAbs = periodsAbs + gap
  const name=process.argv[2]??'ready';
  const r=await loadSong(name);
  const pr=findPeriods(r);
  const drinAbs=pr+gap;
  console.log(`${name} periodsAbs=${pr.toString(16)} drinAbs=${drinAbs.toString(16)}`);
  const drin=readMem(r,drinAbs,256);
  for(let row=0;row<16;row++)console.log(`  row${row} (arpSel${row}):`,drin.slice(row*16,row*16+16).join(' '));
  try{r._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
