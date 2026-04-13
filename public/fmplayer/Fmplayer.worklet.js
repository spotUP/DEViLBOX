/**
 * Fmplayer.worklet.js - AudioWorklet processor for 98fmplayer FMP WASM engine
 *
 * The WASM fmplayer_wasm_render() writes interleaved stereo float (LRLRLR...) into
 * a buffer. We deinterleave into the WebAudio output channels.
 */

class FmplayerProcessor extends AudioWorkletProcessor {
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
        if (this.module && typeof this.module._fmplayer_wasm_load === 'function') {
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
            const result = this.module._fmplayer_wasm_load(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result === 0) {
              this.port.postMessage({ type: 'moduleLoaded' });
            } else {
              this.port.postMessage({ type: 'error', message: 'fmplayer_wasm_load failed with code ' + result });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._fmplayer_wasm_stop === 'function') {
          this.module._fmplayer_wasm_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setMuteMask':
        if (this.module && typeof this.module._fmplayer_wasm_set_mute_mask === 'function') {
          this.module._fmplayer_wasm_set_mute_mask(data.mask >>> 0);
        }
        break;

      case 'setFmSlotParam':
        if (this.module && typeof this.module._fmplayer_wasm_set_fm_slot_param === 'function') {
          this.module._fmplayer_wasm_set_fm_slot_param(data.ch, data.slot, data.paramId, data.value);
        }
        break;

      case 'setFmChParam':
        if (this.module && typeof this.module._fmplayer_wasm_set_fm_ch_param === 'function') {
          this.module._fmplayer_wasm_set_fm_ch_param(data.ch, data.paramId, data.value);
        }
        break;

      case 'setSsgParam':
        if (this.module && typeof this.module._fmplayer_wasm_set_ssg_param === 'function') {
          this.module._fmplayer_wasm_set_ssg_param(data.ch, data.paramId, data.value);
        }
        break;

      case 'getFmChannel': {
        if (!this.module || typeof this.module._fmplayer_wasm_get_fm_channel !== 'function') break;
        const m = this.module;
        const ch = data.ch;
        const malloc = m._malloc || m.malloc;
        const free = m._free || m.free;
        if (!malloc || !free) break;
        // 42 ints: 6 ch params + 4 slots * 9 params
        const ptr = malloc(42 * 4);
        m._fmplayer_wasm_get_fm_channel(ch, ptr);
        const heap32 = new Int32Array(m.wasmMemory.buffer);
        const base = ptr >> 2;
        const result = {
          ch,
          alg: heap32[base], fb: heap32[base + 1],
          fnum: heap32[base + 2], blk: heap32[base + 3],
          panL: heap32[base + 4], panR: heap32[base + 5],
          slots: [],
        };
        for (let s = 0; s < 4; s++) {
          const sb = base + 6 + s * 9;
          result.slots.push({
            tl: heap32[sb], ar: heap32[sb + 1], dr: heap32[sb + 2],
            sr: heap32[sb + 3], rr: heap32[sb + 4], sl: heap32[sb + 5],
            mul: heap32[sb + 6], det: heap32[sb + 7], ks: heap32[sb + 8],
          });
        }
        free(ptr);
        this.port.postMessage({ type: 'fmChannelData', data: result });
        break;
      }

      case 'getSsgChannel': {
        if (!this.module || typeof this.module._fmplayer_wasm_get_ssg_param !== 'function') break;
        const m = this.module;
        const ch = data.ch;
        const result = {
          ch,
          toneL: m._fmplayer_wasm_get_ssg_param(ch, 0),
          toneH: m._fmplayer_wasm_get_ssg_param(ch, 1),
          volume: m._fmplayer_wasm_get_ssg_param(ch, 2),
          noise: m._fmplayer_wasm_get_ssg_param(ch, 3),
          toneEn: m._fmplayer_wasm_get_ssg_param(ch, 4),
          noiseEn: m._fmplayer_wasm_get_ssg_param(ch, 5),
        };
        this.port.postMessage({ type: 'ssgChannelData', data: result });
        break;
      }

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Fmplayer) {
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

        const wrappedCode = jsCode + '\nreturn createFmplayer;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Fmplayer = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Fmplayer !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Fmplayer factory not available' });
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
        this.module = await globalThis.Fmplayer(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Initialize the engine with the worklet sample rate
      if (typeof this.module._fmplayer_wasm_init === 'function') {
        const initResult = this.module._fmplayer_wasm_init(sampleRate);
        if (initResult !== 0) {
          this.port.postMessage({ type: 'error', message: 'fmplayer_wasm_init failed: ' + initResult });
          return;
        }
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

    if (typeof this.module._fmplayer_wasm_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._fmplayer_wasm_render(this.interleavedPtr, numSamples);
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

registerProcessor('fmplayer-processor', FmplayerProcessor);
