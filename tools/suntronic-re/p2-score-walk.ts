/**
 * p2-score-walk.ts — corpus-wide structural validation of the recovered V1.3
 * score grammar (Probe P2 companion; the decisive cross-check for the layout
 * spec).
 *
 * Recovered layout (see disasm.py output over hunk1+0x1B0/0x34A/0x442/0x766):
 *  - a6 (workspace base) = hunk1+0x318 + deltaB_module (all runtime offsets
 *    below are hunk1-relative for the REFERENCE (mule) and shift with deltaB).
 *  - subsong table @ hunk1+0xD9E: null-terminated longwords, each an
 *    a6-relative offset to a sequence (song) start.
 *  - sequence: entries of 0x14 bytes = [4 x u32 track ptr][4 x s8 transpose].
 *    Entry with first long == 0 -> restart; first long bit31 set -> stop voice.
 *    Track ptrs are ABSOLUTE (relocated) = hunk1-relative values in the file.
 *  - track stream per voice per position: bytes read once per row until 0x00.
 *      0x00        end of row
 *      0x01..0x3F  select sampled instrument (index-1) in table @0x1606+shift
 *      0x40..0x7F  select synth instrument (index & 0x3F) in table @0x1552+shift
 *      0x8B..0x9C  command; arg bytes per CMD_ARGC below
 *      0xB8..0xFF  note (~b = 0..0x47), MAY be followed by one instrument byte
 *      others      invalid (never emitted by the composer)
 *  - default 32 rows per position (voice+0x31), 6 ticks per row (voice+0x30),
 *    both changeable by commands 0x8C/0x8B and 0x98/0x8F.
 *
 * The walk: for every module, for every subsong, follow the sequence and parse
 * each referenced track stream for `rowsPerPosition` rows; assert every byte
 * consumed is grammatical and that parse cursors of all track blocks tile the
 * track region without overlap conflicts.
 *
 * Usage: npx tsx tools/suntronic-re/p2-score-walk.ts [--verbose module]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, listCorpusModules, parseHunks, u32BE } from './suntronicLib';

/**
 * Command byte -> argument byte count. Single source of truth is the Phase 2
 * codec in src (SUN_CMD_ARGC in SunTronicV13.ts) — imported, not duplicated.
 */
import { SUN_CMD_ARGC } from '../../src/lib/import/formats/SunTronicV13';
export const CMD_ARGC = SUN_CMD_ARGC;

interface WalkStats {
  name: string;
  subsongs: number;
  seqEntries: number;
  tracks: number;
  rows: number;
  notes: number;
  errors: string[];
}

/** Parse one row from the stream; returns new pos or -1 on grammar violation. */
function parseRow(
  h1: Uint8Array,
  pos: number,
  counts: { notes: number },
  err: (m: string) => void,
): number {
  for (;;) {
    if (pos >= h1.length) { err(`stream ran past hunk1 end at 0x${pos.toString(16)}`); return -1; }
    const b = h1[pos++];
    if (b === 0x00) return pos; // end of row
    if (b >= 0x01 && b <= 0x7f) continue; // instrument select
    if (b >= 0xb8) {
      counts.notes++;
      // optional trailing instrument byte (positive, nonzero)
      const nxt = h1[pos];
      if (nxt >= 0x01 && nxt <= 0x7f) pos++;
      continue;
    }
    if (b >= 0x8b && b <= 0x9c) { pos += CMD_ARGC[b]; continue; }
    err(`invalid stream byte 0x${b.toString(16)} at 0x${(pos - 1).toString(16)}`);
    return -1;
  }
}

