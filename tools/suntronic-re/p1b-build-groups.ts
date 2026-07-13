/**
 * p1b-build-groups.ts — P1 addendum: group modules by replayer build.
 *
 * P1 found the code between hunk1+0x8BE and the 0xD8A control word varies in
 * BOTH content and length (deltaB-deltaA has 3 distinct values). Hypothesis:
 * a small number of replayer builds exist in the corpus; within one build
 * group the entire non-score portion of hunk#1 (code + static tables) is
 * byte-identical after removing the name block.
 *
 * Check: key each module by sha1 of hunk1[codeStart .. subsongTable) where
 * codeStart = 0x1B0+deltaA and subsongTable = 0xD9E+deltaB, PLUS the segment
 * [instrTableEnd .. scoreStart) — here approximated as [0xDA2+deltaB ..
 * 0x1552+deltaB) (workspace + static tables, ends at the synth instrument
 * table in reference coords; per-module score start shifts identically).
 *
 * Usage: npx tsx tools/suntronic-re/p1b-build-groups.ts
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, listCorpusModules, parseHunks, u32BE } from './suntronicLib';

function main(): void {
  const groups = new Map<string, string[]>();
  for (const name of listCorpusModules()) {
    const buf = readFileSync(join(CORPUS_DIR, name));
    const hf = parseHunks(buf);
    const h0 = hf.hunks[0];
    const h1 = hf.hunks[1].data;
    const ptrs = (h0.reloc32.get(1) ?? [])
      .map((off) => u32BE(h0.data, off))
      .sort((a, b) => a - b);
    const deltaA = ptrs[0] - 0x1b0;
    const deltaB = ptrs[6] - 0xd9e;
    const codeStart = 0x1b0 + deltaA;
    const subsongTable = 0xd9e + deltaB;
    // exclude the subsong table itself (per-song values); include everything
    // from code start to the 0xD8A control word, then workspace+tables after
    // the (null-terminated) subsong table up to the score.
    const ctrl = 0xd8a + deltaB;
    let tblEnd = subsongTable;
    while (u32BE(h1, tblEnd) !== 0) tblEnd += 4;
    tblEnd += 4;
    const scoreStart = 0x1552 + deltaB;
    const hash = createHash('sha1')
      .update(h1.slice(codeStart, ctrl))
      .update(h1.slice(tblEnd, Math.min(scoreStart, h1.length)))
      .digest('hex')
      .slice(0, 12);
    const key = `${hash} gap=${deltaB - deltaA} codeLen=${ctrl - codeStart}`;
    const arr = groups.get(key) ?? [];
    arr.push(name);
    groups.set(key, arr);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`[p1b] ${sorted.length} distinct replayer builds across ${listCorpusModules().length} modules:`);
  for (const [key, names] of sorted) {
    const sample = names.slice(0, 4).join(', ');
    console.log(`  ${key}: ${names.length} modules (${sample}${names.length > 4 ? ', …' : ''})`);
  }
}

main();
