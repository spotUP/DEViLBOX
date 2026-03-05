#!/usr/bin/env node
/**
 * jc_render.mjs — Render JamCracker Pro .jam modules to WAV via WASM
 *
 * Usage: node jc_render.mjs <input.jam> <output.wav> [duration_seconds]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(__dirname, 'build');

// Load the Emscripten module — it sets globalThis.createJamCracker
// Provide require/module/exports/__dirname/__filename for the CJS context
const src = readFileSync(join(WASM_DIR, 'JamCracker.js'), 'utf8');
import { createRequire } from 'module';
const require2 = createRequire(import.meta.url);
const fn = new Function('require', '__dirname', '__filename', 'module', 'exports',
    src + '\nreturn createJamCracker;');
const fakeModule = { exports: {} };
const createJamCracker = fn(require2, WASM_DIR, join(WASM_DIR, 'JamCracker.js'), fakeModule, fakeModule.exports);

function writeWavHeader(buf, offset, numSamples, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = numSamples * channels * bitsPerSample / 8;
    const chunkSize = 36 + dataSize;

    buf.write('RIFF', offset); offset += 4;
    buf.writeUInt32LE(chunkSize, offset); offset += 4;
    buf.write('WAVE', offset); offset += 4;
    buf.write('fmt ', offset); offset += 4;
    buf.writeUInt32LE(16, offset); offset += 4;           // fmt chunk size
    buf.writeUInt16LE(1, offset); offset += 2;            // PCM
    buf.writeUInt16LE(channels, offset); offset += 2;
    buf.writeUInt32LE(sampleRate, offset); offset += 4;
    buf.writeUInt32LE(byteRate, offset); offset += 4;
    buf.writeUInt16LE(blockAlign, offset); offset += 2;
    buf.writeUInt16LE(bitsPerSample, offset); offset += 2;
    buf.write('data', offset); offset += 4;
    buf.writeUInt32LE(dataSize, offset); offset += 4;
    return offset;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node jc_render.mjs <input.jam> <output.wav> [duration_seconds]');
        process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = args[1];
    const duration = parseFloat(args[2] || '15');

    // Load module file
    const moduleData = readFileSync(inputPath);
    console.error(`Loaded '${inputPath}' (${moduleData.length} bytes)`);

    // Initialize WASM
    const Module = await createJamCracker();

    // Allocate and copy module data into WASM memory
    const dataPtr = Module._malloc(moduleData.length);
    Module.HEAPU8.set(moduleData, dataPtr);

    // Initialize player
    const ret = Module._jc_init(dataPtr, moduleData.length);
    if (ret !== 0) {
        console.error(`Error: jc_init failed (${ret})`);
        Module._free(dataPtr);
        process.exit(1);
    }

    const sampleRate = Module._jc_get_sample_rate();
    const totalFrames = Math.floor(duration * sampleRate);
    const chunkSize = 2048;
    const channels = 2;
    const bitsPerSample = 16;

    // Allocate render buffer in WASM (float stereo)
    const floatBufPtr = Module._malloc(chunkSize * channels * 4);

    console.error(`Rendering ${duration}s at ${sampleRate} Hz (${totalFrames} frames)...`);

    // Create output buffer
    const headerSize = 44;
    const dataSize = totalFrames * channels * (bitsPerSample / 8);
    const wavBuf = Buffer.alloc(headerSize + dataSize);
    writeWavHeader(wavBuf, 0, totalFrames, sampleRate, channels, bitsPerSample);

    let framesWritten = 0;
    let wavOffset = headerSize;

    while (framesWritten < totalFrames) {
        const n = Math.min(chunkSize, totalFrames - framesWritten);
        Module._jc_render(floatBufPtr, n);

        // Read float data from WASM heap
        const floatArr = new Float32Array(Module.HEAPU8.buffer, floatBufPtr, n * channels);

        // Convert to 16-bit PCM
        for (let i = 0; i < n * channels; i++) {
            let s = floatArr[i];
            if (s > 1.0) s = 1.0;
            if (s < -1.0) s = -1.0;
            const sample = Math.round(s * 32767);
            wavBuf.writeInt16LE(sample, wavOffset);
            wavOffset += 2;
        }

        framesWritten += n;
    }

    writeFileSync(outputPath, wavBuf);

    const songLen = Module._jc_get_song_length();
    const numPat = Module._jc_get_num_patterns();
    const numInst = Module._jc_get_num_instruments();

    Module._jc_stop();
    Module._free(floatBufPtr);
    Module._free(dataPtr);

    console.error(`Wrote '${outputPath}' (${totalFrames} frames, ${duration}s)`);
    console.error(`Song: length=${songLen}, patterns=${numPat}, instruments=${numInst}`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
