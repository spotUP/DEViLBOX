import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const N=parseInt(process.argv[2]??'120',10);
const files=readdirSync(CORPUS_DIR).filter(f=>!f.startsWith('.'));
const hits:string[]=[];
for(const f of files){
  let player:A;try{player=new (SunTronicPlayer as A)(parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))));}catch{continue;}
  const run=[0,0,0,0],best=[0,0,0,0];const prev=[-999,-999,-999,-999];
  for(let c=0;c<N;c++){player.stepVblankOnce();
    for(let v=0;v<4;v++){const V=player.voices[v];
      const slide=(V.volumeSlide<<24>>24); // s8
      const changed=(V.volume&0xff)!==prev[v]; prev[v]=V.volume&0xff;
      if(slide!==0 && changed){run[v]++;if(run[v]>best[v])best[v]=run[v];}else run[v]=0;}}
  const bad=best.map((b,v)=>b>=3?`v${v}:${b}`:'').filter(Boolean);
  if(bad.length)hits.push(`${f} [${bad.join(' ')}]`);
}
console.log('songs where INT.volume genuinely slides via $0D (>=3 consecutive changing ticks):');
hits.forEach(h=>console.log('  '+h)); console.log('total:',hits.length);
