import { readFileSync } from 'fs';
import { parseSunTronicV13Score, sunCommandLen, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/ready'));
const s: any = parseSunTronicV13Score(buf);
const h1 = s.h1; const bmap = s.blockIndexByOffset; const sub = s.subsongs[0];
const widths = { arpShift: s.arpShift, volSlideRateFromStream: s.volSlideRateFromStream };
// grid keys (mirror walkV13Voice incl 0x94)
const keys = new Set<string>();
for (let v=0; v<4; v++){
  let rpp = s.rowsPerPositionDefault;
  for (let pi=0; pi<sub.entries.length; pi++){
    const ptr = sub.entries[pi].trackPtrs[v]>>>0; const tr = sub.entries[pi].transposes[v];
    if(!bmap.has(ptr)||ptr>=h1.length) continue;
    let pos=ptr;
    for(let r=0;r<rpp;r++){
      for(;;){ if(pos>=h1.length)break; const b=h1[pos]; const len=sunCommandLen(h1,pos,widths);
        if(b===0x00){pos+=len;break;}
        if(b>=0xb8){ if(sunPitchToNote(((~b)&0xff)-tr)!==0) keys.add(`${v}:${pi}:${r}`); }
        else if(b===0x94){ keys.add(`${v}:${pi}:${r}`); }
        else if(b===0x8c||b===0x8b){ const a=h1[pos+1]; if(a>=1) rpp=a; }
        pos+=len; }
    }
  }
}
const p:any = new SunTronicPlayer(s);
let ghosts=0; const ex:string[]=[];
p.rowRecorder=(ch:number,position:number,row:number)=>{ const k=`${ch}:${position}:${row-1}`; if(!keys.has(k)){ghosts++; if(ex.length<20)ex.push(k);} };
let started=false,prev=0;
for(let t=0;t<60000;t++){ p.stepVblankOnce(); const p0=p.debugVoice(0).position; if(p0>0)started=true; if(started&&p0===0&&prev>0)break; prev=p0; }
console.log('ghosts', ghosts, 'gridKeys', keys.size);
console.log('examples', ex.join(' '));
