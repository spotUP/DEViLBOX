/**
 * probe-reproject-roundtrip.ts — prove reprojectSunGrid is NOT a faithful
 * inverse of the walkV13Voice display decode.
 *
 * Invariant under test: reprojectSunGrid(patterns, native) on the UNCHANGED
 * pool must be identity on every provenanced cell's .note. Any cell whose note
 * changes is a reproject drift bug.
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-reproject-roundtrip.ts [song.src]
 */
import { readFileSync } from 'fs';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { reprojectSunGrid } from '../../src/lib/import/formats/sunReproject';

const CORPUS = 'public/data/songs/formats/SUNTronicTunes';

function run(song: string): { total: number; provd: number; changed: number; examples: string[] } {
  const buf = readFileSync(`${CORPUS}/${song}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const trackerSong = parseSunTronicFile(ab, song);
  const native = trackerSong.sunTronicNative!;
  const patterns = trackerSong.patterns;

  // Snapshot pre-reproject notes + provenance per (pattern,ch,row).
  interface Snap { pi: number; ch: number; r: number; before: number; bi: number; ri: number; pos: number; transpose: number; poolNote: number; }
  const snaps: Snap[] = [];
  for (let pi = 0; pi < patterns.length; pi++) {
    const pat = patterns[pi];
    for (let ch = 0; ch < pat.channels.length; ch++) {
      const rows = pat.channels[ch].rows;
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r];
        const bi = c.sunBlockIndex, ri = c.sunRowInBlock, pos = c.sunPosition;
        if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) continue;
        if (bi >= native.blocks.length || pos >= native.positions.length) continue;
        if (ri >= native.blocks[bi].length) continue;
        snaps.push({
          pi, ch, r,
          before: c.note ?? 0,
          bi, ri, pos,
          transpose: native.positions[pos].transpose[ch as 0 | 1 | 2 | 3],
          poolNote: native.blocks[bi][ri].note ?? 0,
        });
      }
    }
  }

  // Reproject the UNCHANGED pool.
  reprojectSunGrid(patterns, native);

  let changed = 0;
  const examples: string[] = [];
  for (const s of snaps) {
    const after = patterns[s.pi].channels[s.ch].rows[s.r].note ?? 0;
    if (after !== s.before) {
      changed++;
      if (examples.length < 12) {
        const c = patterns[s.pi].channels[s.ch].rows[s.r];
        // Detect whether this cell was a glide (effTyp-3 carrier present).
        const glide = [c.effTyp, c.effTyp2, c.effTyp3, c.effTyp4, c.effTyp5].some(e => e === 3);
        examples.push(
          `  pat${s.pi} ch${s.ch} r${s.r}  before=${s.before} after=${after}` +
          `  pool=${s.poolNote} transpose=${s.transpose}` +
          `  (poolNote+T=${s.poolNote + s.transpose}, poolNote-T=${s.poolNote - s.transpose})` +
          (glide ? '  [GLIDE effTyp3]' : ''),
        );
      }
    }
  }
  return { total: snaps.length, provd: snaps.length, changed, examples };
}

const songs = process.argv.slice(2);
if (songs.length === 0) songs.push('shades.src');

for (const song of songs) {
  try {
    const { provd, changed, examples } = run(song);
    console.log(`\n=== ${song} ===`);
    console.log(`provenanced cells: ${provd}   changed by reproject(unchanged pool): ${changed}`);
    if (changed > 0) {
      console.log(`examples (before → after; correct answer = "before"):`);
      for (const e of examples) console.log(e);
    }
  } catch (e) {
    console.log(`\n=== ${song} ===  ERROR: ${(e as Error).message}`);
  }
}
