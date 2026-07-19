/**
 * probe-channel-instruments.ts — per-channel onset -> instrument resolution for
 * one SunTronic V1.3 song. Answers: which instruments do a channel's shown notes
 * point at, and is each instrument audible (sampled+data / synth with a volume
 * envelope) or degenerate (empty volEnv / no sample / no record = silent)?
 *
 * Run: npx tsx tools/suntronic-re/probe-channel-instruments.ts <song.src>
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const INSTR = join(CORPUS, 'instr');
const onDisk = new Set(readdirSync(INSTR).map((f) => f.toLowerCase()));
const present = (nm: string) => onDisk.has(nm.toLowerCase()) || onDisk.has(`${nm.toLowerCase()}.x`);

const name = process.argv[2] ?? 'analgestic2.src';
const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
const score = parseSunTronicV13Score(raw);
const numSampled = score.sampledInstruments.length;

function describe(id: number): string {
  if (id <= 0) return 'NONE';
  if (id <= numSampled) {
    const rec = score.sampledInstruments[id - 1];
    const nm = score.instrumentNames[rec.slotIndex] ?? `<slot ${rec.slotIndex}>`;
    return `sampled#${id} "${nm}" ${present(nm) ? 'audible' : 'SILENT(missing)'}`;
  }
  const rec = score.synthInstruments[id - numSampled - 1];
  if (!rec) return `synth#${id} SILENT(no-record)`;
  const volEnv = rec.volEnv?.length ?? 0;
  const hasWave = (rec.sampleData?.length ?? 0) > 0 || (rec.arpTable?.length ?? 0) > 0 || volEnv > 0;
  const flag = volEnv === 0 ? 'SILENT(empty volEnv)' : hasWave ? 'audible' : 'SILENT(no wave)';
  return `synth#${id} type${(rec as { synthType?: number }).synthType ?? '?'} volEnv=${volEnv} ${flag}`;
}

const song = parseSunTronicFile(ab, name) as unknown as {
  patterns: { channels: { rows: { note: number; instrument?: number }[] }[] }[];
};
console.log(`${name}: ${numSampled} sampled, ${score.synthInstruments.length} synth\n`);
for (let ch = 0; ch < 4; ch++) {
  const counts = new Map<number, number>();
  let onsets = 0;
  for (const pat of song.patterns) {
    const c = pat.channels[ch];
    if (!c) continue;
    for (const cell of c.rows) {
      if (cell.note && cell.note > 0) {
        onsets++;
        const id = cell.instrument ?? 0;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  console.log(`ch${ch + 1} (grid ch${ch}): ${onsets} onsets`);
  for (const [id, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}x  ${describe(id)}`);
  }
}
