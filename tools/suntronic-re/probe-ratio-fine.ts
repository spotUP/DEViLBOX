import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../..');
const CORPUS=resolve(REPO,'public/data/songs/formats/SUNTronicTunes');
const golden=JSON.parse(readFileSync(resolve(REPO,'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json'),'utf8'));
function run(name:string,P:number,phase:number):number{
  const data=new Uint8Array(readFileSync(resolve(CORPUS,name)));
  const pl=new SunTronicPlayer(parseSunTronicV13Score(data),{subsong:0,ciaTickSamples:P,rowPhaseSamples:phase});
  const S=golden.modules[name];const raw:any[]=[];
  for(let i=0;i<S.length;i++)raw.push(pl.tick().voices.map((v:any)=>({period:v.period,acc:v.acc&0xffff,flags:v.flags&0xff})));
  let mm=0;for(let i=1;i<S.length;i++){const g=S[i-1].voices;for(let v=0;v<4;v++){const gv=g[v],mv=raw[i][v];if(gv.period!==mv.period||gv.acc!==mv.acc||gv.flags!==mv.flags)mm++;}}
  return mm;
}
for(const target of ['gliders.src','ballblaser.src']){
  let bT=1e9,bP=0,bH=0;
  for(let P=880;P<=887;P+=0.01)for(let ph=0;ph<P;ph+=1){const m=run(target,P,ph);if(m<bT){bT=m;bP=P;bH=ph;}}
  console.log(`${target}: best=${bT} at P=${bP.toFixed(3)} phase=${bH}`);
}
// joint best P, independent phase per song
let bT=1e9,bP=0;const bH:Record<string,number>={};
for(let P=880;P<=887;P+=0.01){let tot=0;const ph:Record<string,number>={};for(const n of Object.keys(golden.modules)){let bm=1e9,bp=0;for(let p=0;p<P;p+=1){const m=run(n,P,p);if(m<bm){bm=m;bp=p;}}tot+=bm;ph[n]=bp;}if(tot<bT){bT=tot;bP=P;Object.assign(bH,ph);}}
console.log(`joint best total=${bT} at P=${bP.toFixed(3)} phases=${JSON.stringify(bH)}`);
