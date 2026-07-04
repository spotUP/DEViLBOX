// moira-reference.cjs — WIP song-level lock-test REFERENCE (task C).
// Runs the REAL Amiga Cinter4.S in the Moira 68k WASM core (from amiexpress-web)
// to capture ground-truth Paula register writes per tick, to diff cinter4.c against.
//
//   MOIRA_JS=/path/to/amiga-emulation/cpu/build/moira.js \
//   node tools/cinter-audit/moira-reference.cjs
//
// STATUS: proves Moira loads + executes 68k in node (millions of instrs). The
// register/memory setup still diverges (a6 appears wrong at the first CinterMakeSinus
// store; execution runs off into RAM without returning). NEXT: fix reg conventions
// (d0-7=0-7, a0-7=8-15, PC=16 per MoiraEmulator.ts) / memory map, then per-tick
// CinterPlay1@0x1D8 + CinterPlay2@0x22C driving + read Paula regs at $dff0a0/$dff096.
// NB the Moira build prints debug WATCHPOINT lines — noise, ignore or rebuild w/o.
const fs=require('fs');
const MOIRA_JS=process.env.MOIRA_JS||'/Users/spot/Code/amiexpress-web/web/backend/src/amiga-emulation/cpu/build/moira.js';
const createMoira=require(MOIRA_JS);
const REF=process.env.CINTER_REF_DIR||require('path').join(__dirname,'reference');
const CIN='src/lib/export/__tests__/fixtures/cinter4/CurtCool-BackInSpace.golden.cinter4';
(async()=>{
  const M=await createMoira();
  const cpu=new M.MoiraCPU(16*1024*1024);
  const code=new Uint8Array(fs.readFileSync(REF+'/Cinter4.bin'));
  const music=new Uint8Array(fs.readFileSync(CIN));
  const CODE=0x2000, WORK=0x100000, MUSIC=0x200000, INST=0x400000, STACK=0x0F0000;
  const CinterInit=CODE+0x0;
  // write bytes helper
  const wr=(base,arr)=>{for(let i=0;i<arr.length;i++)cpu.setMemoryByte(base+i,arr[i]);};
  const w32=(a,v)=>{cpu.setMemoryByte(a,(v>>>24)&255);cpu.setMemoryByte(a+1,(v>>>16)&255);cpu.setMemoryByte(a+2,(v>>>8)&255);cpu.setMemoryByte(a+3,v&255);};
  // reset vectors then reset
  w32(0,STACK); w32(4,CODE);
  cpu.resetCPU();
  wr(CODE,code); wr(MUSIC,music);
  for(let i=0;i<0x8200;i++)cpu.setMemoryByte(WORK+i,0);
  // registers: d0-7=0-7, a0-7=8-15, PC=16.  a2=10,a4=12,a6=14, sp=a7=15
  cpu.setRegister(10,MUSIC); cpu.setRegister(12,INST); cpu.setRegister(14,WORK);
  const SENT=0x00FFFE;
  cpu.setRegister(15,STACK); // SP
  // push sentinel return addr
  w32(STACK-4,SENT); cpu.setRegister(15,STACK-4);
  cpu.setRegister(16,CinterInit); // PC
  let it=0; for(;it<5_000_000;it++){ if((cpu.getRegister(16)>>>0)===SENT)break; cpu.executeInstruction(); }
  // scan instrument space for nonzero synthesized PCM
  let nz=0,peak=0,first=-1;
  for(let i=0;i<0x200000;i++){const v=cpu.getMemoryByte(INST+i); const s=v>127?v-256:v; if(s!==0){nz++;if(first<0)first=i;const a=Math.abs(s);if(a>peak)peak=a;}}
  console.log('iters',it,'PC=0x'+(cpu.getRegister(16)>>>0).toString(16),'returned='+(((cpu.getRegister(16)>>>0)===SENT)));
  console.log('inst space: nonzeroBytes='+nz+' firstNZ@'+first+' peakAbs='+peak);
  cpu.delete&&cpu.delete();
})().catch(e=>{console.error('ERR',e.message);});
