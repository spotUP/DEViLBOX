/**
 * Sc68.worklet.js - AudioWorklet processor for SC68/SNDH WASM player
 *
 * The WASM _sc68_wasm_render() writes interleaved stereo (LRLRLR...) into a
 * single float buffer. We deinterleave into the WebAudio output channels.
 */

class Sc68Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) {
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        if (this.module && typeof this.module._sc68_wasm_init === 'function') {
          try {
            const uint8Data = new Uint8Array(data.moduleData);
            const malloc = this.module._malloc || this.module.malloc;
            if (!malloc) {
              this.port.postMessage({ type: 'error', message: 'malloc not available' });
              return;
            }

            const wasmPtr = malloc(uint8Data.length);
            if (!wasmPtr) {
              this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
              return;
            }

            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (!heapU8) {
              const free = this.module._free || this.module.free;
              if (free) free(wasmPtr);
              this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
              return;
            }

            heapU8.set(uint8Data, wasmPtr);
            const result = this.module._sc68_wasm_init(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result === 0) {
              this.port.postMessage({ type: 'moduleLoaded' });
            } else {
              this.port.postMessage({ type: 'error', message: 'sc68_wasm_init failed with code ' + result });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._sc68_wasm_stop === 'function') {
          this.module._sc68_wasm_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setChannelGain':
        if (this.module && typeof this.module._sc68_wasm_set_channel_gain === 'function') {
          this.module._sc68_wasm_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'setMuteMask':
        // SC68: YM2149 has 3 channels. Mute mask bit 0=ch0, bit 1=ch1, bit 2=ch2.
        // Since SC68 renders mixed stereo, we store gains in WASM for future
        // per-channel separation. For now this stores the state consistently.
        if (this.module && typeof this.module._sc68_wasm_set_channel_gain === 'function') {
          const mask = data.mask || 0;
          for (let ch = 0; ch < 3; ch++) {
            const muted = (mask & (1 << ch)) !== 0;
            this.module._sc68_wasm_set_channel_gain(ch, muted ? 0.0 : 1.0);
          }
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Sc68) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }),
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            getElementsByTagName: () => [], head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, customElements: { whenDefined: () => Promise.resolve() }, location: { href: '', pathname: '' } };
        }
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
        }
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
        }
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class { constructor(path) { this.href = path; } };
        }

        const wrappedCode = jsCode + '\nreturn createSc68;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Sc68 = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Sc68 !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Sc68 factory not available' });
        return;
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;

      try {
        this.module = await globalThis.Sc68(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Allocate interleaved stereo buffer: frames * 2 channels * 4 bytes per float
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        if (!this.interleavedPtr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

      // SC68 uses hardcoded 48kHz internally — no setSampleRate needed

      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free && this.interleavedPtr) { free(this.interleavedPtr); this.interleavedPtr = 0; }
    this.interleavedBuf = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);

    if (typeof this.module._sc68_wasm_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._sc68_wasm_render(this.interleavedPtr, numSamples);
        if (rendered > 0) {
          // Deinterleave LRLRLR... into separate L and R channels
          for (let i = 0; i < rendered; i++) {
            outputL[i] = this.interleavedBuf[i * 2];
            outputR[i] = this.interleavedBuf[i * 2 + 1];
          }
        }
      }
    }
    return true;
  }
}

registerProcessor('sc68-processor', Sc68Processor);
