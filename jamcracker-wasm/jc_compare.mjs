#!/usr/bin/env node
/**
 * jc_compare.mjs — Compare JamCracker WASM output vs UADE reference WAV
 *
 * Computes per-channel RMS error, cross-correlation, and overall similarity.
 * Resamples to common rate before comparison.
 *
 * Usage: node jc_compare.mjs <native.wav> <uade.wav>
 */

import { readFileSync } from 'fs';

function readWav(path) {
    const buf = readFileSync(path);
    if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path}: not a RIFF file`);
    if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAVE file`);

    // Find fmt chunk
    let off = 12;
    let fmtOff = -1, dataOff = -1, dataSize = 0;
    while (off < buf.length - 8) {
        const id = buf.toString('ascii', off, off + 4);
        const size = buf.readUInt32LE(off + 4);
        if (id === 'fmt ') fmtOff = off + 8;
        if (id === 'data') { dataOff = off + 8; dataSize = size; }
        off += 8 + size;
        if (size % 2) off++; // padding
    }
    if (fmtOff < 0 || dataOff < 0) throw new Error(`${path}: missing fmt/data chunks`);

    const fmt = buf.readUInt16LE(fmtOff);
    const channels = buf.readUInt16LE(fmtOff + 2);
    const sampleRate = buf.readUInt32LE(fmtOff + 4);
    const bitsPerSample = buf.readUInt16LE(fmtOff + 14);

    if (fmt !== 1) throw new Error(`${path}: not PCM (fmt=${fmt})`);
    if (bitsPerSample !== 16) throw new Error(`${path}: not 16-bit (${bitsPerSample})`);

    const numSamples = dataSize / (channels * 2);
    const samples = new Float32Array(numSamples * channels);
    for (let i = 0; i < numSamples * channels; i++) {
        samples[i] = buf.readInt16LE(dataOff + i * 2) / 32768.0;
    }

    return { sampleRate, channels, numSamples, samples };
}

// Simple linear resampling (mono or interleaved stereo)
function resample(samples, channels, fromRate, toRate) {
    const numIn = samples.length / channels;
    const numOut = Math.floor(numIn * toRate / fromRate);
    const out = new Float32Array(numOut * channels);
    for (let i = 0; i < numOut; i++) {
        const srcPos = i * fromRate / toRate;
        const idx0 = Math.floor(srcPos);
        const frac = srcPos - idx0;
        const idx1 = Math.min(idx0 + 1, numIn - 1);
        for (let c = 0; c < channels; c++) {
            out[i * channels + c] =
                samples[idx0 * channels + c] * (1 - frac) +
                samples[idx1 * channels + c] * frac;
        }
    }
    return { samples: out, numSamples: numOut };
}

// Deinterleave stereo to separate L/R arrays
function deinterleave(samples, numSamples) {
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        left[i] = samples[i * 2];
        right[i] = samples[i * 2 + 1];
    }
    return { left, right };
}

// RMS of an array
function rms(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
    return Math.sqrt(sum / arr.length);
}

// Peak absolute value
function peak(arr) {
    let mx = 0;
    for (let i = 0; i < arr.length; i++) {
        const a = Math.abs(arr[i]);
        if (a > mx) mx = a;
    }
    return mx;
}

// Cross-correlation at zero lag (normalized)
function crossCorrelation(a, b) {
    const n = Math.min(a.length, b.length);
    let sumAB = 0, sumAA = 0, sumBB = 0;
    for (let i = 0; i < n; i++) {
        sumAB += a[i] * b[i];
        sumAA += a[i] * a[i];
        sumBB += b[i] * b[i];
    }
    const denom = Math.sqrt(sumAA * sumBB);
    return denom > 0 ? sumAB / denom : 0;
}

// RMS of difference
function rmsDiff(a, b) {
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum / n);
}

