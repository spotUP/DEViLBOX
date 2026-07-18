import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const NAME=process.argv[2]??'kompo05.src'; const WANTV=parseInt(process.argv[3]??'1',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
const score=parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player:any=new (SunTronicPlayer as any)(score);
let inst:AnyMod=null;const orig=player.noteOn.bind(player);
player.noteOn=(v:AnyMod,sel:number)=>{orig(v,sel);if(v.channel===WANTV&&v.instr&&!inst)inst=v.instr;};
for(let c=0;c<20;c++)player.stepVblankOnce();
if(!inst){console.log('no synth instr on voice',WANTV);process.exit(0);}
console.log(`${NAME} v${WANTV} synthType=${inst.synthType}`);
console.log(`volEnvLen=${inst.volEnvLen} volEnvLoop=${inst.volEnvLoop}`);
console.log(`volEnv(first 24)=[${Array.from(inst.volEnv.slice(0,24)).join(',')}]`);
