/** Dump UADE voice-struct fields per music-tick: $c vol, $14 flags, $15 outVol, $4 instr, $20 period. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO=0x20000, SCAN_HI=0x40000, STRIDE=0x1ba, TICK_PC=0x2660e;
async function run(name:string, nticks:number):Promise<void>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const load=():void=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');mod._free(p);mod._free(h);};
  const L=mod._malloc(4),R=mod._malloc(4),cap=mod._malloc(72),rd=mod._malloc(8);
  const capU32=(i:number):number=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop();load();const hist=new Map<number,number>();
  for(let c=0;c<400;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let wpc=0,wbest=-1;for(const[p,n]of hist)if(n>wbest){wbest=n;wpc=p;}
  mod._uade_wasm_stop();load();let base0=0xffffffff;
  for(let c=0;c<120;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(wpc,(wpc+2)>>>0);if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const rB=(a:number,n:number):number[]=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b:number[]=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  const rW=(a:number):number=>{const b=rB(a,2);return(b[0]<<8)|b[1];};
  const rL=(a:number):number=>{const b=rB(a,4);return((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0;};
  mod._uade_wasm_stop();load();
  console.log(`${name} base0=${base0.toString(16)}`);
  const AVOL=[0xdff0a8,0xdff0b8,0xdff0c8,0xdff0d8], ALEN=[0xdff0a4,0xdff0b4,0xdff0c4,0xdff0d4];
  console.log('tick | ch: structVol$15 / paulaAUDxVOL / paulaLEN');
  for(let t=0;t<nticks;t++){
    mod._uade_wasm_arm_capture_pc(TICK_PC,(TICK_PC+2)>>>0);
    if(mod._uade_wasm_render(L,R,1)<=0)break;
    if(!mod._uade_wasm_get_capture(cap))continue;
    let row=`${String(t).padStart(4)} |`;
    for(let v=0;v<4;v++){const b=base0+v*STRIDE;const ov=rB(b+0x15,1)[0];const m38=rB(b+0x38,1)[0];const m39=rB(b+0x39,1)[0];const la=rW(b+0x1a);
      row+=` ch${v} $15=${String(ov).padStart(2)} $38=${m38.toString(16).padStart(2,'0')} $39=${m39.toString(16).padStart(2,'0')} len$1a=${String(la).padStart(4)} |`;}
    console.log(row);
  }
  try{mod._uade_wasm_cleanup();}catch{/**/}
}
run(process.argv[2]??'comming0.src',parseInt(process.argv[3]??'8',10)).catch(e=>{console.error(e);process.exit(1);});
