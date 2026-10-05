/**
 * StoneTracker.worklet.js - AudioWorklet processor for StoneTracker (.spm + .sps)
 *
 * stonetracker-wasm/: the authors' StonePlayer_Hard.bin on Musashi's 68020
 * with a register-level Paula and CIA-B. st_wasm_render() writes interleaved
 * stereo float (LRLR...); the worklet deinterleaves into the outputs.
 */

class StoneTrackerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.chPtr = 0;          // 8 planar per-track buffers of bufferSize floats
    this.chBufs = [];
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
        await this.initModule(data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        if (this.module && typeof this.module._st_wasm_load === 'function') {
          try {
            this.module._st_wasm_stop();
            this.module._st_wasm_init(Math.round(sampleRate));

            const song = new Uint8Array(data.moduleData);
            const bank = new Uint8Array(data.sampleData || new ArrayBuffer(0));
            if (bank.length === 0) {
              this.port.postMessage({ type: 'error', message: 'StoneTracker needs the SPS sample bank beside the SPM song' });
              return;
            }
            const malloc = this.module._malloc;
            const free = this.module._free;
            const songPtr = malloc(song.length);
            const bankPtr = malloc(bank.length);
            if (!songPtr || !bankPtr) {
              if (songPtr) free(songPtr);
              if (bankPtr) free(bankPtr);
              this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
              return;
            }
            this.module.HEAPU8.set(song, songPtr);
            this.module.HEAPU8.set(bank, bankPtr);
            const result = this.module._st_wasm_load(songPtr, song.length, bankPtr, bank.length);
            free(songPtr);
            free(bankPtr);

            if (result === 0) {
              this.port.postMessage({ type: 'moduleLoaded' });
            } else {
              const why = { '-2': 'not a StoneTracker SPM song', '-3': 'not a StoneTracker SPS bank (or an unsupported packing)', '-4': 'the player refused the module', '-5': 'the 68k player crashed' }[String(result)] || '';
              this.port.postMessage({ type: 'error', message: 'st_wasm_load failed with code ' + result + (why ? ' (' + why + ')' : '') });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'setMuteMask':
        // Bit N set = track N+1 (0-7) audible; DEViLBOX solo/mute.
        if (this.module && typeof this.module._st_wasm_set_mute_mask === 'function') {
          this.module._st_wasm_set_mute_mask(data.mask >>> 0);
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._st_wasm_stop === 'function') {
          this.module._st_wasm_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.StoneTrackerFactory) {
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
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class { constructor(path) { this.href = path; } };
        }

        const factory = new Function(jsCode + '\nreturn createStoneTracker;');
        const result = factory();
        if (typeof result === 'function') {
          globalThis.StoneTrackerFactory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.StoneTrackerFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'StoneTracker factory not available' });
        return;
      }

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.StoneTrackerFactory(config);

      this.interleavedPtr = this.module._malloc(this.bufferSize * 2 * 4);
      if (!this.interleavedPtr) {
        this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
        return;
      }
      this.chPtr = this.module._malloc(this.bufferSize * 8 * 4);

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
    const heapF32 = this.module.HEAPF32;
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
      this.chBufs = this.chPtr
        ? Array.from({ length: 8 }, (_, c) => new Float32Array(heapF32.buffer, this.chPtr + c * this.bufferSize * 4, this.bufferSize))
        : [];
    }
  }

  cleanup() {
    if (this.module && typeof this.module._st_wasm_stop === 'function') {
      try { this.module._st_wasm_stop(); } catch (e) { /* ignore */ }
    }
    if (this.module && this.interleavedPtr) { this.module._free(this.interleavedPtr); this.interleavedPtr = 0; }
    if (this.module && this.chPtr) { this.module._free(this.chPtr); this.chPtr = 0; }
    this.chBufs = [];
    this.interleavedBuf = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);
    this.updateBufferViews();
    if (this.interleavedBuf) {
      const withChannels = this.chBufs.length === 8;
      const rendered = withChannels
        ? this.module._st_wasm_render_channels(this.interleavedPtr, this.chPtr, numSamples, this.bufferSize)
        : this.module._st_wasm_render(this.interleavedPtr, numSamples);
      // Every sample of each of the eight tracks, for the oscilloscopes, VU
      // meters and per-channel role classifiers (worklets/channel-stream.js).
      if (withChannels && rendered > 0 && globalThis.DevilboxChannelStream) {
        this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
        this._stream.writeFloat32(this.chBufs.map((b) => b.subarray(0, rendered)), rendered);
      }
      for (let i = 0; i < rendered; i++) {
        outputL[i] = this.interleavedBuf[i * 2];
        outputR[i] = this.interleavedBuf[i * 2 + 1];
      }
    }
    return true;
  }
}

registerProcessor('stonetracker-processor', StoneTrackerProcessor);
