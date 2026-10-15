/**
 * CZ101 AudioWorklet Processor
 * Wraps the UPD933 WASM emulation (Emscripten build, CZ101Module factory) for
 * the Casio CZ-101 synthesizer. Loaded the house way (as Klystrack.worklet.js):
 * the main thread sends the WASM bytes and the Emscripten glue source, the glue
 * runs via the Function constructor and instantiates the module itself, so the
 * minified import/export names are the glue's business, not ours.
 */

// The chip's pitch table assumes a 40 kHz sample clock (4.48 MHz / 112 clocks
// per sample); the chip renders at that rate and process() resamples it.
const CHIP_CLOCK = 4480000;
const CHIP_RATE = CHIP_CLOCK / 112;
const CHUNK = 256; // chip samples rendered per refill (chip buffer holds 4096)

class CZ101Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.isInitialized = false;
    this.bufferPtr = 0;
    this.pendingWrites = [];
    // Linear resampler state: chip-rate samples -> output rate
    this.phase = 0;
    this.prev = 0;
    this.next = 0;
    this.chipBuf = new Float32Array(CHUNK);
    this.chipIdx = 0;
    this.chipLen = 0;

    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;

      case 'writeReg':
        // Queued; applied at the start of the next process() block
        this.pendingWrites.push({ register: data.register, value: data.value });
        break;
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      if (jsCode && !globalThis.CZ101Module) {
        const factory = new Function(jsCode + '\nreturn CZ101Module;');
        const result = factory();
        if (typeof result === 'function') globalThis.CZ101Module = result;
      }
      if (!globalThis.CZ101Module) throw new Error('CZ101Module factory not available');

      this.wasm = await globalThis.CZ101Module({ wasmBinary });
      this.wasm._upd933_create(CHIP_CLOCK);
      this.wasm._upd933_set_cs(0); // chip select is active low; reset leaves it deselected
      this.bufferPtr = this.wasm._upd933_get_buffer();

      this.isInitialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[CZ101.worklet] Init error:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  /** One register write = 3 bytes on the chip's serial bus: register, high, low. */
  writeRegister(register, value) {
    this.wasm._upd933_write(register & 0xFF);
    this.wasm._upd933_write((value >> 8) & 0xFF);
    this.wasm._upd933_write(value & 0xFF);
  }

  /** Next chip-rate sample; renders a chunk when the queue runs dry (chip buffer holds 4096). */
  pullChipSample() {
    if (this.chipIdx >= this.chipLen) {
      this.wasm._upd933_render(CHUNK);
      const offset = this.bufferPtr / 4;
      this.chipBuf.set(this.wasm.HEAPF32.subarray(offset, offset + CHUNK));
      this.chipIdx = 0;
      this.chipLen = CHUNK;
    }
    return this.chipBuf[this.chipIdx++];
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || left;

    if (!this.isInitialized) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    while (this.pendingWrites.length > 0) {
      const { register, value } = this.pendingWrites.shift();
      this.writeRegister(register, value);
    }

    // Streaming linear resample from the chip's rate to the context rate
    const step = CHIP_RATE / sampleRate;
    for (let i = 0; i < left.length; i++) {
      this.phase += step;
      while (this.phase >= 1) {
        this.phase -= 1;
        this.prev = this.next;
        this.next = this.pullChipSample();
      }
      const s = this.prev + (this.next - this.prev) * this.phase;
      left[i] = s;
      right[i] = s;
    }
    return true;
  }
}

registerProcessor('cz101-processor', CZ101Processor);
