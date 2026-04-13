/**
 * Sawteeth.worklet.js - AudioWorklet processor for Sawteeth WASM replayer
 *
 * Plays .st files (Sawteeth synthesizer format).
 * WASM sawteeth_render() writes interleaved stereo (LRLRLR...) into a
 * single float buffer. We deinterleave into the WebAudio output channels.
 */

class SawteethProcessor extends AudioWorkletProcessor {
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
    if (data.type !== 'init' && !this.module && this.initializing) return;

    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        if (this.module && typeof this.module._sawteeth_init === 'function') {
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
            const result = this.module._sawteeth_init(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result !== 0) {
              this.port.postMessage({ type: 'error', message: 'sawteeth_init failed: ' + result });
              return;
            }

            const meta = {};
            if (typeof this.module._sawteeth_get_num_channels === 'function') {
              meta.channels = this.module._sawteeth_get_num_channels();
            }

            this.port.postMessage({ type: 'moduleLoaded', meta });
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._sawteeth_stop === 'function') {
          this.module._sawteeth_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setMuteMask': {
        if (this.module && typeof this.module._sawteeth_set_channel_gain === 'function') {
          const mask = data.mask || 0;
          const numCh = typeof this.module._sawteeth_get_num_channels === 'function'
            ? this.module._sawteeth_get_num_channels() : 12;
          for (let ch = 0; ch < numCh; ch++) {
            const muted = (mask & (1 << ch)) !== 0;
            this.module._sawteeth_set_channel_gain(ch, muted ? 0.0 : 1.0);
          }
        }
        break;
      }

      case 'setChannelGain':
        if (this.module && typeof this.module._sawteeth_set_channel_gain === 'function') {
          this.module._sawteeth_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'setParam':
        if (this.module && typeof this.module._sawteeth_set_param === 'function') {
          this.module._sawteeth_set_param(data.ins, data.paramId, data.value);
        }
        break;

      case 'getInstrument': {
        if (!this.module) break;
        const m = this.module;
        const idx = data.ins;
        const result = { ins: idx };

        // Scalar params
        if (typeof m._sawteeth_get_param === 'function') {
          result.filterMode = m._sawteeth_get_param(idx, 0);
          result.clipMode   = m._sawteeth_get_param(idx, 1);
          result.boost      = m._sawteeth_get_param(idx, 2);
          result.vibS       = m._sawteeth_get_param(idx, 3);
          result.vibD       = m._sawteeth_get_param(idx, 4);
          result.pwmS       = m._sawteeth_get_param(idx, 5);
          result.pwmD       = m._sawteeth_get_param(idx, 6);
          result.res        = m._sawteeth_get_param(idx, 7);
          result.sps        = m._sawteeth_get_param(idx, 8);
          result.len        = m._sawteeth_get_param(idx, 9);
          result.loop       = m._sawteeth_get_param(idx, 10);
        }

        // Amp envelope
        const ampPts = typeof m._sawteeth_get_amp_points === 'function' ? m._sawteeth_get_amp_points(idx) : 0;
        if (ampPts > 0) {
          const malloc = m._malloc || m.malloc;
          const free = m._free || m.free;
          if (malloc && free) {
            const tPtr = malloc(ampPts);
            const lPtr = malloc(ampPts);
            m._sawteeth_get_amp_env(idx, tPtr, lPtr, ampPts);
            const heapU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory.buffer);
            result.ampEnv = [];
            for (let i = 0; i < ampPts; i++) {
              result.ampEnv.push({ time: heapU8[tPtr + i], lev: heapU8[lPtr + i] });
            }
            free(tPtr); free(lPtr);
          }
        }

        // Filter envelope
        const fltPts = typeof m._sawteeth_get_filter_points === 'function' ? m._sawteeth_get_filter_points(idx) : 0;
        if (fltPts > 0) {
          const malloc = m._malloc || m.malloc;
          const free = m._free || m.free;
          if (malloc && free) {
            const tPtr = malloc(fltPts);
            const lPtr = malloc(fltPts);
            m._sawteeth_get_filter_env(idx, tPtr, lPtr, fltPts);
            const heapU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory.buffer);
            result.filterEnv = [];
            for (let i = 0; i < fltPts; i++) {
              result.filterEnv.push({ time: heapU8[tPtr + i], lev: heapU8[lPtr + i] });
            }
            free(tPtr); free(lPtr);
          }
        }

