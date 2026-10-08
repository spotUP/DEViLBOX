/**
 * Ma.worklet.js - AudioWorklet processor for Music-Assembler WASM synth
 *
 * The WASM player_render() writes interleaved stereo (LRLRLR...) into a
 * single float buffer. We deinterleave into the WebAudio output channels.
 */

class MaProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.framesPlayed = 0;      // frames rendered since the song started: a swapped-in module catches up to here
    this.subsong = 0;
    this.levelsPtr = 0;
    this.processCount = 0;
    this.previewActive = false;
    this.muteMask = 0xFFFFFFFF;
    // Playhead: the last row posted (the replayer's own tick count, 50 Hz, is the clock)
    this.lastPostedRow = -1;

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
            this.lastPostedRow = -1;
            this.module._player_init(wasmPtr, uint8Data.length);
            this.framesPlayed = 0;
            this.subsong = data.subsong > 0 ? data.subsong : 0;
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);
            // The tune the song's grid shows; init starts on sub-song 0.
            if (data.subsong > 0 && typeof this.module._player_set_subsong === 'function') this.module._player_set_subsong(data.subsong);

            this.applyMuteMask();

            this.port.postMessage({ type: 'moduleLoaded' });
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'swapModule':
        this.swapModule(data.moduleData, data.subsong);
        break;

      case 'stop':
        this.lastPostedRow = -1;
        if (this.module && typeof this.module._player_stop === 'function') {
          this.framesPlayed = 0;
          this.module._player_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setSubsong':
        this.lastPostedRow = -1;
        if (this.module && typeof this.module._player_set_subsong === 'function') {
          this.module._player_set_subsong(data.subsong);
        }
        break;

      case 'setChannelGain':
        if (this.module && typeof this.module._player_set_channel_gain === 'function') {
          this.module._player_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'getTrackLength':
        if (this.module && typeof this.module._ma_get_track_length === 'function') {
          const len = this.module._ma_get_track_length(data.trackIdx);
          this.port.postMessage({ type: 'trackLength', requestId: data.requestId, length: len });
        }
        break;

      case 'getCell':
        if (this.module && typeof this.module._ma_get_cell === 'function') {
          const packed = this.module._ma_get_cell(data.trackIdx, data.eventIdx);
          const note = (packed >>> 24) & 0xff;
          const instr = (packed >>> 16) & 0xff;
          const release = (packed >>> 8) & 0xff;
          const delay = (packed << 24) >> 24; // sign-extend
          this.port.postMessage({
            type: 'cellData', requestId: data.requestId,
            note, instrument: instr === 0xff ? -1 : instr, release, delay
          });
        }
        break;

      case 'getPatternData':
        if (this.module && typeof this.module._ma_get_track_length === 'function'
            && typeof this.module._ma_get_cell === 'function') {
          const trackIdx = data.trackIdx;
          const numEvents = this.module._ma_get_track_length(trackIdx);
          const events = [];
          for (let i = 0; i < numEvents; i++) {
            const p = this.module._ma_get_cell(trackIdx, i);
            const n = (p >>> 24) & 0xff;
            const ins = (p >>> 16) & 0xff;
            const rel = (p >>> 8) & 0xff;
            const d = (p << 24) >> 24;
            events.push({ note: n, instrument: ins === 0xff ? -1 : ins, release: rel, delay: d });
          }
          this.port.postMessage({ type: 'patternData', requestId: data.requestId, trackIdx, events });
        }
        break;

      case 'setCell':
        if (this.module && typeof this.module._ma_set_cell === 'function') {
          this.module._ma_set_cell(data.trackIdx, data.eventIdx, data.note, data.instrument, data.release, data.delay);
          this.port.postMessage({ type: 'cellSet', requestId: data.requestId });
        }
        break;

      case 'getNumTracks':
        if (this.module && typeof this.module._ma_get_num_tracks === 'function') {
          const n = this.module._ma_get_num_tracks();
          this.port.postMessage({ type: 'numTracks', requestId: data.requestId, count: n });
        }
        break;

      case 'noteOn':
        if (this.module && typeof this.module._ma_note_on_preview === 'function') {
          this.module._ma_note_on_preview(data.instrument, data.note, data.velocity);
          this.previewActive = true;
        }
        break;

      case 'noteOff':
        if (this.module && typeof this.module._ma_note_off_preview === 'function') {
          this.module._ma_note_off_preview();
          this.previewActive = false;
        }
        break;

      case 'save':
        if (this.module && typeof this.module._ma_save === 'function') {
          const saveSize = this.module._ma_save();
          if (saveSize > 0) {
            const ptr = this.module._ma_save_ptr();
            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (heapU8) {
              const saveData = new Uint8Array(saveSize);
              saveData.set(heapU8.subarray(ptr, ptr + saveSize));
              this.module._ma_save_free();
              this.port.postMessage({ type: 'save-data', requestId: data.requestId, data: saveData.buffer }, [saveData.buffer]);
            }
          } else {
            this.port.postMessage({ type: 'save-data', requestId: data.requestId, data: null });
          }
        }
        break;

      case 'setMuteMask':
        this.muteMask = data.mask;
        this.applyMuteMask();
        break;

      case 'getInstrumentParam': {
        if (!this.module || typeof this.module._ma_get_instrument_param !== 'function') break;
        var m = this.module;
        var pLen = m.lengthBytesUTF8(data.param) + 1;
        var pPtr = m._malloc(pLen);
        m.stringToUTF8(data.param, pPtr, pLen);
        var val = m._ma_get_instrument_param(data.inst, pPtr);
        m._free(pPtr);
        this.port.postMessage({ type: 'instrumentParamValue', inst: data.inst, param: data.param, value: val });
        break;
      }
      case 'setInstrumentParam': {
        if (!this.module || typeof this.module._ma_set_instrument_param !== 'function') break;
        var m = this.module;
        var pLen = m.lengthBytesUTF8(data.param) + 1;
        var pPtr = m._malloc(pLen);
        m.stringToUTF8(data.param, pPtr, pLen);
        m._ma_set_instrument_param(data.inst, pPtr, data.value);
        m._free(pPtr);
        break;
      }
      case 'getInstrumentCount': {
        if (!this.module || typeof this.module._ma_get_instrument_count !== 'function') break;
        var count = this.module._ma_get_instrument_count();
        this.port.postMessage({ type: 'instrumentCount', count: count });
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

      if (jsCode && !globalThis.Ma) {
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

        const wrappedCode = jsCode + '\nreturn createMa;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Ma = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Ma !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Ma factory not available' });
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
        this.module = await globalThis.Ma(config);
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

      // Allocate 4-float buffer for channel levels
      if (malloc) {
        this.levelsPtr = malloc(4 * 4);
        this.noteStartsPtr = malloc(4 * 4);
      }

      // Set output sample rate to match AudioContext (default is 28150 Hz PAL)
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

  /**
   * An edited module takes the place of the playing one without a restart (G24). The player is one global instance, so the
   * module is loaded afresh and run silently for the frames already played, in the blocks they were played in (the replayer is
   * deterministic); from there it is the edited module played from the start, at the position the listener is at.
   */
  swapModule(moduleData, subsong) {
    if (!this.module || typeof this.module._player_init !== 'function' || !moduleData) return;
    const bytes = new Uint8Array(moduleData);
    const malloc = this.module._malloc || this.module.malloc;
    const free = this.module._free || this.module.free;
    const ptr = malloc(bytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed for module data' }); return; }
    (this.module.HEAPU8 || new Uint8Array(this.module.wasmMemory.buffer)).set(bytes, ptr);
    this.lastPostedRow = -1;
    this.module._player_init(ptr, bytes.length);
    free(ptr);
    const tune = typeof subsong === 'number' && subsong > 0 ? subsong : this.subsong;
    if (tune > 0 && typeof this.module._player_set_subsong === 'function') this.module._player_set_subsong(tune);
    this.applyMuteMask();
    this.updateBufferViews();
    let left = this.framesPlayed;
    while (left > 0) {
      const n = Math.min(this.bufferSize, left);
      this.module._player_render(this.interleavedPtr, n);
      left -= n;
    }
    this.port.postMessage({ type: 'moduleSwapped', frames: this.framesPlayed });
  }

  updateBufferViews() {
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      // Interleaved stereo: frames * 2 floats
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free && this.interleavedPtr) { free(this.interleavedPtr); this.interleavedPtr = 0; }
    if (free && this.levelsPtr) { free(this.levelsPtr); this.levelsPtr = 0; }
    if (free && this.noteStartsPtr) { free(this.noteStartsPtr); this.noteStartsPtr = 0; }
    this.interleavedBuf = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }
  /**
   * The mixer's mask is bit N SET = channel N AUDIBLE. The core's gain export
   * takes 1 = audible, 0 = silent, so the bit becomes the gain here, once.
   * Re-applied after every load: a fresh module starts with all channels on.
   */
  applyMuteMask() {
    if (!this.module || typeof this.module._player_set_channel_gain !== 'function') return;
    for (let ch = 0; ch < 4; ch++) {
      this.module._player_set_channel_gain(ch, (this.muteMask >>> ch) & 1 ? 1 : 0);
    }
  }


  /**
   * The row the player is on, when it changes: { type: 'position', ticks } with the player's own tick count (it ticks at
   * 50 Hz; the first tick reads every voice's first event, row r reads on tick 1 + r * speed). The engine maps it to the grid.
   */
  postPlayhead() {
    const m = this.module;
    if (typeof m._player_get_ticks_played !== 'function') return;
    const ticks = m._player_get_ticks_played();
    if (ticks < 1) return;
    const speed = Math.max(1, m._player_get_tick_speed());
    const row = Math.floor((ticks - 1) / speed);
    if (row === this.lastPostedRow) return;
    this.lastPostedRow = row;
    this.port.postMessage({ type: 'position', ticks });
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);

    this.updateBufferViews();
    if (this.interleavedBuf) {
      let rendered = 0;
      if (this.previewActive && typeof this.module._ma_render_preview_buf === 'function') {
        rendered = this.module._ma_render_preview_buf(this.interleavedPtr, numSamples);
      } else if (typeof this.module._player_render === 'function') {
        rendered = this.module._player_render(this.interleavedPtr, numSamples);
      }
      if (!this.previewActive && rendered > 0) this.framesPlayed += rendered;
      if (rendered > 0) {
        for (let i = 0; i < rendered; i++) {
          outputL[i] = this.interleavedBuf[i * 2];
          outputR[i] = this.interleavedBuf[i * 2 + 1];
        }
      }
      if (!this.previewActive) this.postPlayhead();
    }

    if (++this.processCount >= 8 && this.levelsPtr && typeof this.module._player_get_channel_levels === 'function') {
      this.processCount = 0;
      this.module._player_get_channel_levels(this.levelsPtr);
      const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
      if (heapF32) {
        const off = this.levelsPtr >> 2;
        // Cumulative note starts per voice (the player's own retrigger calls)
        let noteStarts = null;
        if (this.noteStartsPtr && typeof this.module._player_get_note_start_counts === 'function') {
          this.module._player_get_note_start_counts(this.noteStartsPtr, 4);
          noteStarts = Array.from(new Uint32Array((this.module.HEAPU8 || new Uint8Array(this.module.wasmMemory.buffer)).buffer, this.noteStartsPtr, 4));
        }
        this.port.postMessage({ type: 'chLevels', levels: [heapF32[off], heapF32[off+1], heapF32[off+2], heapF32[off+3]], noteStarts });
      }
    }

    return true;
  }
}

registerProcessor('ma-processor', MaProcessor);
