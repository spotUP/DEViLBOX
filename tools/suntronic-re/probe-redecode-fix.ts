/**
 * probe-redecode-fix.ts — prove the ROOT-FIX abstraction: re-decoding the pool
 * cell's sunRaw at the position transpose reproduces the display note EXACTLY,
 * including the non-linear glide/clamp-to-zero cells that no linear pool±T model
 * can express. Corpus-wide identity check.
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-redecode-fix.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunGroup } from '../../src/lib/import/formats/sunGroupCodec';

const CORPUS='public/data/songs/formats/SUNTronicTunes';
let cells=0, linearOk=0, redecodeOk=0, redecodeBad=0, glideNonlinear=0;

for (const song of readdirSync(CORPUS).filter(f=>f.endsWith('.src'))) {
  let ts, score;
  try {
    const buf=readFileSync(CORPUS+'/'+song);
    const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
    ts=parseSunTronicFile(ab,song);
    score=parseSunTronicV13Score(new Uint8Array(ab));
  } catch { continue; }
  const nat=ts.sunTronicNative; if(!nat) continue;
  const widths={arpShift:score.arpShift, volSlideRateFromStream:score.volSlideRateFromStream};
  const numSampled=score.sampledInstruments.length;
  const clamp=(n:number)=>n<=0?0:n>96?96:n;

  for (let pi=0; pi<ts.patterns.length; pi++) for (let ch=0; ch<4; ch++) {
    const rows=ts.patterns[pi].channels[ch].rows;
    for (const c of rows) {
      const bi=c.sunBlockIndex, ri=c.sunRowInBlock, pos=c.sunPosition;
      if (bi===undefined||bi<0||ri===undefined||pos===undefined) continue;
      if (bi>=nat.blocks.length||pos>=nat.positions.length||ri>=nat.blocks[bi].length) continue;
      const before=c.note ?? 0;
      const poolCell:any = nat.blocks[bi][ri];
      const pool = poolCell.note ?? 0;
      const T = nat.positions[pos].transpose[ch as 0|1|2|3];
      cells++;
      // linear model
      const linear = pool===0 ? 0 : clamp(pool - T);
      if (linear === before) linearOk++;
      // root-fix: re-decode poolCell.sunRaw at this transpose
      const raw = new Uint8Array(poolCell.sunRaw ?? []);
      // curInstr threading matters for instrument, not note; pass 0 for note check.
      const redecoded = decodeSunGroup(raw, 0, T, 0, numSampled, widths, raw.length).cell;
      if ((redecoded.note ?? 0) === before) redecodeOk++;
      else { redecodeBad++; if (redecodeBad<=5) console.log(`  BAD ${song} pat${pi}ch${ch} before=${before} redec=${redecoded.note} pool=${pool} T=${T} raw=${[...raw].map(b=>b.toString(16)).join(' ')}`); }
      if (linear !== before && (redecoded.note ?? 0) === before) glideNonlinear++;
    }
  }
}
console.log(`cells=${cells}`);
console.log(`linear (pool-T) matches display: ${linearOk}  (${(100*linearOk/cells).toFixed(3)}%)`);
console.log(`re-decode sunRaw matches display: ${redecodeOk}  (${(100*redecodeOk/cells).toFixed(3)}%)`);
console.log(`re-decode MISMATCHES: ${redecodeBad}`);
console.log(`cells where linear FAILS but re-decode SUCCEEDS (the non-linear glide cells the fix rescues): ${glideNonlinear}`);
