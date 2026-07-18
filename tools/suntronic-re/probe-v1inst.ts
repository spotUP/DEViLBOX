/** Inspect native per-voice instrument selection + volEnv for a song at tick T. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name=process.argv[2]??'comming0.src'; const T=parseInt(process.argv[3]??'5',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
const score=parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p:any=new (SunTronicPlayer as any)(score);
for(let t=0;t<=T;t++)p.stepVblankOnce();
for(let v=0;v<4;v++){
  const raw=p.voices[v];
  const inst=raw.instr??raw.sampled;
  const env=inst?.volEnv;
  console.log(`v${v}: flags=0x${(raw.flags&0xff).toString(16)} synthFlag=${raw.synthFlag} volume=0x${(raw.volume&0xff).toString(16)} volEnvIdx=${raw.volEnvIndex} outVol=${raw.outVolume&0xff} instr=${raw.instr?'A':(raw.sampled?'B':'null')} volEnvLen=${inst?.volEnvLen} volEnvLoop=${inst?.volEnvLoop} env[0..8]=${env?Array.from(env.slice(0,9)).join(','):'-'}`);
}
