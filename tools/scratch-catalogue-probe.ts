/**
 * Scratch catalogue probe (SCR-P0.5): at which sample rate are the anchors
 * and safe ranges in `scratch_bank_metadata.json` expressed?
 *
 * The pack WAVs are 44,100 Hz; the Up Rough analyser worked at 22,050 Hz
 * (research 2026-10-08, 5.3). For every record this prints the file's real
 * duration (from the WAV `data` chunk), the metadata `duration_ms`, and the
 * record's `safe[1]` (its last usable sample) converted at both rates. The
 * rate that is right makes every `safe[1]` fit inside the file and land
 * near its end; the wrong one puts every tail at about half the record.
 *
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/scratch-catalogue-probe.ts [--md]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACK = resolve(process.cwd(), 'public/data/samples/packs/scratch-originals');
const RATES = [22050, 44100] as const;

type Record_ = {
  canonical_name: string;
  packFile: string;
  duration_ms: number;
  anchor_vowel: number;
  anchor_tail: number;
  safe: [number, number];
};

/** Frames and sample rate of a RIFF/WAVE file, read from its `fmt ` and `data` chunks. */
export function wavInfo(path: string): { sampleRate: number; channels: number; bits: number; frames: number } {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`not a WAV: ${path}`);
  let pos = 12;
  let sampleRate = 0, channels = 0, bits = 0, dataBytes = -1;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(pos + 10);
      sampleRate = b.readUInt32LE(pos + 12);
      bits = b.readUInt16LE(pos + 22);
    } else if (id === 'data') {
      dataBytes = Math.min(size, b.length - pos - 8);
      break;
    }
    pos += 8 + size + (size & 1);
  }
  if (!sampleRate || dataBytes < 0) throw new Error(`no fmt/data chunk: ${path}`);
  return { sampleRate, channels, bits, frames: dataBytes / (channels * (bits / 8)) };
}

export interface ProbeRow {
  name: string;
  file: string;
  fileMs: number;
  metaMs: number;
  safeEnd: number;
  /** safe[1] in ms at each candidate rate */
  safeEndMs: Record<number, number>;
  /** safe[1] as a fraction of the file length at each candidate rate */
  tailFraction: Record<number, number>;
}

export function probe(): { rows: ProbeRow[]; fits: Record<number, number>; medianTail: Record<number, number> } {
  const meta = JSON.parse(readFileSync(resolve(PACK, 'scratch_bank_metadata.json'), 'utf8')) as Record<string, Record_>;
  const rows: ProbeRow[] = Object.values(meta).map(r => {
    const info = wavInfo(resolve(PACK, r.packFile));
    const fileMs = (info.frames / info.sampleRate) * 1000;
    const safeEndMs: Record<number, number> = {};
    const tailFraction: Record<number, number> = {};
    for (const rate of RATES) {
      safeEndMs[rate] = (r.safe[1] / rate) * 1000;
      tailFraction[rate] = safeEndMs[rate] / fileMs;
    }
    return { name: r.canonical_name, file: r.packFile, fileMs, metaMs: r.duration_ms, safeEnd: r.safe[1], safeEndMs, tailFraction };
  });
  const fits: Record<number, number> = {};
  const medianTail: Record<number, number> = {};
  for (const rate of RATES) {
    fits[rate] = rows.filter(r => r.safeEndMs[rate] <= r.fileMs).length;
    const sorted = rows.map(r => r.tailFraction[rate]).sort((a, b) => a - b);
    medianTail[rate] = sorted[Math.floor(sorted.length / 2)];
  }
  return { rows, fits, medianTail };
}

function main(): void {
  const { rows, fits, medianTail } = probe();
  const f = (n: number) => n.toFixed(1);
  console.log('| record | file | file ms | meta ms | safe[1] | /22050 ms | tail@22050 | /44100 ms | tail@44100 |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(`| ${r.name} | ${r.file} | ${f(r.fileMs)} | ${f(r.metaMs)} | ${r.safeEnd} | ${f(r.safeEndMs[22050])} | ${r.tailFraction[22050].toFixed(2)} | ${f(r.safeEndMs[44100])} | ${r.tailFraction[44100].toFixed(2)} |`);
  }
  console.log('');
  console.log(`records: ${rows.length}`);
  for (const rate of RATES) {
    console.log(`${rate} Hz: safe[1] fits the file in ${fits[rate]} of ${rows.length}; median tail fraction ${medianTail[rate].toFixed(3)}`);
  }
  const drift = rows.filter(r => Math.abs(r.fileMs - r.metaMs) > 1);
  console.log(`file duration vs metadata duration_ms differ by > 1 ms: ${drift.length}${drift.length ? ' (' + drift.map(r => r.name).join(', ') + ')' : ''}`);
}

if (process.argv[1] && /scratch-catalogue-probe\.ts$/.test(process.argv[1])) main();
