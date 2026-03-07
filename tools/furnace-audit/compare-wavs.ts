/**
 * compare-wavs.ts — Compare DEViLBOX rendered WAVs against Furnace CLI reference WAVs
 *
 * Reads two WAV files (16-bit PCM stereo 44100Hz), computes comparison metrics:
 *   - RMS difference (dB)
 *   - Peak difference (dB)
 *   - Cross-correlation (0-1)
 *   - First divergence point (seconds)
 *
 * Usage:
 *   npx tsx tools/furnace-audit/compare-wavs.ts <reference.wav> <test.wav>
 *   npx tsx tools/furnace-audit/compare-wavs.ts --batch <ref-dir> <test-dir>
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, basename, relative } from 'path';

// ── WAV Parser (16-bit PCM only) ─────────────────────────────────────────────

interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  samples: Float32Array; // interleaved, normalized to [-1, 1]
  duration: number;
}

function parseWav(buffer: Buffer): WavData {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // RIFF header
  const riff = buffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') throw new Error('Not a RIFF file');
  const wave = buffer.toString('ascii', 8, 12);
  if (wave !== 'WAVE') throw new Error('Not a WAVE file');

  // Find fmt chunk
  let offset = 12;
  let channels = 0, sampleRate = 0, bitsPerSample = 0;
  let dataOffset = 0, dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      const audioFormat = view.getUint16(offset + 8, true);
      if (audioFormat !== 1) throw new Error(`Unsupported format: ${audioFormat} (need PCM=1)`);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++; // pad byte
  }

  if (!channels || !dataOffset) throw new Error('Missing fmt or data chunk');

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = dataSize / bytesPerSample;
  const samples = new Float32Array(totalSamples);

  if (bitsPerSample === 16) {
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = view.getFloat32(dataOffset + i * 4, true);
    }
  } else {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }

  return {
    sampleRate,
    channels,
    bitsPerSample,
    samples,
    duration: totalSamples / channels / sampleRate,
  };
}

// ── Comparison Metrics ───────────────────────────────────────────────────────

interface CompareResult {
  file: string;
  refDuration: number;
  testDuration: number;
  rmsDbDiff: number;       // RMS of difference signal in dB (lower = better, -Inf = identical)
  peakDbDiff: number;      // Peak difference in dB
  correlation: number;     // Cross-correlation (1.0 = identical)
  firstDivergenceSec: number; // First point where diff exceeds threshold
  pass: boolean;
}

function compareWavs(refPath: string, testPath: string, label: string): CompareResult {
  const refBuf = readFileSync(refPath);
  const testBuf = readFileSync(testPath);

  const ref = parseWav(refBuf);
  const test = parseWav(testBuf);

  // Use shorter length for comparison
  const len = Math.min(ref.samples.length, test.samples.length);

  // RMS of difference
  let sumSqDiff = 0;
  let peakDiff = 0;
  let sumRef = 0;
  let sumTest = 0;
  let sumRefTest = 0;
  let sumRefSq = 0;
  let sumTestSq = 0;
  let firstDivergence = -1;

  const DIVERGE_THRESHOLD = 0.01; // ~-40dB

  for (let i = 0; i < len; i++) {
    const r = ref.samples[i];
    const t = test.samples[i];
    const d = r - t;

    sumSqDiff += d * d;
    if (Math.abs(d) > peakDiff) peakDiff = Math.abs(d);

    sumRef += r;
    sumTest += t;
    sumRefSq += r * r;
    sumTestSq += t * t;
    sumRefTest += r * t;

    if (firstDivergence < 0 && Math.abs(d) > DIVERGE_THRESHOLD) {
      firstDivergence = i;
    }
  }

  const rmsDiff = Math.sqrt(sumSqDiff / len);
  const rmsDbDiff = rmsDiff > 0 ? 20 * Math.log10(rmsDiff) : -Infinity;
  const peakDbDiff = peakDiff > 0 ? 20 * Math.log10(peakDiff) : -Infinity;

  // Pearson correlation
  const n = len;
  const meanRef = sumRef / n;
  const meanTest = sumTest / n;
  const numerator = sumRefTest - n * meanRef * meanTest;
  const denomRef = Math.sqrt(sumRefSq - n * meanRef * meanRef);
  const denomTest = Math.sqrt(sumTestSq - n * meanTest * meanTest);
  const correlation = (denomRef > 0 && denomTest > 0)
    ? numerator / (denomRef * denomTest)
    : (denomRef === 0 && denomTest === 0 ? 1.0 : 0.0);

  const firstDivergenceSec = firstDivergence >= 0
    ? firstDivergence / ref.channels / ref.sampleRate
    : -1;

  // Pass criteria: RMS diff < -60dB AND correlation > 0.99
  const pass = rmsDbDiff < -60 && correlation > 0.99;

  return {
    file: label,
    refDuration: ref.duration,
    testDuration: test.duration,
    rmsDbDiff,
    peakDbDiff,
    correlation,
    firstDivergenceSec,
    pass,
  };
}

// ── Batch Mode ───────────────────────────────────────────────────────────────

function batchCompare(refDir: string, testDir: string): CompareResult[] {
  const results: CompareResult[] = [];

  function walkDir(dir: string, prefix: string = '') {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.wav')) {
        const testPath = join(testDir, relPath);
        if (existsSync(testPath)) {
          try {
            results.push(compareWavs(join(dir, entry.name), testPath, relPath));
          } catch (e) {
            console.error(`  ERROR: ${relPath}: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  walkDir(refDir);
  return results;
}

function printResults(results: CompareResult[]) {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log('\n' + '='.repeat(100));
  console.log(`  FURNACE AUDIO COMPARISON: ${passed} PASS / ${failed} FAIL / ${results.length} TOTAL`);
  console.log('='.repeat(100));

  // Print failures first
  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    console.log('-'.repeat(100));
    console.log(
      'File'.padEnd(50) +
      'RMS dB'.padStart(10) +
      'Peak dB'.padStart(10) +
      'Corr'.padStart(8) +
      'Diverge @'.padStart(12)
    );
    console.log('-'.repeat(100));

    for (const r of failures) {
      const divergeStr = r.firstDivergenceSec >= 0
        ? `${r.firstDivergenceSec.toFixed(3)}s`
        : 'n/a';
      console.log(
        r.file.padEnd(50) +
        r.rmsDbDiff.toFixed(1).padStart(10) +
        r.peakDbDiff.toFixed(1).padStart(10) +
        r.correlation.toFixed(4).padStart(8) +
        divergeStr.padStart(12)
      );
    }
  }

  // Summary by category
  const categories = new Map<string, { pass: number; fail: number }>();
  for (const r of results) {
    const cat = r.file.split('/')[0];
    if (!categories.has(cat)) categories.set(cat, { pass: 0, fail: 0 });
    const c = categories.get(cat)!;
    if (r.pass) c.pass++; else c.fail++;
  }

  console.log('\nBY CATEGORY:');
  console.log('-'.repeat(40));
  for (const [cat, counts] of [...categories.entries()].sort()) {
    const total = counts.pass + counts.fail;
    const pct = ((counts.pass / total) * 100).toFixed(0);
    const status = counts.fail === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${cat.padEnd(20)} ${counts.pass}/${total} (${pct}%) ${status}`);
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--batch' && args.length === 3) {
  const results = batchCompare(args[1], args[2]);
  printResults(results);

  // Write JSON report
  const reportPath = join(args[1], '..', 'comparison-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report saved to: ${reportPath}`);

  process.exit(results.some(r => !r.pass) ? 1 : 0);

} else if (args.length === 2) {
  const result = compareWavs(args[0], args[1], basename(args[0]));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);

} else {
  console.log('Usage:');
  console.log('  npx tsx tools/furnace-audit/compare-wavs.ts <reference.wav> <test.wav>');
  console.log('  npx tsx tools/furnace-audit/compare-wavs.ts --batch <ref-dir> <test-dir>');
  process.exit(1);
}
