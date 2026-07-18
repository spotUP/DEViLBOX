/**
 * probe-instrument-resolution.ts
 *
 * Answers two questions:
 *  1. Corpus-wide: which .src songs reference sampled-instrument names that do
 *     NOT exist as files in instr/ (i.e. would render silent even with sidecars)?
 *  2. Per-song (arg): per voice, for every note-onset, what instrument does it
 *     resolve to, and is that instrument AUDIBLE (sampled+data / synth) or SILENT
 *     (sampled+missing companion → volume-0 placeholder)?
 *
 * Run: npx tsx tools/suntronic-re/probe-instrument-resolution.ts [song.src]
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const INSTR = join(CORPUS, 'instr');

// Filenames present in instr/, lowercased basenames.
const onDisk = new Set(readdirSync(INSTR).map((f) => f.toLowerCase()));
function resolves(name: string): boolean {
  const n = name.toLowerCase();
  return onDisk.has(n) || onDisk.has(`${n}.x`);
}

function scoreOf(name: string) {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return parseSunTronicV13Score(raw);
}

const arg = process.argv[2];

if (!arg) {
  // Corpus sweep: songs whose sampled instruments are not all on disk.
  const songs = readdirSync(CORPUS).filter((f) => f.endsWith('.src'));
  let clean = 0;
  const broken: string[] = [];
  for (const song of songs) {
    let score;
    try {
      score = scoreOf(song);
    } catch {
      broken.push(`${song}  (PARSE ERROR)`);
      continue;
    }
    const missing = score.sampledInstruments
      .map((rec) => score.instrumentNames[rec.slotIndex] ?? `<unnamed slot ${rec.slotIndex}>`)
      .filter((nm) => nm.startsWith('<unnamed') || !resolves(nm));
    if (missing.length === 0) clean++;
    else broken.push(`${song}  missing: ${[...new Set(missing)].join(', ')}`);
  }
  console.log(`Corpus: ${songs.length} songs, ${clean} all-instruments-present, ${broken.length} with missing sampled instruments:\n`);
  for (const b of broken) console.log('  ' + b);
} else {
  // Per-song onset -> instrument resolution.
  const score = scoreOf(arg);
  const numSampled = score.sampledInstruments.length;
  console.log(`${arg}: ${numSampled} sampled instruments, ${score.synthInstrumentCount} synth instruments`);
  console.log('sampled instrument files:');
  score.sampledInstruments.forEach((rec, i) => {
    const nm = score.instrumentNames[rec.slotIndex] ?? `?${rec.slotIndex}`;
    const ok = resolves(nm);
    console.log(`  sel 0x${(0x40 + i).toString(16)} -> id ${numSampled + i + 1}  "${nm}"  ${ok ? 'PRESENT' : 'MISSING -> SILENT'}`);
  });
}
