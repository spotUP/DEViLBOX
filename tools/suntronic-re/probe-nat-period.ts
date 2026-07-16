import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const HERE=dirname(fileURLToPath(import.meta.url));
const CORPUS=resolve(HERE,'../../public/data/songs/formats/SUNTronicTunes');
const data=new Uint8Array(readFileSync(join(CORPUS,'gliders.src')));
const pl=new SunTronicPlayer(parseSunTronicV13Score(data),{subsong:0});
const per:number[]=[],p24:number[]=[];
for(let i=0;i<22;i++){const v=pl.tick().voices[0];per.push(v.period);p24.push(((pl as any).voices[0].vibPhase)|0);}
console.log('native v0 period:',per.join(','));
console.log('native v0 $24   :',p24.join(','));
const gold=[251,253,256,258,256,252,250,251,253,255,257,257,252,250,250,253,255,257,255,252,250,250];
console.log('golden v0 period:',gold.join(','));
