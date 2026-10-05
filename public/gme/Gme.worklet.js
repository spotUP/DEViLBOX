/**
 * Gme.worklet.js - AudioWorklet processor for console game music
 *
 * game-music-emu-wasm/: game-music-emu runs NSF/NSFE, GBS, HES, KSS, SPC,
 * VGM/VGZ and GYM files on the emulated CPU and sound chips.
 * gme_wasm_render_channels() writes interleaved stereo float (LRLRLR...)
 * plus, on the multi-channel emulators (NSF, GBS, HES, KSS), each voice
 * planar; the worklet deinterleaves the mix into the WebAudio output and
 * streams the voices to the oscilloscopes.
 */

class GmeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.chPtr = 0;          // up to 8 planar voice buffers of bufferSize floats
    this.scopes = 0;         // voices the loaded song renders to chBufs
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
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        if (this.module && typeof this.module._gme_wasm_load === 'function') {
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
            // track 0-based. Loading replaces any song playing.
            const result = this.module._gme_wasm_load(wasmPtr, uint8Data.length, data.track | 0, Math.round(sampleRate));
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result > 0) {
              this.scopes = this.module._gme_wasm_scope_count();
              const voices = [];
              for (let i = 0; i < this.module._gme_wasm_voice_count(); i++) {
                voices.push(this.module.UTF8ToString(this.module._gme_wasm_voice_name(i)));
              }
              // The track playing: the first audible one from the track asked for.
              const track = typeof this.module._gme_wasm_loaded_track === 'function' ? this.module._gme_wasm_loaded_track() : (data.track | 0);
              // Each track's name, where the file has one (NSFE, m3u-tagged files): the subsong control.
              const names = [];
              for (let i = 0; i < result; i++) names.push(this.module.UTF8ToString(this.module._gme_wasm_info(i, 2)));
              this.port.postMessage({ type: 'moduleLoaded', track, tracks: result, voices, scopes: this.scopes, names });
            } else {
              const why = { '-1': 'not a game-music-emu file', '-2': 'out of memory', '-3': 'game-music-emu refused the file', '-4': 'the track would not start' }[String(result)] || '';
              this.port.postMessage({ type: 'error', message: 'gme_wasm_load failed with code ' + result + (why ? ' (' + why + ')' : '') });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'startTrack': {
        // Start another track of the song loaded (subsong control, auto-advance).
        // Answers every request, -1 when no track started.
        let started = -1;
        if (this.module && typeof this.module._gme_wasm_start_track === 'function') {
          started = this.module._gme_wasm_start_track(data.track | 0, data.skipSilent ? 1 : 0);
        }
        const tracks = this.module && typeof this.module._gme_wasm_track_count === 'function' ? this.module._gme_wasm_track_count() : 0;
        this.port.postMessage({ type: 'trackStarted', track: started, tracks });
        break;
      }

      case 'setMuteMask':
        // Bit N set = voice N audible; DEViLBOX solo/mute.
        if (this.module && typeof this.module._gme_wasm_set_mute_mask === 'function') {
          this.module._gme_wasm_set_mute_mask(data.mask >>> 0);
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._gme_wasm_free === 'function') {
          // Stop means silence now: the song is released, render returns 0.
          this.module._gme_wasm_free();
          this.scopes = 0;
          this.port.postMessage({ type: 'stopped' });
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

      if (jsCode && !globalThis.GmeFactory) {
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

        const wrappedCode = jsCode + '\nreturn createGme;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.GmeFactory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.GmeFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Gme factory not available' });
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
        this.module = await globalThis.GmeFactory(config);
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
        this.chPtr = malloc(this.bufferSize * 8 * 4);
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
      this.chBufs = this.chPtr
        ? Array.from({ length: 8 }, (_, c) => new Float32Array(heapF32.buffer, this.chPtr + c * this.bufferSize * 4, this.bufferSize))
        : [];
    }
  }

  cleanup() {
    if (this.module && typeof this.module._gme_wasm_free === 'function') {
      try { this.module._gme_wasm_free(); } catch(e) { /* ignore */ }
    }
    const free = this.module?._free || this.module?.free;
    if (free && this.interleavedPtr) { free(this.interleavedPtr); this.interleavedPtr = 0; }
    if (free && this.chPtr) { free(this.chPtr); this.chPtr = 0; }
    this.chBufs = [];
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

    if (typeof this.module._gme_wasm_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const withChannels = this.scopes > 0 && this.chBufs.length === 8;
        const rendered = withChannels
          ? this.module._gme_wasm_render_channels(this.interleavedPtr, this.chPtr, numSamples, this.bufferSize)
          : this.module._gme_wasm_render(this.interleavedPtr, numSamples);
        if (rendered > 0) {
          // Every sample of each voice, for the oscilloscopes and the
          // per-channel role classifiers (worklets/channel-stream.js).
          if (withChannels && globalThis.DevilboxChannelStream) {
            this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
            this._stream.writeFloat32(this.chBufs.slice(0, this.scopes).map((b) => b.subarray(0, rendered)), rendered);
          }
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

registerProcessor('gme-processor', GmeProcessor);
