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

  refreshHeapViews() {
    if (!this.furnaceModule || !this.furnaceModule.wasmMemory) return;
    const buf = this.furnaceModule.wasmMemory.buffer;
    if (!this.furnaceModule.HEAPF32 || this.furnaceModule.HEAPF32.buffer !== buf) {
      this.furnaceModule.HEAPF32 = new Float32Array(buf);
      this.furnaceModule.HEAPU8 = new Uint8Array(buf);
    }
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
      // Prevent Emscripten from using URL() to locate files (not available in WorkletGlobalScope)
      config.locateFile = (path) => path;

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten doesn't export HEAPF32/wasmMemory on Module by default)
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) {
              capturedMemory = value;
              break;
            }
          }
        }
        return result;
      };

      console.log('[FurnaceWorklet] Calling FurnaceChips factory with config:', Object.keys(config));
      try {
        this.furnaceModule = await globalThis.FurnaceChips(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }
      console.log('[FurnaceWorklet] WASM module loaded, exports:', Object.keys(this.furnaceModule).filter(k => k.startsWith('_')));

      // Store captured WASM memory for heap access
      if (!this.furnaceModule.wasmMemory && capturedMemory) {
        this.furnaceModule.wasmMemory = capturedMemory;
      }

      // Create heap views from WASM memory
      if (!this.furnaceModule.HEAPF32) {
        const wasmMem = this.furnaceModule.wasmMemory;
        if (wasmMem) {
          this.furnaceModule.HEAPU8 = new Uint8Array(wasmMem.buffer);
          this.furnaceModule.HEAPF32 = new Float32Array(wasmMem.buffer);
          console.log('[FurnaceWorklet] Created heap views from captured memory, buffer size:', wasmMem.buffer.byteLength);
        } else {
          console.error('[FurnaceWorklet] Could not find WASM memory buffer!');
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
      
      // Pre-cache views
      this.lView = new Float32Array(this.furnaceModule.HEAPF32.buffer, this.leftBufferPtr, 128);
      this.rView = new Float32Array(this.furnaceModule.HEAPF32.buffer, this.rightBufferPtr, 128);

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
        this.port.postMessage({
          type: 'debug',
          message: 'chip activated',
          chipType: chipType,
          activeChips: [...this.activeChips]
        });
      }
      this.furnaceModule._furnace_chip_write(chipType, register, value);
    } else if (type === 'setWavetable' && this.isInitialized) {
      this.refreshHeapViews();
      const ptr = this.furnaceModule._malloc(data.length);
      this.furnaceModule.HEAPU8.set(data, ptr);
      this.furnaceModule._furnace_set_wavetable(chipType, index, ptr, data.length);
      this.furnaceModule._free(ptr);
    } else if (type === 'setLogging' && this.isInitialized) {
      this.furnaceModule._furnace_set_logging(enabled);
    } else if (type === 'getLog' && this.isInitialized) {
      this.refreshHeapViews();
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
    } else if (type === 'ping') {
      // Echo back pong for testing
      this.port.postMessage({
        type: 'debug',
        message: 'pong',
        timestamp: event.data.timestamp,
        receivedAt: Date.now()
      });
    }
  }

  process(inputs, outputs) {
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

      // Check if WASM memory grew (views become detached)
      const currentBuffer = this.furnaceModule.wasmMemory
        ? this.furnaceModule.wasmMemory.buffer
        : this.furnaceModule.HEAPF32.buffer;
      if (this.lView.buffer !== currentBuffer) {
        if (this.furnaceModule.wasmMemory) {
          this.furnaceModule.HEAPF32 = new Float32Array(this.furnaceModule.wasmMemory.buffer);
          this.furnaceModule.HEAPU8 = new Uint8Array(this.furnaceModule.wasmMemory.buffer);
        }
        this.lView = new Float32Array(currentBuffer, this.leftBufferPtr, length);
        this.rView = new Float32Array(currentBuffer, this.rightBufferPtr, length);
      }

      for (let i = 0; i < length; i++) {
        left[i] += this.lView[i];
        right[i] += this.rView[i];
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
