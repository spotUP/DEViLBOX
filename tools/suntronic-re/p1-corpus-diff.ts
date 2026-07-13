/**
 * p1-corpus-diff.ts — Probe P1: corpus-wide shift-normalized diff of hunk#1.
 *
 * For every module in the SUNTronicTunes corpus:
 *  1. Parse the hunk structure; classify as V1.3 (2 hunks, hunk0 CODE 436 B,
 *     'DELIRIUM' + '$VER: SunTronic music module' marker) or outlier.
 *  2. Recover the per-module shift delta from hunk#0's absolute pointers into
 *     hunk#1 (the longwords at the hunk0 RELOC32 offsets that target hunk 1),
 *     compared against the reference module (mule.src). Verify the delta is
 *     uniform across all shifted pointers and equals the name-block length
 *     difference.
 *  3. Align every hunk#1 at the shift and emit a per-offset variability map
 *     (in reference/mule coordinates): for each aligned offset, how many
 *     modules differ from the reference byte.
 *  4. Report region boundaries: invariant code region vs per-song data.
 *
 * Usage: npx tsx tools/suntronic-re/p1-corpus-diff.ts [--out report.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CORPUS_DIR,
  listCorpusModules,
  parseHunks,
  u32BE,
  type HunkFile,
} from './suntronicLib';

const REFERENCE = 'mule.src';

interface ModuleInfo {
  name: string;
  hunkFile: HunkFile;
  /** hunk1-relative pointer values stored in hunk0 (relocated into hunk1) */
  hunk1Pointers: number[];
  /**
   * DEVIATION vs plan assumption (verified on corpus): the 7 pointers form TWO
   * delta groups, not one. Group A = the five code entry points
   * (ref h1+0x442/0x1B0/0x304/0x34A/0x414) shift with the name-block length;
   * group B = control word (0xD8A) + instrument table (0xD9E) shift with the
   * name block PLUS a second variable-length region between code and 0xD8A.
   */
  deltaA: number;
  deltaB: number;
  nameBlockEnd: number;
}

function isV13(hf: HunkFile, buf: Uint8Array): boolean {
  if (hf.hunks.length !== 2) return false;
  if (hf.hunks[0].length !== 436) return false;
  const h0 = hf.hunks[0].data;
  // 70FF 4E75 'DELIRIUM'
  if (u32BE(h0, 0) !== 0x70ff4e75) return false;
  const marker = Buffer.from(h0.slice(4, 12)).toString('latin1');
  void buf;
  return marker === 'DELIRIUM';
}

/** hunk0 longwords that RELOC32 says point into hunk1, as hunk1-relative values. */
function hunk1PointersFromHunk0(hf: HunkFile): { off: number; value: number }[] {
  const h0 = hf.hunks[0];
  const offs = h0.reloc32.get(1) ?? [];
  return offs
    .map((off) => ({ off, value: u32BE(h0.data, off) }))
    .sort((a, b) => a.off - b.off);
}

/** End of the instrument-name string block at hunk1+0 (scan to the zero run). */
function nameBlockEnd(h1: Uint8Array): number {
  // strings are null-terminated, block ends when we hit a 0 byte that is
  // followed by only zeros up to the next 16 bytes (start of workspace).
  let pos = 0;
  while (pos < h1.length) {
    if (h1[pos] === 0) {
      let allZero = true;
      for (let i = pos; i < Math.min(pos + 16, h1.length); i++) {
        if (h1[i] !== 0) { allZero = false; break; }
      }
      if (allZero) return pos;
      pos++;
    } else {
      // skip the string
      while (pos < h1.length && h1[pos] !== 0) pos++;
      pos++; // its terminator
    }
  }
  return pos;
}

