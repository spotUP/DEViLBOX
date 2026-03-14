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
import * as http from 'http';

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
      // 1=PCM, 3=IEEE_FLOAT, 65534=WAVE_FORMAT_EXTENSIBLE (wrapper for PCM/float)
      if (audioFormat !== 1 && audioFormat !== 3 && audioFormat !== 65534) {
        throw new Error(`Unsupported format: ${audioFormat} (need PCM=1, float=3, or extensible=65534)`);
      }
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

// ── Mono mixing + time alignment helpers ─────────────────────────────────────

/** Mix stereo (or any channel count) to mono by averaging all channels */
function toMono(wav: WavData): Float32Array {
  const frames = Math.floor(wav.samples.length / wav.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < wav.channels; ch++) {
      sum += wav.samples[i * wav.channels + ch];
    }
    mono[i] = sum / wav.channels;
  }
  return mono;
}

/**
 * Find the sample index where audio begins (first window with RMS > threshold).
 * Returns 0 if audio starts immediately.
 * Uses a 10ms window to avoid triggering on isolated noise samples.
 */
function findAudioOnset(mono: Float32Array, sampleRate: number, threshold = 0.002): number {
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms
  for (let i = 0; i + windowSize < mono.length; i += windowSize) {
    let rms = 0;
    for (let j = 0; j < windowSize; j++) {
      rms += mono[i + j] * mono[i + j];
    }
    if (Math.sqrt(rms / windowSize) > threshold) return i;
  }
  return 0;
}

// ── Comparison Metrics ───────────────────────────────────────────────────────

interface CompareResult {
  file: string;
  refDuration: number;
  testDuration: number;
  rmsDbDiff: number;       // RMS of difference signal in dB (lower = better, -Inf = identical)
  peakDbDiff: number;      // Peak difference in dB
  correlation: number;     // Cross-correlation (1.0 = identical)
  envCorrelation: number;  // Envelope correlation — RMS amplitude in ~10ms windows (phase-independent)
  firstDivergenceSec: number; // First point where diff exceeds threshold
  refOnsetMs: number;      // Milliseconds before audio starts in reference
  testOnsetMs: number;     // Milliseconds before audio starts in test
  pass: boolean;
}

