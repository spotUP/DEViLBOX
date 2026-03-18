// Check actual row counts for all MED patterns in a file
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMEDFile } from '../src/lib/import/formats/MEDParser';

const ROOT = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');

const files = [
  'funky nightmare.mmd1',
  'med.sadman',
  'bounty hunter - outro (remixed).mmd3',
  'universal monsters - dracula.mmd0',
];

for (const f of files) {
  const buf = readFileSync(join(TEST_DIR, f));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const song = parseMEDFile(buf.buffer, f) as any;
  const orders: number[] = song.songPositions ?? [];
  const pats: any[] = song.patterns ?? [];

  console.log(`\n=== ${f} ===`);
  console.log(`  Orders: ${JSON.stringify(orders.slice(0,12))} (total=${orders.length})`);
  console.log(`  BPM=${song.initialBPM} Speed=${song.initialSpeed}`);

  // Show row counts for each pattern
  const rowCounts = pats.map((p:any, i:number) => {
    const rows = p?.channels?.[0]?.rows?.length ?? 0;
    return `${i}:${rows}`;
  });
  console.log(`  Pattern row counts: ${rowCounts.slice(0,30).join(' ')}`);

  // Calculate total rows that would actually play
  let totalRows = 0;
  for (const o of orders) {
    const rows = pats[o]?.channels?.[0]?.rows?.length ?? 0;
    totalRows += rows;
  }
  console.log(`  Total rows to play: ${totalRows}`);

  // Expected duration with these parameters
  const bpm = song.initialBPM || 125;
  const speed = song.initialSpeed || 6;
  const dur = totalRows * speed * 60 / (bpm * 24);
  console.log(`  Expected duration at BPM=${bpm} speed=${speed}: ${dur.toFixed(1)}s = ${Math.floor(dur/60)}:${(dur%60).toFixed(1).padStart(4,'0')}`);
}
