// public/pretracker/PreTracker.worklet.js
// AudioWorklet bridge for PreTracker WASM module

class PreTrackerWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.wasmModule = null;
    this.sampleRate = options.processorOptions?.sampleRate || 48000;
    this.isInitialized = false;
    this.outputBuffer = new Float32Array(4096 * 2); // stereo

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async initWasm() {
    try {
      // Load WASM module (site-rip from public/pretracker/Pretracker.js)
      const response = await fetch('Pretracker.js');
      const script = await response.text();
      const wasmModule = await eval(script + '; createPretracker({})')();
      this.wasmModule = wasmModule;
      this.isInitialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  handleMessage(msg) {
    if (!this.wasmModule) return;

    switch (msg.type) {
      case 'init':
        // msg.data = ArrayBuffer of module file
        const uint8Data = new Uint8Array(msg.data);
        const wasmPtr = this.wasmModule._malloc(uint8Data.length);
        this.wasmModule.HEAPU8.set(uint8Data, wasmPtr);
        this.wasmModule._player_init(wasmPtr, uint8Data.length);
        this.wasmModule._free(wasmPtr);
        this.port.postMessage({ type: 'loaded' });
        break;

      case 'stop':
        this.wasmModule._player_stop();
        this.port.postMessage({ type: 'stopped' });
        break;

      case 'setSubsong':
        this.wasmModule._player_set_subsong(msg.subsong);
        break;
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.isInitialized || !this.wasmModule) {
      outputs[0][0].fill(0); // output silence
      return true;
    }

    const output = outputs[0];
    const frames = output[0].length;

    // Render frames from WASM
    const wasmBufPtr = this.wasmModule._malloc(frames * 2 * 4); // 2 channels, 4 bytes per float
    const rendered = this.wasmModule._player_render(wasmBufPtr, frames);

    if (rendered > 0) {
      const wasmBuf = new Float32Array(
        this.wasmModule.HEAPF32.buffer,
        wasmBufPtr,
        rendered * 2
      );
      // Deinterleave stereo
      for (let i = 0; i < rendered; i++) {
        output[0][i] = wasmBuf[i * 2];
        output[1][i] = wasmBuf[i * 2 + 1];
      }
    }

    this.wasmModule._free(wasmBufPtr);
    return true;
  }
}

registerProcessor('pretracker', PreTrackerWorklet);