        // Steps (arpeggio/waveform sequence)
        const stepCount = typeof m._sawteeth_get_step_count === 'function' ? m._sawteeth_get_step_count(idx) : 0;
        if (stepCount > 0) {
          const malloc = m._malloc || m.malloc;
          const free = m._free || m.free;
          if (malloc && free) {
            const nPtr = malloc(stepCount);
            const wPtr = malloc(stepCount);
            const rPtr = malloc(stepCount);
            m._sawteeth_get_steps(idx, nPtr, wPtr, rPtr, stepCount);
            const heapU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory.buffer);
            result.steps = [];
            for (let i = 0; i < stepCount; i++) {
              result.steps.push({
                note: heapU8[nPtr + i],
                wForm: heapU8[wPtr + i],
                relative: heapU8[rPtr + i] !== 0,
              });
            }
            free(nPtr); free(wPtr); free(rPtr);
          }
        }

        this.port.postMessage({ type: 'instrumentData', data: result });
        break;
      }

      case 'setAmpEnv': {
        if (!this.module || typeof this.module._sawteeth_set_amp_env !== 'function') break;
        const m = this.module;
        const malloc = m._malloc || m.malloc;
        const free = m._free || m.free;
        if (!malloc || !free) break;
        const { ins, times, levs } = data;
        const count = times.length;
        const tPtr = malloc(count);
        const lPtr = malloc(count);
        const heapU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory.buffer);
        for (let i = 0; i < count; i++) {
          heapU8[tPtr + i] = times[i];
          heapU8[lPtr + i] = levs[i];
        }
        m._sawteeth_set_amp_env(ins, tPtr, lPtr, count);
        free(tPtr); free(lPtr);
        break;
      }

      case 'setFilterEnv': {
        if (!this.module || typeof this.module._sawteeth_set_filter_env !== 'function') break;
        const m = this.module;
        const malloc = m._malloc || m.malloc;
        const free = m._free || m.free;
        if (!malloc || !free) break;
        const { ins, times, levs } = data;
        const count = times.length;
        const tPtr = malloc(count);
        const lPtr = malloc(count);
        const heapU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory.buffer);
        for (let i = 0; i < count; i++) {
          heapU8[tPtr + i] = times[i];
          heapU8[lPtr + i] = levs[i];
        }
        m._sawteeth_set_filter_env(ins, tPtr, lPtr, count);
        free(tPtr); free(lPtr);
        break;
      }

      case 'setStep': {
        if (!this.module || typeof this.module._sawteeth_set_step !== 'function') break;
        this.module._sawteeth_set_step(data.ins, data.stepIdx, data.note, data.wForm, data.relative ? 1 : 0);
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

      if (jsCode && !globalThis.Sawteeth) {
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

        const wrappedCode = jsCode + '\nreturn createSawteeth;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Sawteeth = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Sawteeth !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Sawteeth factory not available' });
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
        this.module = await globalThis.Sawteeth(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        if (!this.interleavedPtr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

      if (typeof this.module._sawteeth_set_sample_rate === 'function') {
        this.module._sawteeth_set_sample_rate(sampleRate);
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
    if (this.module && typeof this.module._sawteeth_stop === 'function') {
      try { this.module._sawteeth_stop(); } catch (e) {}
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

    if (typeof this.module._sawteeth_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._sawteeth_render(this.interleavedPtr, numSamples);
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

registerProcessor('sawteeth-processor', SawteethProcessor);
