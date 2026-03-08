/**
 * Analyze divergence between two WAV files in 10ms windows.
 * Finds where the RMS difference exceeds 3dB.
 */
import { readFileSync } from 'fs';

interface WavData {
  sampleRate: number;
  channels: number;
  samples: Float32Array;
  duration: number;
}

function parseWav(buffer: Buffer): WavData {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 12;
  let channels = 0, sampleRate = 0, bitsPerSample = 0;
  let dataOffset = 0, dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }

  const totalSamples = dataSize / (bitsPerSample / 8);
  const samples = new Float32Array(totalSamples);
  if (bitsPerSample === 16) {
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = view.getFloat32(dataOffset + i * 4, true);
    }
  }

  return { sampleRate, channels, samples, duration: totalSamples / channels / sampleRate };
}

function rmsDb(samples: Float32Array, start: number, len: number): number {
  let sum = 0;
  const end = Math.min(start + len, samples.length);
  const actual = end - start;
  if (actual <= 0) return -Infinity;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / actual);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

const refPath = '/Users/spot/Code/DEViLBOX/test-data/furnace-ref/gameboy/finger.wav';
const testPath = '/Users/spot/Code/DEViLBOX/test-data/furnace-devilbox/gameboy/finger.wav';

const ref = parseWav(readFileSync(refPath));
const test = parseWav(readFileSync(testPath));

console.log(`Reference: ${ref.sampleRate}Hz, ${ref.channels}ch, ${ref.duration.toFixed(2)}s`);
console.log(`Test:      ${test.sampleRate}Hz, ${test.channels}ch, ${test.duration.toFixed(2)}s`);
console.log('');

// 10ms windows
const windowSamples = Math.floor(ref.sampleRate * 0.01) * ref.channels;
const minLen = Math.min(ref.samples.length, test.samples.length);
const numWindows = Math.floor(minLen / windowSamples);

console.log(`Window size: ${windowSamples} samples (${(windowSamples / ref.channels / ref.sampleRate * 1000).toFixed(1)}ms)`);
console.log(`Total windows: ${numWindows}`);
console.log('');

// Find windows where RMS difference exceeds 3dB
const divergentWindows: { idx: number; time: number; refRms: number; testRms: number; diffDb: number }[] = [];

for (let w = 0; w < numWindows; w++) {
  const start = w * windowSamples;
  const refRms = rmsDb(ref.samples, start, windowSamples);
  const testRms = rmsDb(test.samples, start, windowSamples);
  const diffDb = Math.abs(refRms - testRms);

  if (diffDb > 3.0 && refRms > -60 && testRms > -60) { // ignore near-silence
    const time = w * windowSamples / ref.channels / ref.sampleRate;
    divergentWindows.push({ idx: w, time, refRms, testRms, diffDb });
  }
}

console.log(`Divergent windows (>3dB diff, excluding silence): ${divergentWindows.length} / ${numWindows}`);
console.log('');

// Print first 10
console.log('FIRST 10 DIVERGENT WINDOWS:');
console.log('-'.repeat(80));
console.log('  Window    Time(s)   Ref RMS(dB)   Test RMS(dB)   Diff(dB)');
console.log('-'.repeat(80));
for (const dw of divergentWindows.slice(0, 10)) {
  console.log(
    `  ${String(dw.idx).padStart(6)}    ${dw.time.toFixed(3).padStart(8)}   ${dw.refRms.toFixed(1).padStart(11)}   ${dw.testRms.toFixed(1).padStart(12)}   ${dw.diffDb.toFixed(1).padStart(7)}`
  );
}

// Stats for first 2 seconds vs rest
const twoSecWindows = Math.floor(2.0 * ref.sampleRate * ref.channels / windowSamples);

let first2sDivergent = 0;
let restDivergent = 0;
const first2sTotal = Math.min(twoSecWindows, numWindows);
const restTotal = numWindows - first2sTotal;

for (const dw of divergentWindows) {
  if (dw.idx < twoSecWindows) first2sDivergent++;
  else restDivergent++;
}

console.log('');
console.log('DIVERGENCE DENSITY:');
console.log('-'.repeat(60));
console.log(`  First 2s:  ${first2sDivergent} / ${first2sTotal} windows divergent (${(first2sDivergent/first2sTotal*100).toFixed(1)}%)`);
console.log(`  Rest:      ${restDivergent} / ${restTotal} windows divergent (${restTotal > 0 ? (restDivergent/restTotal*100).toFixed(1) : 'n/a'}%)`);

// Also compute average RMS for each segment
function segmentRms(samples: Float32Array, startSample: number, endSample: number): number {
  const end = Math.min(endSample, samples.length);
  const start = Math.max(startSample, 0);
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / (end - start));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

const twoSecSamples = 2 * ref.sampleRate * ref.channels;

console.log('');
console.log('AVERAGE RMS BY SEGMENT:');
console.log('-'.repeat(60));
console.log(`  First 2s:  Ref ${segmentRms(ref.samples, 0, twoSecSamples).toFixed(1)} dB,  Test ${segmentRms(test.samples, 0, twoSecSamples).toFixed(1)} dB`);
console.log(`  Rest:      Ref ${segmentRms(ref.samples, twoSecSamples, minLen).toFixed(1)} dB,  Test ${segmentRms(test.samples, twoSecSamples, minLen).toFixed(1)} dB`);

// Distribution of divergence over time (10-second buckets)
console.log('');
console.log('DIVERGENCE BY 10-SECOND BUCKETS:');
console.log('-'.repeat(60));
const bucketDuration = 10; // seconds
const bucketWindows = Math.floor(bucketDuration * ref.sampleRate * ref.channels / windowSamples);
const numBuckets = Math.ceil(numWindows / bucketWindows);

for (let b = 0; b < numBuckets; b++) {
  const bStart = b * bucketWindows;
  const bEnd = Math.min((b + 1) * bucketWindows, numWindows);
  const bTotal = bEnd - bStart;
  const bDiv = divergentWindows.filter(dw => dw.idx >= bStart && dw.idx < bEnd).length;
  const timeStart = (b * bucketDuration).toFixed(0);
  const timeEnd = ((b + 1) * bucketDuration).toFixed(0);
  console.log(`  ${timeStart.padStart(4)}s - ${timeEnd.padStart(4)}s:  ${String(bDiv).padStart(4)} / ${String(bTotal).padStart(4)} divergent (${(bDiv/bTotal*100).toFixed(1)}%)`);
}
