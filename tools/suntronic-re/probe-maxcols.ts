import { readFileSync, readdirSync, statSync } from 'fs';
import { parseSunTronicV13Score, sunCommandLen } from '../../src/lib/import/formats/SunTronicV13';

const dir = '/Users/spot/Code/DEViLBOX/public/data/songs/SUNTronicTunes';
const files = readdirSync(dir).filter(f => {
  const p = `${dir}/${f}`;
  try { return statSync(p).isFile(); } catch { return false; }
});

let globalMax = 0;
let globalMaxFile = '';
const perFileMax: { f: string; max: number }[] = [];
const histogram: Record<number, number> = {}; // opcodes-per-group -> group count

for (const f of files) {
  let score;
  try { score = parseSunTronicV13Score(new Uint8Array(readFileSync(`${dir}/${f}`))); }
  catch { continue; }
  const h1 = score.h1;
  const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
  let fileMax = 0;
  // walk every distinct block offset referenced by any position/voice
  const seen = new Set<number>();
  for (const sub of score.subsongs) {
    for (const entry of sub.entries) {
      for (const ptr of entry.trackPtrs) {
        if (!score.blockIndexByOffset.has(ptr) || seen.has(ptr)) continue;
        seen.add(ptr);
        let pos = ptr;
        let ctrl = 0;
        for (let guard = 0; guard < 100000 && pos < h1.length; guard++) {
          const b = h1[pos];
          const len = sunCommandLen(h1, pos, widths);
          if (b === 0x00) { // end of group
            histogram[ctrl] = (histogram[ctrl] ?? 0) + 1;
            if (ctrl > fileMax) fileMax = ctrl;
            ctrl = 0;
            pos += len;
            // heuristic stop: two consecutive 0x00 or leaving block — walk a bounded run
            continue;
          }
          if (b >= 0x8b && b <= 0x9c) ctrl++; // control opcode
          pos += len;
          // stop if we wander into another block's start
          if (score.blockIndexByOffset.has(pos) && pos !== ptr && seen.has(pos)) break;
        }
      }
    }
  }
  perFileMax.push({ f, max: fileMax });
  if (fileMax > globalMax) { globalMax = fileMax; globalMaxFile = f; }
}

console.log('GLOBAL MAX control-opcodes in one group:', globalMax, '  (file:', globalMaxFile + ')');
console.log('\nhistogram (ctrlOpcodesPerGroup : #groups):');
for (const k of Object.keys(histogram).map(Number).sort((a, b) => a - b)) {
  console.log(`  ${k}: ${histogram[k]}`);
}
console.log('\ntop files by max:');
perFileMax.sort((a, b) => b.max - a.max).slice(0, 12).forEach(x => console.log(`  ${x.max}  ${x.f}`));
