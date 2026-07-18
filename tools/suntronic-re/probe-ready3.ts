import { readFileSync } from 'fs';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const path='/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/ready';
const ab = readFileSync(path);
const buffer = ab.buffer.slice(ab.byteOffset, ab.byteOffset+ab.byteLength);
const song:any = parseSunTronicFile(buffer as ArrayBuffer, 'ready.src');
// Build production note-cell key set: voice:absRow (absRow = pattern*64 + row)
const prodKeys = new Set<string>();
let prodNotes=0;
song.patterns.forEach((pat:any, p:number)=>{
  pat.channels.forEach((ch:any, v:number)=>{
    ch.rows.forEach((cell:any, r:number)=>{
      if(cell && cell.note && cell.note!==0){ prodKeys.add(`${v}:${p*64+r}`); prodNotes++; }
    });
  });
});
console.log('production note cells:', prodNotes, 'patterns:', song.patterns.length);
// Player fires: absRow = position*RPP + (tempoNote-1). ready RPP=16 constant.
const s:any = parseSunTronicV13Score(new Uint8Array(buffer));
const RPP = s.rowsPerPositionDefault;
const p:any = new SunTronicPlayer(s);
let ghosts=0, fires=0; const ex:string[]=[];
p.rowRecorder=(ch:number,position:number,row:number)=>{ fires++; const abs=position*RPP+(row-1); const k=`${ch}:${abs}`; if(!prodKeys.has(k)){ghosts++; if(ex.length<30)ex.push(`v${ch}@abs${abs}(pos${position},t${row})`);} };
let started=false,prev=0;
for(let t=0;t<80000;t++){ p.stepVblankOnce(); const p0=p.debugVoice(0).position; if(p0>0)started=true; if(started&&p0===0&&prev>0)break; prev=p0; }
console.log('player fires:', fires, 'GHOSTS (played, no production cell):', ghosts);
console.log(ex.join('  '));
