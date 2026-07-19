// Definitive display oracle. Player run for 2 loops; audible note per group =
// LAST note-on before terminator; grid compared to player-last trimmed to grid
// length (kills the single-loop wrap-tail artifact). Any residual divergence is
// a real display bug.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const dir = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = process.argv[2] ? [process.argv[2]] : readdirSync(dir).filter(f=>f.endsWith('.src'));
let clean=0,bad=0; const detail:string[]=[];
for (const name of files) {
  let ab:ArrayBuffer; try{const b=readFileSync(join(dir,name));ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}catch{continue;}
  let song:any,score:any; try{song=parseSunTronicFile(ab,name);score=parseSunTronicV13Score(new Uint8Array(ab));}catch{continue;}
  const gridSeq:number[][]=[[],[],[],[]];
  for(const pat of song.patterns)for(let ch=0;ch<4;ch++)for(const cell of pat.channels[ch].rows)if(cell&&cell.note>0)gridSeq[ch].push(cell.note);
  const player:any=new SunTronicPlayer(score);
  const raw:{pos:number,row:number,note:number}[][]=[[],[],[],[]];
  player.rowRecorder=(ch:number,pos:number,row:number,note:number)=>{if(ch>=0&&ch<4)raw[ch].push({pos,row,note:sunPitchToNote(note)});};
  let started=false,prev=0,wraps=0;
  for(let t=0;t<900000;t++){player.stepVblankOnce();const p0=player.debugVoice(0).position;if(p0>0)started=true;if(started&&p0===0&&prev>0){if(++wraps>=2)break;}prev=p0;}
  for(let ch=0;ch<4;ch++){
    const last:number[]=[];
    for(let i=0;i<raw[ch].length;i++){const e=raw[ch][i],n=raw[ch][i+1];if(!n||n.pos!==e.pos||n.row!==e.row){if(e.note>0)last.push(e.note);}}
    const g=gridSeq[ch]; const p=last.slice(0,g.length);
    let i=0;while(i<g.length&&i<p.length&&g[i]===p[i])i++;
    if(i!==g.length||i!==p.length){bad++;detail.push(`${name} ch${ch} div@${i} g${g.length} grid=${g[i]} play=${p[i]}`);}else clean++;
  }
}
console.log(`voices CLEAN ${clean} BAD ${bad}`);
detail.slice(0,40).forEach(d=>console.log(' ',d));
