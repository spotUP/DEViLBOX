// Voice-3 audio-state trace for globe.src (shown-but-silent ch4). Steps the
// player, on each ch3 note-on dumps instrument resolution + volume + attach.
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'globe.src';
const b = readFileSync(join(process.cwd(),'public/data/songs/formats/SUNTronicTunes',name));
const score = parseSunTronicV13Score(new Uint8Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));
console.log('sampledInstruments', score.sampledInstruments.length);
const player: any = new SunTronicPlayer(score);
let fires=0;
player.rowRecorder=(ch:number,pos:number,row:number,note:number)=>{
  if(ch===3 && fires<20){const t=player.snapshot().voices[3];
    console.log(`ch3 note=${note} pos=${pos} row=${row} instrOff=${t.instrOff} sampleSlot=${t.sampleSlot} vol=${t.volume} outVol=${t.outVolume} flags=${t.flags} attach[2]=${player.snapshot().voices[2].attachModulator} attach[3]=${t.attachModulator}`);fires++;}
};
let started=false,prev=0;
for(let i=0;i<200000;i++){player.stepVblankOnce();const p0=player.debugVoice(0).position;if(p0>0)started=true;if(started&&p0===0&&prev>0)break;prev=p0;}
// summarize: how many ticks did voice3 have outVolume>0 vs instrOff>=0
let ticks=0,volPos=0,hasInstr=0;const p2:any=new SunTronicPlayer(score);
let st=false,pv=0;
for(let i=0;i<200000;i++){const s=p2.stepVblankOnce();const v3=s.voices[3];ticks++;if(v3.outVolume>0)volPos++;if(v3.instrOff>=0||v3.sampleSlot>=0)hasInstr++;const p0=p2.debugVoice(0).position;if(p0>0)st=true;if(st&&p0===0&&pv>0)break;pv=p0;}
console.log(`\nvoice3 over ${ticks} ticks: outVol>0 ${volPos}, hasInstr ${hasInstr}`);
