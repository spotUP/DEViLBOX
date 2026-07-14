/** Per-tick table (gate $08, written every tick): voice0 vibPhase, period, cursor $0,
 * tempo bytes $2c/$2d. See exactly what co-varies with the +16000 vib jumps. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const SCAN_LO=0x20000,SCAN_HI=0x40000;
async function run(name:string):Promise<void>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const load=():void=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
    const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
    if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');mod._free(p);mod._free(h);};
  const L=mod._malloc(4),R=mod._malloc(4),cap=mod._malloc(72),rd=mod._malloc(8);
  const capU32=(i:number):number=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop();load();const hist=new Map<number,number>();
  for(let c=0;c<400;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let pc=0,best=-1;for(const[p,n]of hist)if(n>best){best=n;pc=p;}
  mod._uade_wasm_stop();load();let base0=0xffffffff;
  for(let c=0;c<120;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(pc,(pc+2)>>>0);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const s16=(w:number):number=>(w<<16)>>16;
  const rB=(a:number,n:number):number[]=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b:number[]=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  const rW=(a:number):number=>{const b=rB(a,2);return(b[0]<<8)|b[1];};
  const rL=(a:number):number=>{const b=rB(a,4);return((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0;};
  mod._uade_wasm_stop();load();
  console.log(`\n${name} base0=${base0.toString(16)}  [tick: vib(Δ) per cur $2c $2d]`);
  let prevVib=0,first=true;
  const rows:string[]=[];
  for(let s=0;s<30000&&rows.length<22;s++){mod._uade_wasm_arm_capture((base0+0x08)>>>0,2);mod._uade_wasm_arm_capture_pc(0,0);
    if(mod._uade_wasm_render(L,R,1)<=0)break;
    if(mod._uade_wasm_get_capture(cap)){const vib=s16(rW(base0+0x24));let d=vib-prevVib;if(d<-40000)d+=65536;if(d>40000)d-=65536;
      const mark=first?'   ':(d===16000?'<<<':'   ');
      rows.push(`t${String(rows.length).padStart(2)} vib${String(vib).padStart(7)}(${first?'   -':String(d).padStart(6)}) per${rW(base0+0x20)} cur${rL(base0+0x00).toString(16)} tc${rB(base0+0x2c,1)[0]} tn${rB(base0+0x2d,1)[0]} ${mark}`);
      prevVib=vib;first=false;}}
  for(const r of rows)console.log(r);
  try{mod._uade_wasm_cleanup();}catch{}
}
(async()=>{await run('gliders.src');})().catch(e=>{console.error(e);process.exit(1);});
