/**
 * FurnaceChips AudioWorklet
 * Central processor for all WASM chip emulators.
 */

try {
  importScripts('FurnaceChips.js');
} catch (e) {}

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

  async initWasm(wasmBinary) {
    try {
      const config = { locateFile: (path) => path };
      if (wasmBinary) config.wasmBinary = wasmBinary;

      this.furnaceModule = await FurnaceChips(config);
      this.furnaceModule._furnace_init_chips(sampleRate);
      
      this.leftBufferPtr = this.furnaceModule._malloc(128 * 4);
      this.rightBufferPtr = this.furnaceModule._malloc(128 * 4);
      
      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });
    } catch (err) {
      console.error('[FurnaceWorklet] WASM Init Failed:', err);
    }
  }

  handleMessage(event) {
    const { type, wasmBinary, chipType, register, value, index, data, enabled } = event.data;

    if (type === 'init') {
      this.initWasm(wasmBinary);
    } else if (type === 'write' && this.isInitialized) {
      this.activeChips.add(chipType);
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
      // C++ struct RegisterWrite with standard alignment is 16 bytes:
      // uint32_t timestamp (4) + uint8_t chipType (1) + padding (3) +
      // uint32_t port (4) + uint8_t data (1) + padding (3) = 16 bytes
      const logData = new Uint8Array(this.furnaceModule.HEAPU8.buffer, ptr, size * 16);
      this.port.postMessage({ type: 'logData', data: new Uint8Array(logData) }); // Clone for safety
    }
  }

  process(inputs, outputs) {
    if (!this.isInitialized) return true;

    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    const length = left.length;

    left.fill(0);
    right.fill(0);

    for (const chipType of this.activeChips) {
      this.furnaceModule._furnace_chip_render(chipType, this.leftBufferPtr, this.rightBufferPtr, length);
      
      const lSrc = this.furnaceModule.HEAPF32.subarray(this.leftBufferPtr >> 2, (this.leftBufferPtr >> 2) + length);
      const rSrc = this.furnaceModule.HEAPF32.subarray(this.rightBufferPtr >> 2, (this.rightBufferPtr >> 2) + length);
      
      for (let i = 0; i < length; i++) {
        left[i] += lSrc[i];
        right[i] += rSrc[i];
      }
    }

    return true;
  }
}

registerProcessor('furnace-chips-processor', FurnaceChipsProcessor);
