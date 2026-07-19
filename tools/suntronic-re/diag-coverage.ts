import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = readdirSync(CORPUS).filter(f => /\.(src|sun|tsm|pc)$/i.test(f) || f === 'ready');
let totalUnprov = 0, totalMismatch = 0, dirty = 0;
for (const f of files) {
  try {
    const buf = readFileSync(join(CORPUS, f));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const song: any = parseSunTronicFile(ab, f);
    const native = song.sunTronicNative;
    if (!native) continue;
    let unprov = 0, mismatch = 0;
    for (const pat of song.patterns) for (let ch=0; ch<4; ch++) for (const cell of pat.channels[ch].rows) {
      if (!cell || !cell.note || cell.note <= 0) continue;
      const bi = cell.sunBlockIndex, ri = cell.sunRowInBlock, pos = cell.sunPosition;
      if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) { unprov++; continue; }
      const block = native.blocks[bi];
      if (!block || ri >= block.length) { unprov++; continue; }
      const poolNote = block[ri].note;
      const t = native.positions[pos].transpose[ch];
      const expect = poolNote === 0 ? 0 : Math.min(96, Math.max(1, poolNote - t));
      if (expect !== cell.note) mismatch++;
    }
    if (unprov || mismatch) { dirty++; console.log(`${f}: ${unprov} unprovenanced-notes, ${mismatch} pool-mismatch`); }
    totalUnprov += unprov; totalMismatch += mismatch;
  } catch(e:any) { console.log(`${f}: ERR ${e.message}`); }
}
console.log(`\n${dirty} dirty files; ${totalUnprov} unprovenanced notes, ${totalMismatch} pool mismatches`);
