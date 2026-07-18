import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const NAME=process.argv[2]??'kompo05.src',V=parseInt(process.argv[3]??'1',10),N=parseInt(process.argv[4]??'12',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
const score=parseSunTronicV13Score(data);
const player:A=new (SunTronicPlayer as A)(score);
console.log('tick | volume slide envIdx outVol | instr(len,loop,type)');
for(let c=0;c<N;c++){const vs=player.stepVblankOnce().voices;const v=vs[V];
  const i=v.instr;
  console.log(`${String(c).padStart(4)} | ${String(v.volume).padStart(4)} ${String(v.volumeSlide).padStart(4)} ${String(v.volEnvIndex).padStart(3)} ${String(v.outVolume).padStart(4)} | ${i?`len=${i.volEnvLen} loop=${i.volEnvLoop} t=${i.synthType} env=[${Array.from(i.volEnv.slice(0,6)).join(',')}]`:'null'}`);
}
