/**
 * FurnaceChips AudioWorklet
 * Central processor for all WASM chip emulators.
 *
 * IMPORTANT: AudioWorklets don't support importScripts().
 * The WASM module is loaded by fetching the JS and evaluating it.
 */

// Do NOT use let/const here - we need to access from globalThis after eval
// The eval'd code will set globalThis.FurnaceChips

class FurnaceChipsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.furnaceModule = null;
    this.isInitialized = false;
    this.leftBufferPtr = 0;
    this.rightBufferPtr = 0;
    this.activeChips = new Set();
    this.port.onmessage = this.handleMessage.bind(this);
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      // If we received JS code, evaluate it to get FurnaceChips
      if (jsCode && !globalThis.FurnaceChips) {
        try {
          console.log('[FurnaceWorklet] Loading JS module, code length:', jsCode.length);

          // The Emscripten module format is: var FurnaceChips = (()=>{...return async function...})();
          // In AudioWorklet, eval doesn't create accessible globals reliably.
          // Solution: Use Function constructor to execute code and capture the result.

          // The code defines: var FurnaceChips = (IIFE that returns factory function)
          // We need to execute it and capture FurnaceChips
          // Wrap the code to explicitly return the defined variable
          const wrappedCode = jsCode + '\nreturn FurnaceChips;';
          const factory = new Function(wrappedCode);
          const result = factory();

          console.log('[FurnaceWorklet] Function executed, result type:', typeof result);

          if (typeof result === 'function') {
            globalThis.FurnaceChips = result;
            console.log('[FurnaceWorklet] ✓ JS module loaded via Function constructor');
          } else if (typeof result === 'object' && result !== null) {
            // Check for default export
            if (typeof result.default === 'function') {
              globalThis.FurnaceChips = result.default;
              console.log('[FurnaceWorklet] Using .default export');
            } else {
              console.error('[FurnaceWorklet] Result is object but no .default function:', Object.keys(result));
            }
          } else {
            console.error('[FurnaceWorklet] Unexpected result type:', typeof result, result);
          }
        } catch (evalErr) {
          console.error('[FurnaceWorklet] Failed to load JS:', evalErr.message, evalErr.stack);
        }
      }

      if (typeof globalThis.FurnaceChips !== 'function') {
        console.error('[FurnaceWorklet] FurnaceChips not available or not a function');
        return;
      }

      console.log('[FurnaceWorklet] Initializing WASM, binary size:', wasmBinary?.byteLength);

      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      console.log('[FurnaceWorklet] Calling FurnaceChips factory with config:', Object.keys(config));
      this.furnaceModule = await globalThis.FurnaceChips(config);
      console.log('[FurnaceWorklet] WASM module loaded, exports:', Object.keys(this.furnaceModule).filter(k => k.startsWith('_')));

      // Check for heap views - Emscripten may not export them on Module by default
      // We need to find them ourselves from the WASM memory
      if (!this.furnaceModule.HEAPF32) {
        console.log('[FurnaceWorklet] HEAPF32 not on module, checking for WASM memory...');
        console.log('[FurnaceWorklet] Module keys:', Object.keys(this.furnaceModule).slice(0, 30));

        // Try different ways to access the memory buffer
        let wasmBuffer = null;

        // Method 1: Check if there's a wasmMemory export
        if (this.furnaceModule.wasmMemory) {
          wasmBuffer = this.furnaceModule.wasmMemory.buffer;
          console.log('[FurnaceWorklet] Found wasmMemory');
        }
        // Method 2: Check asm exports (older Emscripten)
        else if (this.furnaceModule.asm && this.furnaceModule.asm.memory) {
          wasmBuffer = this.furnaceModule.asm.memory.buffer;
          console.log('[FurnaceWorklet] Found asm.memory');
        }
        // Method 3: HEAPU8 might exist (gives us access to the buffer)
        else if (this.furnaceModule.HEAPU8) {
          wasmBuffer = this.furnaceModule.HEAPU8.buffer;
          console.log('[FurnaceWorklet] Found HEAPU8.buffer');
        }
        // Method 4: Check for buffer directly
        else if (this.furnaceModule.buffer) {
          wasmBuffer = this.furnaceModule.buffer;
          console.log('[FurnaceWorklet] Found buffer');
        }

        if (wasmBuffer) {
          // Create our own typed array views
          this.furnaceModule.HEAPU8 = new Uint8Array(wasmBuffer);
          this.furnaceModule.HEAPF32 = new Float32Array(wasmBuffer);
          console.log('[FurnaceWorklet] Created HEAPF32 view, buffer size:', wasmBuffer.byteLength);
        } else {
          console.error('[FurnaceWorklet] Could not find WASM memory buffer!');
          // Last resort: try to access internal Module memory
          // The Emscripten module should have internal heap but may need different access
        }
      } else {
        console.log('[FurnaceWorklet] HEAPF32 already available on module');
      }

      // Log and validate sampleRate before using
      const safeSampleRate = (typeof sampleRate === 'number' && sampleRate > 0) ? sampleRate : 48000;
      console.log('[FurnaceWorklet] sampleRate:', sampleRate, 'using:', safeSampleRate, 'type:', typeof sampleRate);

      this.furnaceModule._furnace_init_chips(safeSampleRate);
      console.log('[FurnaceWorklet] Chips initialized at', safeSampleRate, 'Hz');

      this.leftBufferPtr = this.furnaceModule._malloc(128 * 4);
      this.rightBufferPtr = this.furnaceModule._malloc(128 * 4);

      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });
      console.log('[FurnaceWorklet] ✓ Ready');
    } catch (err) {
      console.error('[FurnaceWorklet] WASM Init Failed:', err);
    }
  }

  handleMessage(event) {
    const { type, wasmBinary, jsCode, chipType, register, value, index, data, enabled } = event.data;

    if (type === 'init') {
      this.initWasm(wasmBinary, jsCode);
    } else if (type === 'write' && this.isInitialized) {
      const wasNew = !this.activeChips.has(chipType);
      this.activeChips.add(chipType);
      if (wasNew) {
        // Send chip activation message to main thread (more reliable than console.log)
        this.port.postMessage({
          type: 'debug',
          message: 'chip activated',
          chipType: chipType,
          activeChips: [...this.activeChips],
          processCount: this._processCount || 0
        });
      }
      this.furnaceModule._furnace_chip_write(chipType, register, value);
    } else if (type === 'setWavetable' && this.isInitialized) {
      const ptr = this.furnaceModule._malloc(data.length);
      this.furnaceModule.HEAPU8.set(data, ptr);
      this.furnaceModule._furnace_set_wavetable(chipType, index, ptr, data.length);
      this.furnaceModule._free(ptr);
    } else if (type === 'setLogging' && this.isInitialized) {
      this.furnaceModule._furnace_set_logging(enabled);
    } else if (type === 'getLog' && this.isInitialized) {
      const size = this.furnaceModule._furnace_get_log_size();
      const ptr = this.furnaceModule._furnace_get_log_data();
      const logData = new Uint8Array(this.furnaceModule.HEAPU8.buffer, ptr, size * 16);
      this.port.postMessage({ type: 'logData', data: new Uint8Array(logData) });
    } else if (type === 'getStatus') {
      this.port.postMessage({
        type: 'status',
        initialized: this.isInitialized,
        activeChips: this.activeChips ? [...this.activeChips] : [],
        processCount: this._processCount || 0,
        renderCount: this._renderCount || 0,
        hasAudio: this._loggedFirstAudio || false
      });
    } else if (type === 'deactivate') {
      // Remove chip from active set - stops rendering
      if (this.activeChips.has(chipType)) {
        this.activeChips.delete(chipType);
        this.port.postMessage({
          type: 'debug',
          message: 'chip deactivated',
          chipType: chipType,
          activeChips: [...this.activeChips]
        });
      }
    }
  }

  process(inputs, outputs) {
    // Track process calls
    if (!this._processCount) this._processCount = 0;
    this._processCount++;

    // Send message to main thread on first few process calls (more reliable than console.log)
    if (this._processCount <= 3) {
      this.port.postMessage({
        type: 'debug',
        message: 'process #' + this._processCount,
        initialized: this.isInitialized,
        activeChips: this.activeChips ? [...this.activeChips] : []
      });
    }

    // Log every 1000 process calls to show we're still running
    if (this._processCount % 1000 === 0) {
      this.port.postMessage({
        type: 'debug',
        message: 'heartbeat',
        processCount: this._processCount,
        activeChipsSize: this.activeChips ? this.activeChips.size : -1,
        isInitialized: this.isInitialized
      });
    }

    if (!this.isInitialized) return true;

    // Defensive check - make sure HEAPF32 exists
    if (!this.furnaceModule || !this.furnaceModule.HEAPF32) {
      // Log if we're hitting this early return
      if (!this._heapMissingLogged && this.activeChips && this.activeChips.size > 0) {
        this._heapMissingLogged = true;
        this.port.postMessage({
          type: 'debug',
          message: 'HEAPF32 missing!',
          hasModule: !!this.furnaceModule,
          hasHEAPF32: !!(this.furnaceModule && this.furnaceModule.HEAPF32)
        });
      }
      return true;
    }

    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    const length = left.length;

    left.fill(0);
    right.fill(0);

    // Render all active chips
    for (const chipType of this.activeChips) {
      this.furnaceModule._furnace_chip_render(chipType, this.leftBufferPtr, this.rightBufferPtr, length);

      const lSrc = this.furnaceModule.HEAPF32.subarray(this.leftBufferPtr >> 2, (this.leftBufferPtr >> 2) + length);
      const rSrc = this.furnaceModule.HEAPF32.subarray(this.rightBufferPtr >> 2, (this.rightBufferPtr >> 2) + length);

      for (let i = 0; i < length; i++) {
        left[i] += lSrc[i];
        right[i] += rSrc[i];
      }
    }

    // Debug: log render cycles - send to main thread for reliable logging
    if (this.activeChips.size > 0) {
      if (!this._renderCount) this._renderCount = 0;
      this._renderCount++;

      const maxL = Math.max(...left);
      const maxR = Math.max(...right);

      // Send first 10 render results to main thread
      if (this._renderCount <= 10) {
        this.port.postMessage({
          type: 'debug',
          message: 'render #' + this._renderCount,
          chips: [...this.activeChips],
          maxL: maxL.toFixed(6),
          maxR: maxR.toFixed(6),
          samples: [left[0].toFixed(6), left[1].toFixed(6), left[2].toFixed(6), left[3].toFixed(6)]
        });
      }

      // Log when we first get audio
      if ((maxL > 0.001 || maxR > 0.001) && !this._loggedFirstAudio) {
        this.port.postMessage({
          type: 'debug',
          message: '✓ First audio detected at render #' + this._renderCount,
          maxL: maxL,
          maxR: maxR
        });
        this._loggedFirstAudio = true;
      }

      // Track and log significant audio level changes
      if (!this._lastMaxL) this._lastMaxL = 0;
      const levelDiff = Math.abs(maxL - this._lastMaxL);
      if (levelDiff > 0.05 || (maxL > 0.1 && !this._loggedLoudAudio)) {
        this.port.postMessage({
          type: 'debug',
          message: '★ Audio level change: ' + this._lastMaxL.toFixed(4) + ' → ' + maxL.toFixed(4),
          render: this._renderCount,
          maxL: maxL,
          maxR: maxR
        });
        this._lastMaxL = maxL;
        if (maxL > 0.1) this._loggedLoudAudio = true;
      }
    }

    return true;
  }
}

// Guard against re-registration during HMR
try {
  registerProcessor('furnace-chips-processor', FurnaceChipsProcessor);
} catch (e) {
  // Already registered - ignore
}
