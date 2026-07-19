/**
 * probe-editability-audit.ts — corpus-wide EDITABILITY audit over the REAL
 * parser output (parseSunTronicFile → walkV13Voice cells), not a reimplemented
 * walk. A note is "editable" iff its displayed grid cell:
 *   (1) carries provenance (sunBlockIndex/sunRowInBlock/sunPosition defined), and
 *   (2) that provenance resolves to the SAME displayed pitch in the pool,
 *       i.e. sunPitchToNote(pool.raw - transpose) === cell.note (clamp-aware).
 * Any noted cell failing either is a "ghost" in the editability sense: the user
 * hears/sees it but an edit cannot round-trip it.
 *
 * Run: npx tsx tools/suntronic-re/probe-editability-audit.ts [file.src]
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const readFixture = (name: string): ArrayBuffer => {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
};

interface Bad { pos: number; ch: number; row: number; cellNote: number; poolRaw: number | null; t: number; kind: string; }

function audit(name: string): { noted: number; unprov: number; mism: number; bads: Bad[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const song: any = parseSunTronicFile(readFixture(name), name);
  const native = song.sunTronicNative;
  let noted = 0, unprov = 0, mism = 0;
  const bads: Bad[] = [];
  for (let pi = 0; pi < song.patterns.length; pi++) {
    const pat = song.patterns[pi];
    for (let ch = 0; ch < 4; ch++) {
      const rows = pat.channels[ch].rows;
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r];
        if (!cell || !cell.note || cell.note <= 0) continue;
        noted++;
        const bi = cell.sunBlockIndex, ri = cell.sunRowInBlock, pos = cell.sunPosition;
        if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) {
          unprov++; bads.push({ pos: pi, ch, row: r, cellNote: cell.note, poolRaw: null, t: 0, kind: 'no-provenance' });
          continue;
        }
        const block = native.blocks[bi];
        if (!block || ri >= block.length) {
          unprov++; bads.push({ pos: pi, ch, row: r, cellNote: cell.note, poolRaw: null, t: 0, kind: 'prov-out-of-range' });
          continue;
        }
        const poolNote: number = block[ri].note; // sunPitchToNote(raw0) = raw0+13, clamped
        const t: number = native.positions[pos]?.transpose[ch] ?? 0;
        // Reconstruct display: raw0 = poolNote-13 (when unclamped); display = sunPitchToNote(raw0 - t).
        const expected = poolNote === 0 ? 0 : sunPitchToNote(poolNote - 13 - t);
        if (expected !== 0 && cell.note !== 0 && expected !== cell.note) {
          mism++; bads.push({ pos: pi, ch, row: r, cellNote: cell.note, poolRaw: poolNote, t, kind: 'pitch-mismatch' });
        }
      }
    }
  }
  return { noted, unprov, mism, bads };
}

const arg = process.argv[2];
if (arg) {
  const { noted, unprov, mism, bads } = audit(arg);
  console.log(`${arg}: noted=${noted} unprovenanced=${unprov} pitch-mismatch=${mism}`);
  for (const b of bads.slice(0, 30)) console.log(`   ${b.kind} pat${b.pos} ch${b.ch} row${b.row} cellNote=${b.cellNote} poolRaw=${b.poolRaw} t=${b.t}`);
} else {
  const files = readdirSync(CORPUS).filter((f) => /\.(src|sun|tsm|pc)$/i.test(f) || f === 'ready');
  let dirty = 0, totU = 0, totM = 0;
  for (const f of files) {
    try {
      const { unprov, mism } = audit(f);
      if (unprov > 0 || mism > 0) { dirty++; totU += unprov; totM += mism; console.log(`${unprov.toString().padStart(5)}u ${mism.toString().padStart(5)}m  ${f}`); }
    } catch (e) { console.log(`ERR ${f}: ${(e as Error).message}`); }
  }
  console.log(`\n${dirty}/${files.length} files dirty; total unprovenanced=${totU} pitch-mismatch=${totM}`);
}
