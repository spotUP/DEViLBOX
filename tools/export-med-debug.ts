// Exports MED files to /tmp for pattern inspection with openmpt123
import { parseMEDFile } from '../src/lib/import/formats/MEDParser';
import { exportSongToMOD } from './export-songs-openmpt';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  const song = parseMEDFile(buf.buffer, f);
  const stem = f.replace(/[^a-z0-9]+/gi, '_').replace(/\.[^.]+$/, '');
  const outPath = `/tmp/${stem}.mod`;
  const warns = exportSongToMOD(song, outPath);
  console.log(`Exported ${f} → ${outPath}${warns.length ? ' WARN: ' + warns.join('; ') : ''}`);
}
