import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunGroup } from '../../src/lib/import/formats/sunGroupCodec';
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/analgestic2.src');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const score: any = parseSunTronicV13Score(new Uint8Array(ab));
const h1 = score.h1; const sub = score.subsongs[0];
const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
const numSampled = score.sampledInstruments.length;
const voice = 1;
let rowsPerPos = score.rowsPerPositionDefault; let curInstr = 0; let absRow = 0;
sub.entries.forEach((entry:any, posIdx:number) => {
  const ptr = entry.trackPtrs[voice]; const transpose = entry.transposes[voice];
  const fp = score.blockIndexByOffset.get(ptr) ?? -1;
  if (fp < 0 || ptr >= h1.length) { for(let r=0;r<rowsPerPos;r++){absRow++;} if(posIdx>=79&&posIdx<=83)console.log(`pos${posIdx}: INVALID ptr, ${rowsPerPos} empty`); return; }
  let pos = ptr; const notes:number[]=[]; const stampedRows:number[]=[];
  const rowCount = score.blocks[fp].rowCount;
  for (let r=0;r<rowsPerPos;r++){
    const d = decodeSunGroup(h1,pos,transpose,curInstr,numSampled,widths); curInstr=d.curInstr; pos=d.nextPos;
    for (const [et,ev] of [[d.cell.effTyp,d.cell.eff],[d.cell.effTyp2,d.cell.eff2],[d.cell.effTyp3,d.cell.eff3],[d.cell.effTyp4,d.cell.eff4],[d.cell.effTyp5,d.cell.eff5]] as any) if((et===48||et===49)&&ev>=1) rowsPerPos=ev;
    notes.push(d.cell.note||0);
    if (fp>=0 && r<rowCount) stampedRows.push(r);
    absRow++;
  }
  if(posIdx>=79&&posIdx<=83) console.log(`pos${posIdx}: rowsPerPos=${rowsPerPos} blockRowCount=${rowCount} emitted=${notes.length} notes=[${notes.join(',')}] stampedRows=[${stampedRows.join(',')}]`);
});
