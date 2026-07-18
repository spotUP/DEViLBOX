import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const NAME=process.argv[2]??'kompo05.src',V=parseInt(process.argv[3]??'1',10),N=parseInt(process.argv[4]??'14',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
const score=parseSunTronicV13Score(data);
const player:A=new (SunTronicPlayer as A)(score);
const hex=(off:number,n:number)=>Array.from(player.h1.slice(off,off+n)).map((b:number)=>b.toString(16).padStart(2,'0')).join(' ');
const co=player.controlOpcode.bind(player);
player.controlOpcode=(v:A,op:number,a1:number)=>{const b=a1;const r=co(v,op,a1);
  if(v.channel===V)console.log(`    op=0x${op.toString(16)} [${hex(b,r-b)}] -> vol=${v.volume} slide=${v.volumeSlide}`);return r;};
for(let c=0;c<N;c++){const v=player.voices[V];
  console.log(`tick ${c}: speed=${v.speed} tempoTick=${v.tempoTick} cursor=0x${v.cursor.toString(16)} next=[${hex(v.cursor,8)}] | vol=${v.volume} slide=${v.volumeSlide} outVol=${v.outVolume}`);
  player.stepVblankOnce();
}
