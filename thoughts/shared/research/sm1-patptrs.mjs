// Dump parsed patternPtrs and first pattern rows for both files.
import fs from 'fs';

const files = [
  { name: 'myfunnymazea (BROKEN)', path: '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid', position: 4700, trackBase: 0x24, patStart: 0x530, ppBase: 0x171a, ppEnd: 0x1786 },
  { name: 'defjam        (WORKS)', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid', position: 4700, trackBase: 0x24, patStart: 0x4e8, ppBase: 0xce6, ppEnd: 0xd32 },
];

function rd32BE(buf, off) { return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0; }

for (const { name, path, position, trackBase, patStart, ppBase, ppEnd } of files) {
  const buf = fs.readFileSync(path);
  const patternsBase = position + ppBase;
  const patternsCount = (ppEnd - ppBase) >> 2;
  const patRows = Math.floor((position + 0x171a - (position + patStart)) / 5);  // misused for broken

  console.log(`\n━━━ ${name} ━━━`);
  console.log(`  patternsBase=${patternsBase}  patternsCount=${patternsCount}`);
  // Decode pattern pointers like the C code does: +4 skip, /5
  const ptrs = [];
  for (let i = 0; i < patternsCount; i++) {
    const poff = patternsBase + 4 + i * 4;
    if (poff + 4 > buf.length) break;
    const raw = rd32BE(buf, poff);
    const ptr = Math.floor(raw / 5);
    ptrs.push({ i, raw: `0x${raw.toString(16)}`, ptr });
    if (raw === 0 && i > 0) break;
  }
  console.log(`  patternPtrs (first 20): ${ptrs.slice(0, 20).map(p => `[${p.i}]=${p.ptr}`).join(' ')}`);

  // Show the first 8 rows starting at patternPtrs[1] (voice 0's initial pattern for myfunnymazea is pat=1)
  const patDataOffset = position + patStart;
  if (ptrs.length > 1) {
    const startRow = ptrs[1].ptr;
    console.log(`  pattern #1 starts at row ${startRow}; first 8 rows:`);
    for (let r = 0; r < 8; r++) {
      const ri = startRow + r;
      const rbase = patDataOffset + ri * 5;
      if (rbase + 5 > buf.length) break;
      const note = buf[rbase];
      const sample = buf[rbase + 1];
      const effect = buf[rbase + 2];
      const param = buf[rbase + 3];
      const speed = buf[rbase + 4];
      console.log(`    row${ri}: note=${note.toString().padStart(3)} sample=${sample.toString().padStart(3)} effect=${effect.toString().padStart(3)} param=${param.toString().padStart(3)} speed=${speed}`);
    }
  }
}
