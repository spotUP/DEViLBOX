/**
 * Sonix.worklet.js - AudioWorklet processor for Sonix WASM player
 *
 * Supports SNX, SMUS, and TINY Sonix music formats.
 * The WASM sonix_render() writes interleaved stereo (LRLRLR...) into a
 * single float buffer. We deinterleave into the WebAudio output channels.
 */

class SonixProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.muteMask = 0xFFFFFFFF;

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
        if (this.module && typeof this.module._sonix_init === 'function') {
          try {
            // Load sidecar instrument files into memfs first
            if (data.sidecarFiles && Array.isArray(data.sidecarFiles)) {
              if (typeof this.module._sonix_memfs_clear === 'function') {
                this.module._sonix_memfs_clear();
              }
              for (const file of data.sidecarFiles) {
                this.addMemfsFile(file.path, file.data);
              }
            }

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

            const heapU8 = this.getHeapU8();
            if (!heapU8) {
              const free = this.module._free || this.module.free;
              if (free) free(wasmPtr);
              this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
              return;
            }

            heapU8.set(uint8Data, wasmPtr);
            const result = this.module._sonix_init(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result < 0) {
              const errStr = this.readCString(this.module._sonix_get_error());
              this.port.postMessage({ type: 'error', message: `sonix_init failed (${result}): ${errStr}` });
              return;
            }

            // Load sidecar instruments if a song path was provided
            if (data.songPath && typeof this.module._sonix_load_instruments === 'function') {
              const pathPtr = this.allocCString(data.songPath);
              if (pathPtr) {
                this.module._sonix_load_instruments(pathPtr);
                if (free) free(pathPtr);
              }
            }

            // Start playback
            if (typeof this.module._sonix_start === 'function') {
              this.module._sonix_start();
            }

            // Gather metadata
            const meta = {
              format: this.readCString(this.module._sonix_get_format_name()),
              numChannels: this.module._sonix_get_num_channels(),
              numInstruments: this.module._sonix_get_num_instruments(),
              numSamples: this.module._sonix_get_num_samples(),
            };

            this.port.postMessage({ type: 'moduleLoaded', meta });
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._sonix_stop === 'function') {
          this.module._sonix_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setSoloChannel':
        if (this.module && typeof this.module._sonix_set_solo_channel === 'function') {
          this.module._sonix_set_solo_channel(data.channel);
        }
        break;

      case 'setStereoMix':
        if (this.module && typeof this.module._sonix_set_stereo_mix === 'function') {
          this.module._sonix_set_stereo_mix(data.mix);
        }
        break;

      case 'setMuteMask':
        this.muteMask = data.mask;
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  addMemfsFile(path, dataArray) {
    if (!this.module || typeof this.module._sonix_memfs_add !== 'function') return;
    const uint8Data = new Uint8Array(dataArray);
    const malloc = this.module._malloc || this.module.malloc;
    const free = this.module._free || this.module.free;
    if (!malloc) return;

    const pathPtr = this.allocCString(path);
    if (!pathPtr) return;

    const dataPtr = malloc(uint8Data.length);
    if (!dataPtr) { if (free) free(pathPtr); return; }

    const heapU8 = this.getHeapU8();
    if (heapU8) {
      heapU8.set(uint8Data, dataPtr);
      this.module._sonix_memfs_add(pathPtr, dataPtr, uint8Data.length);
    }

    if (free) { free(dataPtr); free(pathPtr); }
  }

  allocCString(str) {
    const malloc = this.module._malloc || this.module.malloc;
    if (!malloc) return 0;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str + '\0');
    const ptr = malloc(bytes.length);
    if (!ptr) return 0;
    const heapU8 = this.getHeapU8();
    if (heapU8) heapU8.set(bytes, ptr);
    return ptr;
  }

  readCString(ptr) {
    if (!ptr) return '';
    const heapU8 = this.getHeapU8();
    if (!heapU8) return '';
    let end = ptr;
    while (heapU8[end] !== 0 && end < heapU8.length) end++;
    const bytes = heapU8.subarray(ptr, end);
    // Manual ASCII decode (TextDecoder not available in worklet)
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  getHeapU8() {
    if (!this.module) return null;
    return this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.createSonix) {
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

        const wrappedCode = jsCode + '\nreturn createSonix;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createSonix = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load Sonix JS module' });
          return;
        }
      }

      if (typeof globalThis.createSonix !== 'function') {
        this.port.postMessage({ type: 'error', message: 'createSonix factory not available' });
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
        this.module = await globalThis.createSonix(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Allocate interleaved stereo buffer
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        if (!this.interleavedPtr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

      // Set sample rate
      if (typeof this.module._sonix_set_sample_rate === 'function') {
        this.module._sonix_set_sample_rate(sampleRate);
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
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && typeof this.module._sonix_stop === 'function') {
      this.module._sonix_stop();
    }
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

    if (typeof this.module._sonix_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._sonix_render(this.interleavedPtr, numSamples);
        if (rendered > 0) {
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

registerProcessor('sonix-processor', SonixProcessor);
