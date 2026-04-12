/**
 * Asap.worklet.js - AudioWorklet processor for ASAP (Another Slight Atari Player) WASM
 *
 * ASAP renders stereo S16 LE. We convert to float32 and deinterleave into
 * separate L/R WebAudio output channels.
 */

class AsapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.s16Ptr = 0;
    this.s16Buf = null;
    this.initialized = false;
    this.playing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.filenamePtr = 0;

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
        if (this.module && typeof this.module._asap_wasm_load === 'function') {
          try {
            const uint8Data = new Uint8Array(data.moduleData);
            const malloc = this.module._malloc || this.module.malloc;
            const free = this.module._free || this.module.free;
            if (!malloc) {
              this.port.postMessage({ type: 'error', message: 'malloc not available' });
              return;
            }

            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (!heapU8) {
              this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
              return;
            }

            // Allocate and copy module data
            const dataPtr = malloc(uint8Data.length);
            if (!dataPtr) {
              this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
              return;
            }
            heapU8.set(uint8Data, dataPtr);

            // Allocate and copy filename
            const filename = data.filename || 'tune.sap';
            const fnBytes = new TextEncoder().encode(filename + '\0');
            if (this.filenamePtr) { if (free) free(this.filenamePtr); }
            this.filenamePtr = malloc(fnBytes.length);
            if (!this.filenamePtr) {
              if (free) free(dataPtr);
              this.port.postMessage({ type: 'error', message: 'malloc failed for filename' });
              return;
            }
            heapU8.set(fnBytes, this.filenamePtr);

            const result = this.module._asap_wasm_load(dataPtr, uint8Data.length, this.filenamePtr);
            if (free) free(dataPtr);

            if (result) {
              this.playing = true;
              const meta = {};
              if (typeof this.module._asap_wasm_get_channels === 'function') {
                meta.channels = this.module._asap_wasm_get_channels();
              }
              if (typeof this.module._asap_wasm_get_songs === 'function') {
                meta.songs = this.module._asap_wasm_get_songs();
              }
              this.port.postMessage({ type: 'moduleLoaded', meta });
            } else {
              this.port.postMessage({ type: 'error', message: 'asap_wasm_load failed' });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'play':
        this.playing = true;
        break;

      case 'stop':
        this.playing = false;
        if (this.module && typeof this.module._asap_wasm_stop === 'function') {
          this.module._asap_wasm_stop();
        }
        // Re-init ASAP so it's ready for next load
        if (this.module && typeof this.module._asap_wasm_init === 'function') {
          this.module._asap_wasm_init(sampleRate);
        }
        this.port.postMessage({ type: 'stopped' });
        break;

      case 'playSong':
        if (this.module && typeof this.module._asap_wasm_play_song === 'function') {
          const ok = this.module._asap_wasm_play_song(data.song);
          if (ok) {
            this.playing = true;
            this.port.postMessage({ type: 'songChanged', song: data.song });
          }
        }
        break;

      case 'setMuteMask':
        if (this.module && typeof this.module._asap_wasm_mute_channels === 'function') {
          this.module._asap_wasm_mute_channels(data.mask || 0);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Asap) {
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

        const wrappedCode = jsCode + '\nreturn createAsap;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Asap = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Asap !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Asap factory not available' });
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
        this.module = await globalThis.Asap(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Initialize ASAP engine
      if (typeof this.module._asap_wasm_init === 'function') {
        this.module._asap_wasm_init(sr);
      }

      // Allocate S16 stereo buffer: frames * 2 channels * 2 bytes per sample
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.s16Ptr = malloc(this.bufferSize * 2 * 2);
        if (!this.s16Ptr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

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
    if (!this.module || !this.s16Ptr) return;
    const mem = this.module.wasmMemory;
    if (!mem) return;
    if (this.lastHeapBuffer !== mem.buffer) {
      this.s16Buf = new Int16Array(mem.buffer, this.s16Ptr, this.bufferSize * 2);
      this.lastHeapBuffer = mem.buffer;
    }
  }

  cleanup() {
    if (this.module && typeof this.module._asap_wasm_stop === 'function') {
      try { this.module._asap_wasm_stop(); } catch (e) {}
    }
    const free = this.module?._free || this.module?.free;
    if (free && this.s16Ptr) { free(this.s16Ptr); this.s16Ptr = 0; }
    if (free && this.filenamePtr) { free(this.filenamePtr); this.filenamePtr = 0; }
    this.s16Buf = null;
    this.module = null;
    this.initialized = false;
    this.playing = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);

    if (typeof this.module._asap_wasm_render === 'function') {
      // Detect heap growth
      this.updateBufferViews();
      if (!this.s16Buf) return true;

      const rendered = this.module._asap_wasm_render(this.s16Ptr, numSamples);
      if (rendered > 0) {
        // Heap may have grown during render — re-check
        this.updateBufferViews();
        if (!this.s16Buf) return true;

        // Convert S16 LE interleaved to float32 deinterleaved
        const scale = 1.0 / 32768.0;
        for (let i = 0; i < rendered; i++) {
          outputL[i] = this.s16Buf[i * 2] * scale;
          outputR[i] = this.s16Buf[i * 2 + 1] * scale;
        }
      }
    }
    return true;
  }
}

registerProcessor('asap-processor', AsapProcessor);