// Find best lag offset (within ±maxLag samples)
function findBestLag(a, b, maxLag = 500) {
    const n = Math.min(a.length, b.length) - maxLag;
    let bestCorr = -Infinity;
    let bestLag = 0;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
        let sumAB = 0, sumAA = 0, sumBB = 0;
        for (let i = 0; i < n; i++) {
            const ai = a[i];
            const j = i + lag;
            if (j < 0 || j >= b.length) continue;
            const bi = b[j];
            sumAB += ai * bi;
            sumAA += ai * ai;
            sumBB += bi * bi;
        }
        const denom = Math.sqrt(sumAA * sumBB);
        const corr = denom > 0 ? sumAB / denom : 0;
        if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
        }
    }
    return { lag: bestLag, correlation: bestCorr };
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node jc_compare.mjs <native.wav> <uade.wav>');
        process.exit(1);
    }

    const wavA = readWav(args[0]);
    const wavB = readWav(args[1]);

    console.log(`File A: ${args[0]} — ${wavA.sampleRate}Hz, ${wavA.channels}ch, ${wavA.numSamples} frames (${(wavA.numSamples/wavA.sampleRate).toFixed(2)}s)`);
    console.log(`File B: ${args[1]} — ${wavB.sampleRate}Hz, ${wavB.channels}ch, ${wavB.numSamples} frames (${(wavB.numSamples/wavB.sampleRate).toFixed(2)}s)`);

    if (wavA.channels !== 2 || wavB.channels !== 2) {
        console.error('Both files must be stereo');
        process.exit(1);
    }

    // Resample both to 44100 Hz for comparison
    const targetRate = 44100;
    const rA = wavA.sampleRate === targetRate ? { samples: wavA.samples, numSamples: wavA.numSamples }
        : resample(wavA.samples, wavA.channels, wavA.sampleRate, targetRate);
    const rB = wavB.sampleRate === targetRate ? { samples: wavB.samples, numSamples: wavB.numSamples }
        : resample(wavB.samples, wavB.channels, wavB.sampleRate, targetRate);

    console.log(`\nResampled to ${targetRate}Hz: A=${rA.numSamples} frames, B=${rB.numSamples} frames`);

    // Deinterleave
    const chA = deinterleave(rA.samples, rA.numSamples);
    const chB = deinterleave(rB.samples, rB.numSamples);

    // Normalize levels: scale both to same RMS level for fair comparison
    const rmsAL = rms(chA.left), rmsAR = rms(chA.right);
    const rmsBL = rms(chB.left), rmsBR = rms(chB.right);
    console.log(`\nRMS levels: A(L=${rmsAL.toFixed(4)}, R=${rmsAR.toFixed(4)})  B(L=${rmsBL.toFixed(4)}, R=${rmsBR.toFixed(4)})`);
    console.log(`Peak levels: A(L=${peak(chA.left).toFixed(4)}, R=${peak(chA.right).toFixed(4)})  B(L=${peak(chB.left).toFixed(4)}, R=${peak(chB.right).toFixed(4)})`);

    // Find best lag alignment
    console.log('\nFinding best lag alignment...');
    const lagL = findBestLag(chA.left, chB.left, 1000);
    const lagR = findBestLag(chA.right, chB.right, 1000);
    console.log(`Best lag: L=${lagL.lag} samples (corr=${lagL.correlation.toFixed(6)}), R=${lagR.lag} samples (corr=${lagR.correlation.toFixed(6)})`);

    // Apply lag correction for aligned comparison
    const lag = lagL.lag; // use left channel lag
    const alignedBL = lag >= 0
        ? chB.left.subarray(lag)
        : (() => { const a = new Float32Array(chB.left.length + lag); a.set(chB.left.subarray(0, a.length)); return a; })();
    const alignedBR = lag >= 0
        ? chB.right.subarray(lag)
        : (() => { const a = new Float32Array(chB.right.length + lag); a.set(chB.right.subarray(0, a.length)); return a; })();

    // Cross-correlation (aligned)
    const corrL = crossCorrelation(chA.left, alignedBL);
    const corrR = crossCorrelation(chA.right, alignedBR);
    console.log(`\nAligned cross-correlation: L=${corrL.toFixed(6)}, R=${corrR.toFixed(6)}`);

    // RMS difference (aligned)
    const diffL = rmsDiff(chA.left, alignedBL);
    const diffR = rmsDiff(chA.right, alignedBR);
    console.log(`RMS difference: L=${diffL.toFixed(6)}, R=${diffR.toFixed(6)}`);

    // Segment-by-segment analysis (1-second blocks)
    const blockSize = targetRate;
    const numBlocks = Math.floor(Math.min(rA.numSamples, rB.numSamples) / blockSize);
    console.log(`\nPer-second correlation (${numBlocks} blocks):`);
    console.log('Sec   L-corr    R-corr    L-rmsD    R-rmsD');
    for (let b = 0; b < numBlocks; b++) {
        const start = b * blockSize;
        const aL = chA.left.subarray(start, start + blockSize);
        const aR = chA.right.subarray(start, start + blockSize);
        const bL = alignedBL.subarray(start, start + blockSize);
        const bR = alignedBR.subarray(start, start + blockSize);
        const cL = crossCorrelation(aL, bL);
        const cR = crossCorrelation(aR, bR);
        const dL = rmsDiff(aL, bL);
        const dR = rmsDiff(aR, bR);
        const flag = (cL < 0.9 || cR < 0.9) ? ' *** MISMATCH' : '';
        console.log(`${String(b).padStart(3)}   ${cL.toFixed(4)}    ${cR.toFixed(4)}    ${dL.toFixed(4)}    ${dR.toFixed(4)}${flag}`);
    }

    // Overall verdict
    const avgCorr = (corrL + corrR) / 2;
    console.log('\n--- VERDICT ---');
    if (avgCorr > 0.99) {
        console.log(`✓ EXCELLENT match (correlation ${avgCorr.toFixed(6)})`);
    } else if (avgCorr > 0.95) {
        console.log(`~ GOOD match (correlation ${avgCorr.toFixed(6)}) — minor differences`);
    } else if (avgCorr > 0.80) {
        console.log(`! FAIR match (correlation ${avgCorr.toFixed(6)}) — audible differences`);
    } else {
        console.log(`✗ POOR match (correlation ${avgCorr.toFixed(6)}) — significant differences`);
    }
}

main();
