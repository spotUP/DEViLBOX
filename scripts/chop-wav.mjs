/**
 * chop-wav.mjs — Split a WAV file on silence into individual samples
 *
 * Usage: node scripts/chop-wav.mjs <input.wav> <output-dir> [--threshold -40] [--min-silence 0.05] [--min-length 0.02]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { basename, join } from 'path';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node chop-wav.mjs <input.wav> <output-dir> [--threshold -40] [--min-silence 0.05] [--min-length 0.02]');
  process.exit(1);
}

const inputPath = args[0];
const outputDir = args[1];

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? parseFloat(args[idx + 1]) : defaultVal;
}

const thresholdDb = getArg('--threshold', -40);      // dB below peak to consider silence
const minSilenceSec = getArg('--min-silence', 0.04);  // Minimum silence gap (seconds)
const minLengthSec = getArg('--min-length', 0.03);    // Minimum sample length (seconds)

// ── Read WAV ──────────────────────────────────────────────────────────────────
const buf = readFileSync(inputPath);

// Parse WAV header
function readWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Verify RIFF header
  const riff = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  if (riff !== 'RIFF') throw new Error('Not a RIFF file');

  const wave = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (wave !== 'WAVE') throw new Error('Not a WAVE file');

  // Find fmt chunk
  let offset = 12;
  let fmt = null;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = String.fromCharCode(buffer[offset], buffer[offset+1], buffer[offset+2], buffer[offset+3]);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(offset + 8, true),
        numChannels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
        blockAlign: view.getUint16(offset + 20, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    // Pad to even boundary
    if (chunkSize % 2 !== 0) offset++;
  }

  if (!fmt) throw new Error('No fmt chunk found');
  if (dataOffset === 0) throw new Error('No data chunk found');

  return { fmt, dataOffset, dataSize };
}

const { fmt, dataOffset, dataSize } = readWav(buf);
const { numChannels, sampleRate, bitsPerSample, blockAlign } = fmt;

console.log(`Input: ${basename(inputPath)}`);
console.log(`Format: ${numChannels}ch, ${sampleRate}Hz, ${bitsPerSample}-bit`);
console.log(`Duration: ${(dataSize / blockAlign / sampleRate).toFixed(2)}s`);
console.log(`Threshold: ${thresholdDb}dB, Min silence: ${minSilenceSec}s, Min length: ${minLengthSec}s`);

// ── Read samples as float ─────────────────────────────────────────────────────
const totalFrames = Math.floor(dataSize / blockAlign);
const bytesPerSample = bitsPerSample / 8;
const maxVal = Math.pow(2, bitsPerSample - 1);

// Read all frames, compute per-frame peak amplitude (across channels)
const peaks = new Float32Array(totalFrames);
for (let i = 0; i < totalFrames; i++) {
  let framePeak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const bytePos = dataOffset + i * blockAlign + ch * bytesPerSample;
    let sample;
    if (bitsPerSample === 16) {
      sample = buf.readInt16LE(bytePos) / maxVal;
    } else if (bitsPerSample === 24) {
      // Read 24-bit signed integer (little-endian)
      const b0 = buf[bytePos];
      const b1 = buf[bytePos + 1];
      const b2 = buf[bytePos + 2];
      let val = (b2 << 16) | (b1 << 8) | b0;
      if (val & 0x800000) val |= ~0xFFFFFF; // Sign extend
      sample = val / 8388608; // 2^23
    } else if (bitsPerSample === 32) {
      sample = buf.readInt32LE(bytePos) / maxVal;
    } else {
      throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
    }
    framePeak = Math.max(framePeak, Math.abs(sample));
  }
  peaks[i] = framePeak;
}

// ── Find global peak for threshold ────────────────────────────────────────────
let globalPeak = 0;
for (let i = 0; i < totalFrames; i++) {
  if (peaks[i] > globalPeak) globalPeak = peaks[i];
}

const thresholdLinear = globalPeak * Math.pow(10, thresholdDb / 20);
const minSilenceFrames = Math.floor(minSilenceSec * sampleRate);
const minLengthFrames = Math.floor(minLengthSec * sampleRate);

console.log(`Global peak: ${(20 * Math.log10(globalPeak)).toFixed(1)}dB, threshold linear: ${thresholdLinear.toFixed(6)}`);

// ── Detect regions above threshold ────────────────────────────────────────────
// Find runs of non-silent frames (with some hysteresis via min silence gap)
const regions = []; // Array of { start: frame, end: frame }
let inRegion = false;
let regionStart = 0;
let silenceStart = 0;

for (let i = 0; i < totalFrames; i++) {
  const loud = peaks[i] >= thresholdLinear;

  if (loud) {
    if (!inRegion) {
      // Start new region
      regionStart = i;
      inRegion = true;
    }
    silenceStart = i + 1;
  } else {
    if (inRegion) {
      // Check if silence gap is long enough to end region
      if (i - silenceStart >= minSilenceFrames) {
        // End the region at where silence started
        if (silenceStart - regionStart >= minLengthFrames) {
          regions.push({ start: regionStart, end: silenceStart });
        }
        inRegion = false;
      }
    }
  }
}

// Close last region if still open
if (inRegion && (totalFrames - regionStart >= minLengthFrames)) {
  regions.push({ start: regionStart, end: totalFrames });
}

console.log(`\nFound ${regions.length} samples:`);

// ── Add a small pre-roll and tail to avoid clicks ─────────────────────────────
const preRollFrames = Math.floor(0.002 * sampleRate);  // 2ms pre-roll
const tailFrames = Math.floor(0.010 * sampleRate);       // 10ms tail for fade-out

// ── Write individual WAV files ────────────────────────────────────────────────
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

function writeWav(filePath, startFrame, endFrame) {
  // Expand region with pre-roll and tail (clamped to file bounds)
  const adjStart = Math.max(0, startFrame - preRollFrames);
  const adjEnd = Math.min(totalFrames, endFrame + tailFrames);
  const numFrames = adjEnd - adjStart;
  const audioDataSize = numFrames * blockAlign;

  // WAV header (44 bytes)
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioDataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(fmt.audioFormat, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE(blockAlign, 30);
  header.writeUInt16LE(bitsPerSample, 32);
  header.write('data', 36);
  header.writeUInt32LE(audioDataSize, 40);

  // Copy audio data
  const srcStart = dataOffset + adjStart * blockAlign;
  const audioData = buf.subarray(srcStart, srcStart + audioDataSize);

  const out = Buffer.concat([header, audioData]);
  writeFileSync(filePath, out);
}

const manifest = [];

regions.forEach((region, idx) => {
  const duration = (region.end - region.start) / sampleRate;
  const padded = String(idx + 1).padStart(3, '0');
  const fileName = `scratch_${padded}.wav`;
  const filePath = join(outputDir, fileName);

  writeWav(filePath, region.start, region.end);

  const startSec = (region.start / sampleRate).toFixed(3);
  const endSec = (region.end / sampleRate).toFixed(3);
  console.log(`  ${fileName}  ${startSec}s - ${endSec}s  (${duration.toFixed(3)}s)`);

  manifest.push({ name: fileName, duration: parseFloat(duration.toFixed(3)) });
});

// Write manifest
writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${regions.length} files + manifest.json to ${outputDir}`);
