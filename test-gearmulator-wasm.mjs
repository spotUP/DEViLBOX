/**
 * Node.js ESM test for Gearmulator WASM audio output
 * Tests if ESAI register restoration is working
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testGearmulator() {
  try {
    // Load WASM binary
    const wasmPath = path.join(__dirname, 'public/gearmulator/gearmulator_wasm.wasm');

    if (!fs.existsSync(wasmPath)) {
      console.error('❌ WASM file not found:', wasmPath);
      process.exit(1);
    }

    console.log('📦 Loading WASM module...');
    const wasmBuffer = fs.readFileSync(wasmPath);

    // Load Emscripten JS wrapper
    const jsPath = path.join(__dirname, 'public/gearmulator/gearmulator_wasm.js');
    console.log('📦 Loading Emscripten wrapper...');

    // Dynamic import to avoid conflicts
    const moduleUrl = `file://${jsPath}?t=${Date.now()}`;
    const emModule = await import(moduleUrl);

    // Get the default export (should be Module)
    let Module = emModule.default;

    if (!Module) {
      console.error('❌ Module not found in Emscripten wrapper');
      console.error('   Available exports:', Object.keys(emModule));
      process.exit(1);
    }

    console.log('✓ Emscripten module loaded');

    // Initialize WASM
    console.log('⚙️  Initializing WASM...');

    // Emscripten module initialization
    if (!Module.wasmBinary) {
      Module.wasmBinary = wasmBuffer;
    }

    // Capture console output from WASM
    let printBuf = '';
    if (!Module.print) {
      Module.print = (msg) => {
        console.log('[WASM OUT]', msg);
        printBuf += msg + '\n';
      };
    }

    // Wait for runtime to initialize
    const initPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WASM init timeout'));
      }, 10000);

      const originalOnRuntimeInitialized = Module.onRuntimeInitialized;
      Module.onRuntimeInitialized = () => {
        clearTimeout(timeout);
        if (originalOnRuntimeInitialized) originalOnRuntimeInitialized();
        resolve();
      };

      // Force initialization
      if (Module._malloc) {
        clearTimeout(timeout);
        resolve();
      }
    });

    await initPromise;
    console.log('✓ WASM runtime ready');

    // Load ROM
    const romPath = path.join(__dirname, 'roms/gearmulator/extracted/Access Virus B (am29f040b_4v9).BIN');
    if (!fs.existsSync(romPath)) {
      console.error('❌ ROM not found:', romPath);
      const romsDir = path.join(__dirname, 'roms/gearmulator/extracted');
      if (fs.existsSync(romsDir)) {
        console.error('   Available ROMs:');
        fs.readdirSync(romsDir).forEach(f => console.error('     -', f));
      } else {
        console.error('   ROMs directory not found:', romsDir);
      }
      process.exit(1);
    }

    const romData = fs.readFileSync(romPath);
    console.log(`✓ ROM loaded: ${(romData.byteLength / 1024).toFixed(0)}KB`);

    // Create device
    console.log('🔧 Creating Virus B device...');
    const romPtr = Module._malloc(romData.byteLength);
    const romView = new Uint8Array(Module.HEAPU8.buffer, romPtr, romData.byteLength);
    romView.set(new Uint8Array(romData));

    const sampleRate = 44100;
    const handle = Module._gm_create(romPtr, romData.byteLength, 0, sampleRate); // 0 = Virus B
    Module._free(romPtr);

    if (handle < 0) {
      console.error('❌ Device creation failed (gm_create returned ' + handle + ')');
      process.exit(1);
    }

    console.log(`✓ Device created: handle=${handle}`);

    // Verify device is valid
    const isValid = Module._gm_isValid(handle);
    console.log(`✓ Device valid: ${isValid ? 'yes' : 'no'}`);

    const actualSampleRate = Module._gm_getSamplerate(handle);
    console.log(`✓ Actual sample rate: ${actualSampleRate.toFixed(0)} Hz`);

    // Send MIDI note on
    console.log('\n🎹 Sending MIDI: Note On C4 (vel=100)...');
    Module._gm_sendMidi(handle, 0x90, 60, 100);

    // Push input frames (silence to trigger audio processing)
    console.log('📤 Pushing 256 input frames...');
    const pushResult = Module._gm_pushInput(handle, 256);
    console.log(`   Push result: ${pushResult}`);

    // Check input buffer before process
    const inputBefore = Module._gm_getAudioInputSize(handle);
    console.log(`   Input buffer before process: ${inputBefore} frames`);

    // Process audio
    console.log('⚙️  Calling gm_process(256)...');
    const outBufL = Module._malloc(256 * 4);
    const outBufR = Module._malloc(256 * 4);

    const processStart = Date.now();
    Module._gm_process(handle, outBufL, outBufR, 256);
    const processTime = Date.now() - processStart;
    console.log(`   Process completed in ${processTime}ms`);

    // Check output buffer after process
    const outputAfter = Module._gm_getAudioOutputSize(handle);
    console.log(`   Output buffer after process: ${outputAfter} frames`);

    // Analyze output
    const outViewL = new Float32Array(Module.HEAPU8.buffer, outBufL, 256);
    const outViewR = new Float32Array(Module.HEAPU8.buffer, outBufR, 256);

    let peakL = 0, peakR = 0, rmsL = 0, rmsR = 0;
    let nonzeroL = 0, nonzeroR = 0;

    for (let i = 0; i < 256; i++) {
      const al = Math.abs(outViewL[i]);
      const ar = Math.abs(outViewR[i]);
      if (al > 0) nonzeroL++;
      if (ar > 0) nonzeroR++;
      peakL = Math.max(peakL, al);
      peakR = Math.max(peakR, ar);
      rmsL += al * al;
      rmsR += ar * ar;
    }
    rmsL = Math.sqrt(rmsL / 256);
    rmsR = Math.sqrt(rmsR / 256);

    console.log('\n📊 Audio Output Analysis:');
    console.log(`   Left channel:`);
    console.log(`     Peak: ${(peakL * 1000).toFixed(2)} mV (${peakL > 0.001 ? '✓' : '❌'})`);
    console.log(`     RMS:  ${(rmsL * 1000).toFixed(2)} mV`);
    console.log(`     Non-zero samples: ${nonzeroL}/256 (${(nonzeroL*100/256).toFixed(1)}%)`);
    console.log(`   Right channel:`);
    console.log(`     Peak: ${(peakR * 1000).toFixed(2)} mV (${peakR > 0.001 ? '✓' : '❌'})`);
    console.log(`     RMS:  ${(rmsR * 1000).toFixed(2)} mV`);
    console.log(`     Non-zero samples: ${nonzeroR}/256 (${(nonzeroR*100/256).toFixed(1)}%)`);

    // Verdict
    console.log('\n🔍 ESAI Restoration Verdict:');
    if (outputAfter === 0 && peakL === 0 && peakR === 0) {
      console.error('   ❌ CRITICAL: No audio output (ESAI fix may not be working)');
      console.error('\n   Debug output from WASM:');
      console.error(printBuf);
      Module._free(outBufL);
      Module._free(outBufR);
      process.exit(1);
    } else if (peakL > 0.001 || peakR > 0) {
      console.log('   ✅ AUDIO IS BEING PRODUCED');
      console.log('   ✅ ESAI fix is working correctly!');
    } else {
      console.warn('   ⚠️  Output buffer has data but peak is very low');
      console.log('\n   Debug output:');
      console.log(printBuf);
    }

    Module._free(outBufL);
    Module._free(outBufR);

    console.log('\n✅ Test complete - no errors');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

testGearmulator();
