/**
 * probe-reproject-corpus.ts — corpus-wide reproject-identity drift + sign check.
 * For every provenanced cell, checks reprojectSunGrid(unchanged pool) == identity,
 * and separately whether before == poolNote-transpose vs poolNote+transpose.
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-reproject-corpus.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { reprojectSunGrid } from '../../src/lib/import/formats/sunReproject';

const CORPUS = 'public/data/songs/formats/SUNTronicTunes';

let files = 0, filesWithDrift = 0, totalProvd = 0, totalChanged = 0;
let matchMinus = 0, matchPlus = 0, matchNeither = 0, glideCells = 0, glideNeither = 0;

for (const song of readdirSync(CORPUS).filter(f => f.endsWith('.src'))) {
  let ts;
  try {
    const buf = readFileSync(`${CORPUS}/${song}`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    ts = parseSunTronicFile(ab, song);
  } catch { continue; }
  const native = ts.sunTronicNative;
  if (!native) continue;
  files++;

  interface S { pi: number; ch: number; r: number; before: number; poolNote: number; transpose: number; glide: boolean; }
  const snaps: S[] = [];
  for (let pi = 0; pi < ts.patterns.length; pi++) {
    const pat = ts.patterns[pi];
    for (let ch = 0; ch < pat.channels.length; ch++) {
      const rows = pat.channels[ch].rows;
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r];
        const bi = c.sunBlockIndex, ri = c.sunRowInBlock, pos = c.sunPosition;
        if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) continue;
        if (bi >= native.blocks.length || pos >= native.positions.length) continue;
        if (ri >= native.blocks[bi].length) continue;
        const transpose = native.positions[pos].transpose[ch as 0 | 1 | 2 | 3];
        const poolNote = native.blocks[bi][ri].note ?? 0;
        const glide = [c.effTyp, c.effTyp2, c.effTyp3, c.effTyp4, c.effTyp5].some(e => e === 3);
        snaps.push({ pi, ch, r, before: c.note ?? 0, poolNote, transpose, glide });
      }
    }
  }

  // Per-file sign diagnostic (before reproject mutates the grid).
  let fNonzeroT = 0, fSignDiffer = 0, fMinus = 0, fPlus = 0, fNeither = 0;
  for (const s of snaps) {
    if (s.before > 0 && s.poolNote > 0) {
      if (s.transpose !== 0) fNonzeroT++;
      const cm = clamp(s.poolNote - s.transpose), cp = clamp(s.poolNote + s.transpose);
      if (cm !== cp) fSignDiffer++;
      if (s.before === cm) fMinus++; else if (s.before === cp) fPlus++; else fNeither++;
    }
  }

  reprojectSunGrid(ts.patterns, native);

  let changed = 0;
  for (const s of snaps) {
    const after = ts.patterns[s.pi].channels[s.ch].rows[s.r].note ?? 0;
    if (after !== s.before) changed++;
    // Non-rest sign analysis: does before match the linear model at all?
    if (s.before > 0 && s.poolNote > 0) {
      const clampM = clamp(s.poolNote - s.transpose);
      const clampP = clamp(s.poolNote + s.transpose);
      if (s.before === clampM) matchMinus++;
      else if (s.before === clampP) matchPlus++;
      else matchNeither++;
      if (s.glide) {
        glideCells++;
        if (s.before !== clampM && s.before !== clampP) glideNeither++;
      }
    }
  }
  totalProvd += snaps.length;
  totalChanged += changed;
  if (changed > 0) filesWithDrift++;
  if (changed > 0 || fNonzeroT > 0) {
    console.log(`  [${song}] nonrest-nonzeroT=${fNonzeroT} signWouldDiffer=${fSignDiffer} match(-)=${fMinus} match(+)=${fPlus} neither=${fNeither} reprojChanged=${changed}`);
  }
}

function clamp(n: number): number { return n <= 0 ? 0 : n > 96 ? 96 : n; }

console.log(`files parsed:            ${files}`);
console.log(`files with reproject drift: ${filesWithDrift}`);
console.log(`total provenanced cells: ${totalProvd}`);
console.log(`cells changed by reproject(unchanged pool): ${totalChanged}  (${(100*totalChanged/totalProvd).toFixed(1)}%)`);
console.log(`--- sign model on non-rest cells (before vs linear model) ---`);
console.log(`before == clamp(pool - transpose):  ${matchMinus}`);
console.log(`before == clamp(pool + transpose):  ${matchPlus}`);
console.log(`before == NEITHER:                  ${matchNeither}`);
console.log(`--- glide cells (effTyp-3 present) ---`);
console.log(`glide non-rest cells:               ${glideCells}`);
console.log(`glide cells matching NEITHER linear model: ${glideNeither}`);
