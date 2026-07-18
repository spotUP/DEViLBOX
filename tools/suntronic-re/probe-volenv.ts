import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'comming0.src';
const idxs = (process.argv[3] ?? '0,6').split(',').map(Number);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p: any = new (SunTronicPlayer as any)(score);
for (const i of idxs){
  const d:any = p.sampledTable[i]; if(!d){console.log(`idx${i} NULL`);continue;}
  console.log(`idx${i} volEnvOff=${d.volEnvOff} volEnvLen=${d.volEnvLen} volEnv bytes=[${Array.from(d.volEnv).join(',')}]`);
}
// Now step player, print v1 outVolume & env for first 6 ticks
console.log('--- per-tick v1 (ch1) ---');
for(let t=0;t<6;t++){ const s=p.stepVblankOnce(); const dv=p.debugVoice(1);
  console.log(`t${t} v1 outVol=${s.voices[1].outVolume} volume=${dv.volume} volEnvIndex=${dv.volEnvIndex} instr=${dv.instr?'synth':dv.sampled?'sampled':'none'}`); }