function compareWavs(refPath: string, testPath: string, label: string): CompareResult {
  const refBuf = readFileSync(refPath);
  const testBuf = readFileSync(testPath);

  const ref = parseWav(refBuf);
  const test = parseWav(testBuf);

  // Mix to mono — eliminates UADE panning differences (WASM=mono, uade123=stereo 0.7)
  const refMono = toMono(ref);
  const testMono = toMono(test);

  // Find audio onset in each signal — UADE score startup takes 40-60ms before audio begins
  const refOnset = findAudioOnset(refMono, ref.sampleRate);
  const testOnset = findAudioOnset(testMono, test.sampleRate);

  // Align both signals to their respective audio onset
  const refAligned = refMono.slice(refOnset);
  const testAligned = testMono.slice(testOnset);

  // Use shorter length for comparison
  const len = Math.min(refAligned.length, testAligned.length);

  // Re-map to interleaved format the existing comparison code expects (mono = 1 channel)
  // We'll work directly with the aligned mono arrays
  const refOnsetMs = Math.round(refOnset / ref.sampleRate * 1000);
  const testOnsetMs = Math.round(testOnset / test.sampleRate * 1000);

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
    const r = refAligned[i];
    const t = testAligned[i];
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
    ? firstDivergence / ref.sampleRate
    : -1;

  // Envelope correlation: compare RMS amplitude in ~10ms windows
  // This is phase-independent and more meaningful for chip music where
  // square wave phase divergence kills sample-level correlation
  const envWindowSamples = Math.floor(ref.sampleRate * 0.01); // ~10ms window (mono)
  const envLen = Math.floor(len / envWindowSamples);
  let envSumRef = 0, envSumTest = 0, envSumRefSq = 0, envSumTestSq = 0, envSumRefTest = 0;

  for (let w = 0; w < envLen; w++) {
    const base = w * envWindowSamples;
    let rmsR = 0, rmsT = 0;
    for (let i = 0; i < envWindowSamples; i++) {
      rmsR += refAligned[base + i] * refAligned[base + i];
      rmsT += testAligned[base + i] * testAligned[base + i];
    }
    rmsR = Math.sqrt(rmsR / envWindowSamples);
    rmsT = Math.sqrt(rmsT / envWindowSamples);

    envSumRef += rmsR;
    envSumTest += rmsT;
    envSumRefSq += rmsR * rmsR;
    envSumTestSq += rmsT * rmsT;
    envSumRefTest += rmsR * rmsT;
  }

  const envMeanRef = envSumRef / envLen;
  const envMeanTest = envSumTest / envLen;
  const envNum = envSumRefTest - envLen * envMeanRef * envMeanTest;
  const envDenRef = Math.sqrt(envSumRefSq - envLen * envMeanRef * envMeanRef);
  const envDenTest = Math.sqrt(envSumTestSq - envLen * envMeanTest * envMeanTest);
  const envCorrelation = (envDenRef > 0 && envDenTest > 0)
    ? envNum / (envDenRef * envDenTest)
    : (envDenRef === 0 && envDenTest === 0 ? 1.0 : 0.0);

  // Pass criteria: envelope correlation > 0.90 (phase-independent amplitude match)
  const pass = envCorrelation > 0.90;

  return {
    file: label,
    refDuration: ref.duration,
    testDuration: test.duration,
    rmsDbDiff,
    peakDbDiff,
    correlation,
    envCorrelation,
    firstDivergenceSec,
    refOnsetMs,
    testOnsetMs,
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

  console.log('\n' + '='.repeat(110));
  console.log(`  UADE AUDIO COMPARISON: ${passed} PASS / ${failed} FAIL / ${results.length} TOTAL`);
  console.log('  (mono-mixed, time-aligned to audio onset)');
  console.log('='.repeat(110));

  // Print failures first
  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    console.log('-'.repeat(110));
    console.log(
      'File'.padEnd(44) +
      'RMS dB'.padStart(10) +
      'Peak dB'.padStart(10) +
      'Corr'.padStart(8) +
      'EnvCorr'.padStart(9) +
      'Ref onset'.padStart(11) +
      'Dev onset'.padStart(11)
    );
    console.log('-'.repeat(110));

    for (const r of failures) {
      console.log(
        r.file.padEnd(44) +
        r.rmsDbDiff.toFixed(1).padStart(10) +
        r.peakDbDiff.toFixed(1).padStart(10) +
        r.correlation.toFixed(4).padStart(8) +
        r.envCorrelation.toFixed(4).padStart(9) +
        `${r.refOnsetMs}ms`.padStart(11) +
        `${r.testOnsetMs}ms`.padStart(11)
      );
    }
  }

  // Print passes
  const passes = results.filter(r => r.pass);
  if (passes.length > 0) {
    console.log('\nPASSES:');
    console.log('-'.repeat(110));
    console.log(
      'File'.padEnd(44) +
      'RMS dB'.padStart(10) +
      'EnvCorr'.padStart(9) +
      'Corr'.padStart(8) +
      'Ref onset'.padStart(11) +
      'Dev onset'.padStart(11)
    );
    console.log('-'.repeat(110));
    for (const r of passes) {
      console.log(
        r.file.padEnd(44) +
        r.rmsDbDiff.toFixed(1).padStart(10) +
        r.envCorrelation.toFixed(4).padStart(9) +
        r.correlation.toFixed(4).padStart(8) +
        `${r.refOnsetMs}ms`.padStart(11) +
        `${r.testOnsetMs}ms`.padStart(11)
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

// ── Format Monitor Push ───────────────────────────────────────────────────────

/**
 * Push comparison results to the format monitor server at localhost:4444.
 * Results are stored as keys "uade-<filename>" with envCorr, rmsDbDiff, etc.
 * so the format-status.html audit table can display pass/fail bars.
 */
async function pushToFormatMonitor(results: CompareResult[]): Promise<void> {
  const updates: Record<string, unknown> = {};
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  for (const r of results) {
    // Label is relative path like "afterburner.dl.wav" or "afterburner.dl"
    // Strip .wav suffix to get the original filename, then prefix with "uade-"
    const filename = r.file.replace(/\.wav$/, '').split('/').pop() ?? r.file;
    const key = `uade-${filename}`;

    updates[key] = {
      envCorr: parseFloat(r.envCorrelation.toFixed(4)),
      rmsDbDiff: parseFloat(r.rmsDbDiff.toFixed(1)),
      correlation: parseFloat(r.correlation.toFixed(4)),
      refDuration: parseFloat(r.refDuration.toFixed(1)),
      testDuration: parseFloat(r.testDuration.toFixed(1)),
      refOnsetMs: r.refOnsetMs,
      testOnsetMs: r.testOnsetMs,
      pass: r.pass,
      lastTestedAt: ts,
      // Auto-set auditStatus if not already set — server preserves existing status
      auditStatus: r.pass ? 'fixed' : 'investigating',
    };
  }

  try {
    const body = JSON.stringify(updates);
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { hostname: 'localhost', port: 4444, path: '/push-updates', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => {
            const parsed = JSON.parse(data);
            console.log(`[monitor] Pushed ${parsed.changed ?? 0} updates to localhost:4444`);
            resolve();
          });
        },
      );
      req.on('error', (e: Error) => {
        console.log(`[monitor] Format monitor not running (${e.message}) — skipping push`);
        resolve();
      });
      req.write(body);
      req.end();
    });
  } catch (e) {
    console.log(`[monitor] Push failed: ${(e as Error).message}`);
  }
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

  // Push to format monitor
  await pushToFormatMonitor(results);

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
