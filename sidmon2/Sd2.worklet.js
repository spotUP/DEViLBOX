/**
 * Sd2.worklet.js - AudioWorklet processor for SidMon 2.0 WASM replayer
 *
 * The WASM player_render() writes interleaved stereo (LRLRLR...) into a
 * single float buffer. We deinterleave into the WebAudio output channels.
 */

class Sd2Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.previewActive = false;
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
        if (this.module && typeof this.module._player_init === 'function') {
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
            this.module._player_init(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            this.port.postMessage({ type: 'moduleLoaded' });
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._player_stop === 'function') {
          this.module._player_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setSubsong':
        if (this.module && typeof this.module._player_set_subsong === 'function') {
          this.module._player_set_subsong(data.subsong);
        }
        break;

      case 'setChannelGain':
        if (this.module && typeof this.module._player_set_channel_gain === 'function') {
          this.module._player_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'getNumTracks':
        if (this.module && typeof this.module._sd2_bridge_get_num_tracks === 'function') {
          const count = this.module._sd2_bridge_get_num_tracks();
          this.port.postMessage({ type: 'numTracks', count, requestId: data.requestId });
        }
        break;

      case 'getTrackLength':
        if (this.module && typeof this.module._sd2_bridge_get_track_length === 'function') {
          const length = this.module._sd2_bridge_get_track_length(data.trackIdx);
          this.port.postMessage({ type: 'trackLength', trackIdx: data.trackIdx, length, requestId: data.requestId });
        }
        break;

      case 'getCell':
        if (this.module && typeof this.module._sd2_bridge_get_cell === 'function') {
          const packed = this.module._sd2_bridge_get_cell(data.trackIdx, data.row);
          this.port.postMessage({
            type: 'cellData',
            trackIdx: data.trackIdx,
            row: data.row,
            note: (packed >>> 24) & 0xFF,
            instrument: (packed >>> 16) & 0xFF,
            effect: (packed >>> 8) & 0xFF,
            param: packed & 0xFF,
            requestId: data.requestId,
          });
        }
        break;

      case 'setCell':
        if (this.module && typeof this.module._sd2_bridge_set_cell === 'function') {
          this.module._sd2_bridge_set_cell(data.trackIdx, data.row, data.note, data.instrument, data.effect, data.param);
          this.port.postMessage({ type: 'cellSet', trackIdx: data.trackIdx, row: data.row, requestId: data.requestId });
        }
        break;

      case 'getTrackData':
        if (this.module &&
            typeof this.module._sd2_bridge_get_track_length === 'function' &&
            typeof this.module._sd2_bridge_get_cell === 'function') {
          const trackIdx = data.trackIdx;
          const len = this.module._sd2_bridge_get_track_length(trackIdx);
          const cells = [];
          for (let r = 0; r < len; r++) {
            const p = this.module._sd2_bridge_get_cell(trackIdx, r);
            cells.push({
              note: (p >>> 24) & 0xFF,
              instrument: (p >>> 16) & 0xFF,
              effect: (p >>> 8) & 0xFF,
              param: p & 0xFF,
            });
          }
          this.port.postMessage({ type: 'trackData', trackIdx, cells, requestId: data.requestId });
        }
        break;

      case 'noteOn':
        if (this.module && typeof this.module._sd2_note_on === 'function') {
          this.module._sd2_note_on(data.instrument, data.note, data.velocity);
          this.previewActive = true;
        }
        break;

      case 'noteOff':
        if (this.module && typeof this.module._sd2_note_off === 'function') {
          this.module._sd2_note_off();
          this.previewActive = false;
        }
        break;

      case 'save': {
        if (this.module && typeof this.module._sd2_save === 'function') {
          const size = this.module._sd2_save();
          if (size > 0 && typeof this.module._sd2_save_ptr === 'function') {
            const ptr = this.module._sd2_save_ptr();
            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (heapU8 && ptr) {
              const savedData = heapU8.slice(ptr, ptr + size);
              if (typeof this.module._sd2_save_free === 'function') {
                this.module._sd2_save_free();
              }
              this.port.postMessage({ type: 'saveData', data: savedData.buffer, requestId: data.requestId }, [savedData.buffer]);
            } else {
              this.port.postMessage({ type: 'saveData', data: null, requestId: data.requestId });
            }
          } else {
            this.port.postMessage({ type: 'saveData', data: null, requestId: data.requestId });
          }
        }
        break;
      }

      case 'setMuteMask':
        this.muteMask = data.mask;
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

      if (jsCode && !globalThis.Sd2) {
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

        const wrappedCode = jsCode + '\nreturn createSd2;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Sd2 = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Sd2 !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Sd2 factory not available' });
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
        this.module = await globalThis.Sd2(config);
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

      // Set output sample rate to match AudioContext
      if (typeof this.module._player_set_sample_rate === 'function') {
        this.module._player_set_sample_rate(sampleRate);
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

    // Choose render function: preview or normal playback
    const renderFn = this.previewActive
      ? this.module._sd2_render_preview
      : this.module._player_render;

    if (typeof renderFn === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = renderFn(this.interleavedPtr, numSamples);
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

registerProcessor('sd2-processor', Sd2Processor);