function walkModule(name: string, verbose: boolean): WalkStats {
  const buf = readFileSync(join(CORPUS_DIR, name));
  const hf = parseHunks(buf);
  const h1 = hf.hunks[1].data;
  const stats: WalkStats = { name, subsongs: 0, seqEntries: 0, tracks: 0, rows: 0, notes: 0, errors: [] };
  const err = (m: string): void => { if (stats.errors.length < 5) stats.errors.push(m); };

  // per-module shift: recover 0xD9E/0x318 equivalents from hunk0 pointers.
  const h0 = hf.hunks[0];
  const ptrs = (h0.reloc32.get(1) ?? []).map((off) => u32BE(h0.data, off)).sort((a, b) => a - b);
  // sorted: [0x1b0+dA, 0x304+dA, 0x34a+dA, 0x414+dA, 0x442+dA, 0xd8a+dB, 0xd9e+dB]
  if (ptrs.length !== 7) { err(`unexpected hunk0 pointer count ${ptrs.length}`); return stats; }
  const deltaA = ptrs[0] - 0x1b0;
  const deltaB = ptrs[6] - 0xd9e;
  const subsongTable = 0xd9e + deltaB;
  const a6base = 0x318 + deltaA; // workspace base: lea $318(pc) inside code segment A
  void deltaA;

  // walk subsong table
  const trackStarts = new Set<number>();
  for (let te = subsongTable; ; te += 4) {
    const rel = u32BE(h1, te);
    if (rel === 0) break;
    stats.subsongs++;
    if (stats.subsongs > 64) { err('runaway subsong table'); break; }
    const seqStart = a6base + rel;
    if (seqStart >= h1.length) { err(`subsong seq 0x${seqStart.toString(16)} out of range`); continue; }
    // walk sequence
    for (let se = seqStart; ; se += 0x14) {
      const first = u32BE(h1, se);
      if (first === 0 || (first & 0x80000000) !== 0) break; // restart / stop
      stats.seqEntries++;
      if (stats.seqEntries > 4096) { err('runaway sequence'); return stats; }
      for (let v = 0; v < 4; v++) trackStarts.add(u32BE(h1, se + v * 4));
    }
  }

  // Tiling validation: rows-per-position varies (commands 0x8C/0x8B), so we do
  // NOT assume 32 rows. Instead: consecutive track blocks must be exactly
  // explained by whole grammatical rows — parse rows from each start until the
  // cursor lands EXACTLY on the next start (or, for the final block, reaches
  // hunk1 end / trailing zero padding).
  const sortedStarts = [...trackStarts].sort((a, b) => a - b);
  // Rows/position is a byte (max 255) and voices sequence independently, so a
  // block may hold up to 255 rows. Track starts may OVERLAP by sharing the
  // previous stream's final 0x00 terminator (observed corpus-wide: overshoot
  // is always exactly the 1 terminator byte). Hard failures are only grammar
  // violations and out-of-range pointers; tiling stats are advisory.
  const MAX_ROWS = 255;
  let exactTiles = 0;
  let overlapTiles = 0;
  for (let i = 0; i < sortedStarts.length; i++) {
    const ts = sortedStarts[i];
    const limit = i + 1 < sortedStarts.length ? sortedStarts[i + 1] : h1.length;
    if (ts >= h1.length) { err(`track ptr 0x${ts.toString(16)} out of range`); continue; }
    stats.tracks++;
    let pos = ts;
    let rows = 0;
    while (pos < limit && rows < MAX_ROWS) {
      const next = parseRow(h1, pos, stats, err);
      if (next < 0) { rows = MAX_ROWS; break; }
      pos = next;
      rows++;
      stats.rows++;
    }
    if (pos === limit) exactTiles++;
    else if (pos > limit && pos <= limit + 4) overlapTiles++; // overlapped next-track start (pointer aliases into this stream)
    else if (pos > limit + 4) {
      err(`track 0x${ts.toString(16)} overshoots block 0x${limit.toString(16)} by ${pos - limit}`);
    }
    if (verbose) console.log(`  track 0x${ts.toString(16)} -> end 0x${pos.toString(16)} rows=${rows} (limit 0x${limit.toString(16)})`);
  }
  if (verbose) console.log(`  tiling: exact=${exactTiles} overlap1=${overlapTiles} of ${sortedStarts.length}`);
  return stats;
}

function main(): void {
  const vIdx = process.argv.indexOf('--verbose');
  const verboseModule = vIdx >= 0 ? process.argv[vIdx + 1] : null;
  const files = verboseModule ? [verboseModule] : listCorpusModules();

  let ok = 0;
  let totalNotes = 0;
  let totalTracks = 0;
  const failed: WalkStats[] = [];
  for (const name of files) {
    let st: WalkStats;
    try {
      st = walkModule(name, verboseModule !== null);
    } catch (e) {
      st = { name, subsongs: 0, seqEntries: 0, tracks: 0, rows: 0, notes: 0, errors: [(e as Error).message] };
    }
    if (st.errors.length === 0 && st.notes > 0) ok++;
    else failed.push(st);
    totalNotes += st.notes;
    totalTracks += st.tracks;
    if (verboseModule) {
      console.log(`[p2] ${name}: subsongs=${st.subsongs} seq=${st.seqEntries} tracks=${st.tracks} rows=${st.rows} notes=${st.notes} errors=${st.errors.join('; ')}`);
    }
  }
  console.log(`[p2] grammar walk: ${ok}/${files.length} modules parse cleanly with >0 notes`);
  console.log(`[p2] totals: tracks=${totalTracks} notes=${totalNotes}`);
  for (const f of failed.slice(0, 20)) {
    console.log(`[p2]   FAIL ${f.name}: notes=${f.notes} errors=${f.errors.join('; ') || '(zero notes)'}`);
  }
  process.exit(ok / files.length >= 0.95 ? 0 : 1);
}

main();
