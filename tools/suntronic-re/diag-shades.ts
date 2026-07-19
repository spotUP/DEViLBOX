/** diag-shades: dump groupStart vs resolved pool for the 75 mismatch rows. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunBlockPool, buildPoolRowIndex } from '../../src/lib/import/formats/sunNativeData';
import { decodeSunGroup } from '../../src/lib/import/formats/sunGroupCodec';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const score: any = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'shades.src'))));
const h1: Uint8Array = score.h1;
const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
const numSampled = score.sampledInstruments.length;
const pool = decodeSunBlockPool(score);
const idx = buildPoolRowIndex(score);
const sub = score.subsongs[0];

// Replicate walkV13Voice for voice=3, position 27 only.
const voice = 3, posIdx = 27;
const entry = sub.entries[posIdx];
const ptr = entry.trackPtrs[voice] >>> 0;
const t = entry.transposes[voice];
const fp = score.blockIndexByOffset.get(ptr) ?? -1;
console.log(`pos27 v3 ptr=${ptr} startBlock=${fp} transpose=${t} rowsPerPosDefault=${score.rowsPerPositionDefault}`);
console.log(`startBlock rowCount=${score.blocks[fp]?.rowCount}`);
let pos = ptr, curInstr = 0, rowsPerPos = score.rowsPerPositionDefault;
for (let r = 0; r < rowsPerPos; r++) {
  const groupStart = pos;
  const walkDec = decodeSunGroup(h1, pos, t, curInstr, numSampled, widths);
  const walkRaw0Dec = decodeSunGroup(h1, groupStart, 0, curInstr, numSampled, widths);
  curInstr = walkDec.curInstr;
  pos = walkDec.nextPos;
  const prov = idx.get(groupStart);
  const poolNote = prov ? pool[prov.blockIndex][prov.rowInBlock].note : -1;
  const expected = poolNote <= 0 ? 0 : sunPitchToNote(poolNote - 13 - t);
  const mism = walkDec.cell.note > 0 && expected !== 0 && expected !== walkDec.cell.note;
  if (r < 25) console.log(
    `row${r} off=${groupStart} walkNote=${walkDec.cell.note} walkRaw0=${walkRaw0Dec.cell.note} ` +
    `prov=${prov ? prov.blockIndex + ':' + prov.rowInBlock : 'none'} poolNote=${poolNote} expected=${expected}` +
    (mism ? '  <<< MISMATCH' : ''));
  // rows cadence mutation
  for (const [eT, eV] of [[walkDec.cell.effTyp, walkDec.cell.eff], [walkDec.cell.effTyp2, walkDec.cell.eff2], [walkDec.cell.effTyp3, walkDec.cell.eff3], [walkDec.cell.effTyp4, walkDec.cell.eff4], [walkDec.cell.effTyp5, walkDec.cell.eff5]] as [number, number][]) {
    if ((eT === 48 || eT === 49) && eV >= 1) rowsPerPos = eV;
  }
}