function main(): void {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;

  const files = listCorpusModules();
  const outliers: { name: string; reason: string }[] = [];
  const mods: ModuleInfo[] = [];

  // ── parse reference first ──
  const refBuf = readFileSync(join(CORPUS_DIR, REFERENCE));
  const refHf = parseHunks(refBuf);
  if (!isV13(refHf, refBuf)) throw new Error('reference is not V1.3?!');
  const refPtrs = hunk1PointersFromHunk0(refHf);
  console.log(`[p1] reference ${REFERENCE}: hunk1 len=${refHf.hunks[1].length}`);
  console.log(
    `[p1] reference hunk0->hunk1 pointers: ${refPtrs
      .map((p) => `h0+0x${p.off.toString(16)}->h1+0x${p.value.toString(16)}`)
      .join(', ')}`,
  );

  for (const name of files) {
    const buf = readFileSync(join(CORPUS_DIR, name));
    let hf: HunkFile;
    try {
      hf = parseHunks(buf);
    } catch (err) {
      outliers.push({ name, reason: `hunk parse: ${(err as Error).message}` });
      continue;
    }
    if (!isV13(hf, buf)) {
      outliers.push({ name, reason: 'not V1.3 2-hunk DELIRIUM layout' });
      continue;
    }
    const ptrs = hunk1PointersFromHunk0(hf);
    if (ptrs.length !== refPtrs.length) {
      outliers.push({ name, reason: `pointer count ${ptrs.length} != ${refPtrs.length}` });
      continue;
    }
    // TWO delta groups: A = code entry points, B = 0xD8A/0xD9E table pointers.
    // Group membership by reference pointer value.
    const GROUP_B_REF = new Set([0xd8a, 0xd9e]);
    const deltas = ptrs.map((p, i) => p.value - refPtrs[i].value);
    const groupA = deltas.filter((_, i) => !GROUP_B_REF.has(refPtrs[i].value));
    const groupB = deltas.filter((_, i) => GROUP_B_REF.has(refPtrs[i].value));
    const uniqA = [...new Set(groupA)];
    const uniqB = [...new Set(groupB)];
    if (uniqA.length !== 1 || uniqB.length !== 1) {
      outliers.push({ name, reason: `non-uniform group deltas ${JSON.stringify(deltas)}` });
      continue;
    }
    const nbe = nameBlockEnd(hf.hunks[1].data);
    mods.push({
      name,
      hunkFile: hf,
      hunk1Pointers: ptrs.map((p) => p.value),
      deltaA: uniqA[0],
      deltaB: uniqB[0],
      nameBlockEnd: nbe,
    });
  }

  console.log(`[p1] V1.3 modules: ${mods.length}, outliers: ${outliers.length}`);
  for (const o of outliers) console.log(`[p1]   outlier: ${o.name} (${o.reason})`);

  // verify deltaA tracks the nameBlock length difference (research claim)
  const refNbe = nameBlockEnd(refHf.hunks[1].data);
  let deltaMismatches = 0;
  for (const m of mods) {
    // name block is padded — compare against even/rounded diffs loosely
    const nbDiff = m.nameBlockEnd - refNbe;
    if (Math.abs(nbDiff - m.deltaA) > 16) deltaMismatches++;
  }
  console.log(
    `[p1] deltaA vs name-block-length-diff mismatches (>16B): ${deltaMismatches}/${mods.length}`,
  );
  const gapStats = mods.map((m) => m.deltaB - m.deltaA);
  console.log(
    `[p1] deltaB-deltaA (second variable region size diff): min=${Math.min(...gapStats)} max=${Math.max(...gapStats)} distinct=${new Set(gapStats).size}`,
  );

  // ── variability map in reference coordinates ──
  // Alignment: ref offsets < 0xD8A use deltaA (code segment anchored at the
  // entry points); ref offsets >= 0xD8A use deltaB (table segment).
  const SEAM = 0xd8a;
  const refH1 = refHf.hunks[1].data;
  const refLen = refH1.length;
  const diffCount = new Uint16Array(refLen); // per ref offset, #modules differing
  const validCount = new Uint16Array(refLen); // #modules where offset in range
  for (const m of mods) {
    if (m.name === REFERENCE) continue;
    const h1 = m.hunkFile.hunks[1].data;
    for (let refOff = 0; refOff < refLen; refOff++) {
      const delta = refOff < SEAM ? m.deltaA : m.deltaB;
      const off = refOff + delta;
      if (off < 0 || off >= h1.length) continue;
      // do not let segment A sample bytes past its own segment end in the module
      if (refOff < SEAM && off >= SEAM + m.deltaB) continue;
      validCount[refOff]++;
      if (h1[off] !== refH1[refOff]) diffCount[refOff]++;
    }
  }

  // region report: classify each offset invariant (diff <5% of valid) / variable
  const INVAR_FRAC = 0.05;
  interface Region { start: number; end: number; kind: 'invariant' | 'variable'; }
  const regions: Region[] = [];
  let cur: Region | null = null;
  for (let off = 0; off < refLen; off++) {
    const kind: Region['kind'] =
      validCount[off] > 0 && diffCount[off] / validCount[off] <= INVAR_FRAC
        ? 'invariant'
        : 'variable';
    if (cur && cur.kind === kind) { cur.end = off + 1; }
    else { if (cur) regions.push(cur); cur = { start: off, end: off + 1, kind }; }
  }
  if (cur) regions.push(cur);

  // merge tiny islands (<8 bytes) into neighbours for readability
  const merged: Region[] = [];
  for (const r of regions) {
    const prev = merged[merged.length - 1];
    if (prev && (r.end - r.start < 8 || prev.kind === r.kind)) {
      if (prev.kind !== r.kind && r.end - r.start >= 8) { merged.push({ ...r }); continue; }
      prev.end = r.end;
    } else merged.push({ ...r });
  }

  console.log('\n[p1] hunk#1 region map (reference/mule coordinates, merged <8B islands):');
  for (const r of merged) {
    console.log(
      `  0x${r.start.toString(16).padStart(5, '0')}-0x${r.end
        .toString(16)
        .padStart(5, '0')} (${(r.end - r.start).toString().padStart(6)} B) ${r.kind}`,
    );
  }

  // hunk1's own RELOC32 (self-relocs) — landmark table pointers
  const selfRelocs = (refHf.hunks[1].reloc32.get(1) ?? []).sort((a, b) => a - b);
  console.log(`\n[p1] reference hunk#1 self-RELOC32 count: ${selfRelocs.length}`);
  console.log(
    `[p1] first 40: ${selfRelocs.slice(0, 40).map((o) => '0x' + o.toString(16)).join(' ')}`,
  );
  const relocTargets = selfRelocs.map((o) => u32BE(refH1, o));
  console.log(
    `[p1] reloc target values (first 40): ${relocTargets
      .slice(0, 40)
      .map((v) => '0x' + v.toString(16))
      .join(' ')}`,
  );

  if (outPath) {
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          reference: REFERENCE,
          refHunk1Len: refLen,
          refNameBlockEnd: refNbe,
          moduleCount: mods.length,
          outliers,
          modules: mods.map((m) => ({
            name: m.name,
            deltaA: m.deltaA,
            deltaB: m.deltaB,
            hunk1Len: m.hunkFile.hunks[1].length,
            nameBlockEnd: m.nameBlockEnd,
            pointers: m.hunk1Pointers,
          })),
          regions: merged,
          selfRelocs,
          relocTargets,
          diffCount: Array.from(diffCount),
          validCount: Array.from(validCount),
        },
        null,
        1,
      ),
    );
    console.log(`[p1] report written: ${outPath}`);
  }
}

main();
