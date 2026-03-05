#!/usr/bin/env node
/**
 * fp_render.mjs — Render Future Player .fp modules to WAV via WASM
 *
 * Usage: node fp_render.mjs <input.fp> <output.wav> [duration_seconds]
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const createFuturePlayer = require('./build/FuturePlayer.cjs');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node fp_render.mjs <input.fp> <output.wav> [duration_seconds]');
        process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = args[1];
    const duration = parseFloat(args[2] || '10');

    const moduleData = readFileSync(inputPath);
    console.log(`Loading ${inputPath} (${moduleData.length} bytes)`);

    const Module = await createFuturePlayer({});

    // Allocate and copy module data into WASM heap
    const dataPtr = Module._malloc(moduleData.length);
    Module.HEAPU8.set(moduleData, dataPtr);

    // Initialize
    const ret = Module._fp_wasm_init(dataPtr, moduleData.length);
    if (ret !== 0) {
        console.error('Failed to initialize module');
        Module._free(dataPtr);
        process.exit(1);
    }

    const sampleRate = Module._fp_wasm_get_sample_rate();
    const numSubsongs = Module._fp_wasm_get_num_subsongs();
    console.log(`Sample rate: ${sampleRate} Hz, Subsongs: ${numSubsongs}`);

    // Render
    const totalFrames = Math.ceil(sampleRate * duration);
    const chunkSize = 4096;
    const bufPtr = Module._malloc(chunkSize * 2 * 4); // stereo float32

    const samples = [];
    let framesLeft = totalFrames;

    while (framesLeft > 0) {
        const chunk = Math.min(chunkSize, framesLeft);
        Module._fp_wasm_render(bufPtr, chunk);

        const floatArray = new Float32Array(
            Module.HEAPF32.buffer, bufPtr, chunk * 2
        );
        // Convert to 16-bit PCM
        for (let i = 0; i < chunk * 2; i++) {
            let s = floatArray[i];
            s = Math.max(-1, Math.min(1, s));
            samples.push(Math.round(s * 32767));
        }
        framesLeft -= chunk;
    }

    Module._fp_wasm_stop();
    Module._free(bufPtr);
    Module._free(dataPtr);

    // Write WAV
    const numChannels = 2;
    const bitsPerSample = 16;
    const dataSize = samples.length * 2;
    const headerSize = 44;
    const buf = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);          // chunk size
    buf.writeUInt16LE(1, 20);           // PCM
    buf.writeUInt16LE(numChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    buf.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < samples.length; i++) {
        buf.writeInt16LE(samples[i], headerSize + i * 2);
    }

    writeFileSync(outputPath, buf);
    console.log(`Wrote ${outputPath}: ${totalFrames} frames, ${duration}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
