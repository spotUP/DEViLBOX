/**
 * debug-med-patterns.ts — Show side-by-side pattern data: source MED vs exported MOD
 *
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/debug-med-patterns.ts <file> [patIdx]
 *
 * Exports the source file to MOD, then parses both and shows pattern data
 * side-by-side with differences marked.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseMEDFile } from '../src/lib/import/formats/MEDParser';
import { parseMODFile } from '../src/lib/import/formats/MODParser';
import { exportSongToMOD } from './export-songs-openmpt';

const ROOT = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');

const args = process.argv.slice(2);
const fileArg = args[0] ?? 'funky nightmare.mmd1';
const patFilter = args[1] !== undefined ? parseInt(args[1]) : -1;

const filePath = join(TEST_DIR, fileArg);
const buf = readFileSync(filePath);

console.log(`\nParsing source: ${fileArg}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const src = parseMEDFile(buf.buffer, fileArg) as any;

console.log(`  numChannels: ${src.numChannels}`);
console.log(`  songPositions (first 12): ${JSON.stringify(src.songPositions?.slice(0, 12))}`);
console.log(`  initialSpeed: ${src.initialSpeed}  initialBPM: ${src.initialBPM}`);
console.log(`  patterns: ${src.patterns?.length}`);
console.log(`  instruments: ${src.instruments?.length}`);

// Show instrument list
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (let i = 0; i < (src.instruments?.length ?? 0); i++) {
  const inst = src.instruments[i] as any;
  const ab = inst?.sample?.audioBuffer as ArrayBuffer | undefined;
  const len = ab ? ab.byteLength : 0;
  const loop = inst?.sample?.loop ? `loop ${inst.sample.loopStart}-${inst.sample.loopEnd}` : 'no-loop';
  console.log(`  inst[${i+1}] "${inst?.name}" len=${len} ${loop} vol=${inst?.metadata?.modPlayback?.defaultVolume}`);
}

// Export to MOD
const modPath = `/tmp/debug-med-export.mod`;
const warnings = exportSongToMOD(src, modPath);
if (warnings.length > 0) console.log('\nExport warnings:', warnings);

console.log(`\nParsing exported MOD: ${modPath}`);
const modBuf = readFileSync(modPath);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exp = parseMODFile(modBuf.buffer) as any;

console.log(`  numChannels: ${exp.numChannels}`);
console.log(`  songPositions (first 12): ${JSON.stringify(exp.songPositions?.slice(0, 12))}`);
console.log(`  initialSpeed: ${exp.initialSpeed}  initialBPM: ${exp.initialBPM}`);
console.log(`  patterns: ${exp.patterns?.length}`);

// Note name lookup
const NOTE_NAMES = ['---','C-0','C#0','D-0','D#0','E-0','F-0','F#0','G-0','G#0','A-0','A#0','B-0',
  'C-1','C#1','D-1','D#1','E-1','F-1','F#1','G-1','G#1','A-1','A#1','B-1',
  'C-2','C#2','D-2','D#2','E-2','F-2','F#2','G-2','G#2','A-2','A#2','B-2',
  'C-3','C#3','D-3','D#3','E-3','F-3','F#3','G-3','G#3','A-3','A#3','B-3',
  'C-4','C#4','D-4','D#4','E-4','F-4','F#4','G-4','G#4','A-4','A#4','B-4',
  'C-5','C#5','D-5','D#5','E-5','F-5','F#5','G-5','G#5','A-5','A#5','B-5',
  '^^^'];

function noteName(n: number): string { return NOTE_NAMES[n] ?? `n${n}`; }
function cell(c: any): string {
  if (!c) return '--- 00 000';
  const n = noteName(c.note ?? 0);
  const i = String(c.instrument ?? 0).padStart(2, '0');
  const et = (c.effTyp ?? 0).toString(16).toUpperCase();
  const ef = (c.eff ?? 0).toString(16).toUpperCase().padStart(2, '0');
  return `${n} ${i} ${et}${ef}`;
}

// Show patterns that appear in the order list
const orders: number[] = src.songPositions ?? [];
const patsToShow = patFilter >= 0
  ? [patFilter]
  : [...new Set(orders)].slice(0, 6); // first 6 unique patterns in order

for (const p of patsToShow) {
  const sp = src.patterns?.[p] as any;
  const ep = exp.patterns?.[p] as any;
  if (!sp && !ep) { console.log(`\nPattern ${p}: missing in both`); continue; }

  const srcCh = sp?.channels?.length ?? 0;
  const expCh = ep?.channels?.length ?? 0;
  const numCh = Math.max(srcCh, expCh);
  const numRows = Math.max(
    sp?.channels?.[0]?.rows?.length ?? 0,
    ep?.channels?.[0]?.rows?.length ?? 0
  );

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Pattern ${p}  src-ch=${srcCh}  exp-ch=${expCh}  rows=${numRows}`);
  console.log(`${'='.repeat(80)}`);

  // Header
  const hdr = Array.from({ length: Math.min(numCh, 4) }, (_, c) => {
    return `CH${c+1}-SRC      CH${c+1}-EXP     `.padEnd(24);
  }).join(' ');
  console.log(`ROW  ${hdr}`);

  let diffCount = 0;
  for (let r = 0; r < Math.min(numRows, 64); r++) {
    const cols = Array.from({ length: Math.min(numCh, 4) }, (_, c) => {
      const sc = sp?.channels?.[c]?.rows?.[r];
      const ec = ep?.channels?.[c]?.rows?.[r];
      const s = cell(sc);
      const e = cell(ec);
      const diff = s !== e;
      if (diff) diffCount++;
      return `${diff ? '!' : ' '}${s} | ${e}`;
    }).join('   ');
    // Only show rows with content or differences
    const hasContent = Array.from({ length: Math.min(numCh, 4) }, (_, c) => {
      const sc = sp?.channels?.[c]?.rows?.[r];
      return sc && (sc.note || sc.instrument || sc.effTyp || sc.eff);
    }).some(Boolean);
    if (hasContent || diffCount > 0) {
      console.log(`${String(r).padStart(3, '0')}  ${cols}`);
    }
  }
  if (diffCount === 0) console.log('  (no differences in first 4 channels)');
  else console.log(`  Total diffs in first 4 ch: ${diffCount}`);
}
