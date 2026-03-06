/**
 * Node.js test for Gearmulator WASM audio output
 * Tests if ESAI register restoration is working
 */

const fs = require('fs');
const path = require('path');

async function testGearmulator() {
  // Load WASM and JS
  const wasmPath = path.join(__dirname, 'public/gearmulator/gearmulator_wasm.wasm');
  const jsPath = path.join(__dirname, 'public/gearmulator/gearmulator_wasm.js');

  if (!fs.existsSync(wasmPath)) {
    console.error('❌ WASM file not found:', wasmPath);
    process.exit(1);
  }

  console.log('📦 Loading WASM module...');
  const wasmBinary = fs.readFileSync(wasmPath);

  // Load and prepare JS module for Node.js
  let jsCode = fs.readFileSync(jsPath, 'utf8');

  // Remove ESM exports/imports
  jsCode = jsCode
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/export\s+{[^}]*}/g, '');

  // Create a module scope
  const moduleScope = {
    console: console,
    fetch: global.fetch || (() => Promise.reject('No fetch in Node.js')),
  };

  // Execute JS code in module scope
  const func = new Function(...Object.keys(moduleScope), jsCode);
  func(...Object.values(moduleScope));

  // The Emscripten module should be in global scope now
  const Module = global.Module || globalThis.Module;
  if (!Module) {
    console.error('❌ Emscripten Module not found after JS execution');
    process.exit(1);
  }

  console.log('✓ JS module loaded');

  // Initialize module with WASM
  console.log('📦 Instantiating WASM...');

  // Emscripten expects wasmBinary in Module.wasmBinary
  Module.wasmBinary = wasmBinary;

  // Create synthetic print function (Emscripten outputs here)
  let printBuf = '';
  Module.print = (msg) => {
    console.log('[WASM]', msg);
    printBuf += msg + '\n';
  };

  // Wait for module initialization
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WASM initialization timeout (10s)'));
    }, 10000);

    Module.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      console.log('✓ WASM runtime initialized');

      try {
        // Load ROM
        const romPath = path.join(__dirname, 'roms/gearmulator/extracted/Access Virus B (am29f040b_4v9).BIN');
        if (!fs.existsSync(romPath)) {
          console.error('❌ ROM not found:', romPath);
          console.error('   Available ROMs:');
          const romsDir = path.join(__dirname, 'roms/gearmulator/extracted');
          if (fs.existsSync(romsDir)) {
            fs.readdirSync(romsDir).forEach(f => console.error('   -', f));
          }
          reject(new Error('ROM not found'));
          return;
        }

        const romData = fs.readFileSync(romPath);
        console.log(`✓ ROM loaded: ${(romData.byteLength / 1024).toFixed(0)}KB`);

        // Create device
        console.log('🔧 Creating device...');
        const romPtr = Module._malloc(romData.byteLength);
        const romView = new Uint8Array(Module.HEAPU8.buffer, romPtr, romData.byteLength);
        romView.set(new Uint8Array(romData));

        const sampleRate = 44100;
        const handle = Module._gm_create(romPtr, romData.byteLength, 0, sampleRate); // 0 = Virus B
        Module._free(romPtr);

        if (handle < 0) {
          console.error('❌ Device creation failed');
          reject(new Error('gm_create returned ' + handle));
          return;
        }

        console.log(`✓ Device created: handle=${handle}, sampleRate=${sampleRate}`);

        // Check validity
        const isValid = Module._gm_isValid(handle);
        console.log(`✓ Device valid: ${isValid ? 'yes' : 'no'}`);

        // Send MIDI note on
        console.log('🎹 Sending MIDI Note On (C4, vel=100)...');
        Module._gm_sendMidi(handle, 0x90, 60, 100); // Note on C4

        // Push input frames
        console.log('📤 Pushing 128 input frames...');
        const pushResult = Module._gm_pushInput(handle, 128);
        console.log(`   Push result: ${pushResult}`);

        // Check input buffer size
        const inputSize = Module._gm_getAudioInputSize(handle);
        console.log(`   Audio input buffer size: ${inputSize} frames`);

        // Process audio (should convert input to output)
        console.log('⚙️  Processing audio...');
        const outBufL = Module._malloc(128 * 4);
        const outBufR = Module._malloc(128 * 4);
        Module._gm_process(handle, outBufL, outBufR, 128);

        // Check output buffer size
        const outputSize = Module._gm_getAudioOutputSize(handle);
        console.log(`✓ Audio output buffer size: ${outputSize} frames`);

        // Read output samples
        const outViewL = new Float32Array(Module.HEAPU8.buffer, outBufL, 128);
        const outViewR = new Float32Array(Module.HEAPU8.buffer, outBufR, 128);

        let peakL = 0, peakR = 0, rmsL = 0, rmsR = 0;
        for (let i = 0; i < 128; i++) {
          const al = Math.abs(outViewL[i]);
          const ar = Math.abs(outViewR[i]);
          peakL = Math.max(peakL, al);
          peakR = Math.max(peakR, ar);
          rmsL += al * al;
          rmsR += ar * ar;
        }
        rmsL = Math.sqrt(rmsL / 128);
        rmsR = Math.sqrt(rmsR / 128);

        console.log(`\n📊 Audio Output Analysis:`);
        console.log(`   Peak L: ${(peakL * 1000).toFixed(1)} (${peakL > 0.01 ? '✓ audible' : '❌ silent'})`);
        console.log(`   Peak R: ${(peakR * 1000).toFixed(1)} (${peakR > 0.01 ? '✓ audible' : '❌ silent'})`);
        console.log(`   RMS L:  ${(rmsL * 1000).toFixed(1)}`);
        console.log(`   RMS R:  ${(rmsR * 1000).toFixed(1)}`);

        // Diagnostic summary
        console.log(`\n🔍 ESAI Restoration Status:`);
        if (outputSize === 0) {
          console.error('   ❌ CRITICAL: Audio output buffer is EMPTY');
          console.error('   The ESAI fix may not be working.');
          console.log('\n   Debug output from WASM:');
          console.log(printBuf);
        } else if (peakL > 0 || peakR > 0) {
          console.log('   ✓ AUDIO IS BEING PRODUCED');
          console.log('   ✓ ESAI fix is working!');
        } else {
          console.error('   ⚠️  Output buffer has frames but audio is silent');
        }

        Module._free(outBufL);
        Module._free(outBufR);

        resolve(handle);
      } catch (err) {
        reject(err);
      }
    };

    // Trigger initialization if not already happening
    if (!Module.calledRun) {
      Module.callMain = () => {};
      // Module might initialize on demand
    }
  });
}

testGearmulator()
  .then((handle) => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  });
