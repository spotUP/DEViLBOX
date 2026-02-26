/**
 * Hively.worklet.js - AudioWorklet processor for HivelyTracker WASM replayer
 *
 * Song player mode: produces ~960 samples/frame at 50Hz, ring-buffered
 * for 128-sample AudioWorklet blocks.
 */

class HivelyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.tuneLoaded = false;
    this.looping = true;

    // Ring buffer for bridging 960-sample frames to 128-sample blocks
    this.ringSize = 8192;
    this.ringL = new Float32Array(this.ringSize);
    this.ringR = new Float32Array(this.ringSize);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;

    // WASM float buffers for decode output
    this.decodePtrL = 0;
    this.decodePtrR = 0;
    this.frameSamples = 960; // default for 48kHz

    // Position reporting
    this.reportCounter = 0;
    this.reportInterval = 8; // every ~8 process() calls (~23ms at 128 samples)

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadTune':
        this.loadTune(data.buffer, data.defStereo || 2);
        break;

      case 'freeTune':
        this.freeTune();
        break;

      case 'initSubsong':
        if (this.wasm && this.tuneLoaded) {
          this.wasm._hively_init_subsong(data.nr || 0);
          this.resetRingBuffer();
        }
        break;

      case 'play':
        this.playing = true;
        break;

      case 'stop':
        this.playing = false;
        this.resetRingBuffer();
        break;

      case 'pause':
        this.playing = false;
        break;

      case 'setLooping':
        this.looping = data.value !== false;
        break;

      case 'dispose':
        this.freeTune();
        this.destroyAllPlayers();
        this.playing = false;
        this.initialized = false;
        break;

      // ── Standalone Instrument Player Messages ──

      case 'createPlayer': {
        if (!this.wasm) break;
        const h = this.wasm._hively_create_player(Math.floor(sampleRate));
        if (h >= 0) {
          if (!this.playerOutPtrs) {
            this.playerOutPtrs = {};
          }
          // Allocate float buffers for this player (128 samples L+R)
          const floatBytes = 128 * 4;
          this.playerOutPtrs[h] = {
            l: this.wasm._malloc(floatBytes),
            r: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle: h });
        }
        break;
      }

      case 'destroyPlayer': {
        if (!this.wasm) break;
        const h = data.handle;
        if (this.playerOutPtrs && this.playerOutPtrs[h]) {
          this.wasm._free(this.playerOutPtrs[h].l);
          this.wasm._free(this.playerOutPtrs[h].r);
          delete this.playerOutPtrs[h];
        }
        this.wasm._hively_destroy_player(h);
        break;
      }

      case 'setInstrument': {
        if (!this.wasm) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        this.wasm._hively_player_set_instrument(data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        break;
      }

      case 'noteOn':
        if (this.wasm) {
          this.wasm._hively_player_note_on(data.handle, data.note, data.velocity || 127);
        }
        break;

      case 'noteOff':
        if (this.wasm) {
          this.wasm._hively_player_note_off(data.handle);
        }
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill document for Emscripten in worker context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {},
            appendChild: () => {},
            style: {},
            addEventListener: () => {},
          }),
          head: { appendChild: () => {} },
          body: { appendChild: () => {} },
          createTextNode: () => ({}),
          getElementById: () => null,
          querySelector: () => null,
        };
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }

      // Execute Emscripten JS via Function constructor (can't use import() in worklets)
      if (jsCode && !globalThis.createHively) {
        const wrappedCode = jsCode + '\nreturn createHively;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createHively = result;
        }
      }

      if (!globalThis.createHively) {
        throw new Error('createHively factory not available');
      }

      // Instantiate WASM module
      this.wasm = await globalThis.createHively({
        wasmBinary: wasmBinary,
      });

      // Initialize replayer
      this.wasm._hively_init(Math.floor(sr));

      // Allocate decode buffers in WASM heap
      this.frameSamples = Math.floor(sr / 50);
      const floatBytes = this.frameSamples * 4;
      this.decodePtrL = this.wasm._malloc(floatBytes);
      this.decodePtrR = this.wasm._malloc(floatBytes);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[Hively Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  loadTune(buffer, defStereo) {
    if (!this.wasm || !this.initialized) return;

    // Copy tune data to WASM heap
    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length);
    heap.set(data);

    const ok = this.wasm._hively_load_tune(ptr, data.length, defStereo);
    this.wasm._free(ptr);

    if (ok) {
      this.tuneLoaded = true;
      this.resetRingBuffer();

      const meta = {
        type: 'tuneLoaded',
        name: this.wasm.UTF8ToString(this.wasm._hively_get_name()),
        channels: this.wasm._hively_get_channels(),
        positions: this.wasm._hively_get_positions(),
        trackLength: this.wasm._hively_get_track_length(),
        subsongs: this.wasm._hively_get_subsongs(),
        speedMultiplier: this.wasm._hively_get_speed_multiplier(),
        restart: this.wasm._hively_get_restart(),
        mixGain: this.wasm._hively_get_mixgain(),
        stereoMode: this.wasm._hively_get_stereo_mode(),
        version: this.wasm._hively_get_version(),
      };
      this.port.postMessage(meta);
    } else {
      this.port.postMessage({ type: 'error', message: 'Failed to load HVL/AHX tune' });
    }
  }

  freeTune() {
    if (this.wasm && this.tuneLoaded) {
      this.wasm._hively_free_tune();
      this.tuneLoaded = false;
      this.playing = false;
      this.resetRingBuffer();
    }
  }

  resetRingBuffer() {
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;
  }

  destroyAllPlayers() {
    if (!this.wasm || !this.playerOutPtrs) return;
    for (const h of Object.keys(this.playerOutPtrs)) {
      const hi = parseInt(h);
      this.wasm._free(this.playerOutPtrs[hi].l);
      this.wasm._free(this.playerOutPtrs[hi].r);
      this.wasm._hively_destroy_player(hi);
    }
    this.playerOutPtrs = {};
  }

  decodeAndFillRing() {
    if (!this.wasm || !this.tuneLoaded) return;

    // Check for song end
    if (this.wasm._hively_is_song_end()) {
      if (this.looping) {
        this.wasm._hively_init_subsong(0);
      } else {
        this.playing = false;
        this.port.postMessage({ type: 'songEnd' });
        return;
      }
    }

    // Decode one frame
    const samples = this.wasm._hively_decode_frame(this.decodePtrL, this.decodePtrR);
    if (samples <= 0) return;

    // Read float data from WASM heap
    const heapF32 = this.wasm.HEAPF32;
    const offsetL = this.decodePtrL >> 2; // byte offset to float index
    const offsetR = this.decodePtrR >> 2;

    // Write to ring buffer
    for (let i = 0; i < samples; i++) {
      if (this.ringAvailable >= this.ringSize) break; // overflow protection
      this.ringL[this.ringWritePos] = heapF32[offsetL + i];
      this.ringR[this.ringWritePos] = heapF32[offsetR + i];
      this.ringWritePos = (this.ringWritePos + 1) % this.ringSize;
      this.ringAvailable++;
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    // Start silent — song playback and standalone players add into this
    outputL.fill(0);
    outputR.fill(0);

    // ── Song playback (ring-buffer decode) ──
    if (this.playing && this.tuneLoaded) {
      // Refill ring buffer if running low
      while (this.ringAvailable < numSamples + this.frameSamples) {
        const prevAvailable = this.ringAvailable;
        this.decodeAndFillRing();
        // Break if no progress (song ended or error)
        if (this.ringAvailable === prevAvailable) break;
      }

      // Add ring buffer samples into output
      const available = Math.min(numSamples, this.ringAvailable);
      for (let i = 0; i < available; i++) {
        outputL[i] = this.ringL[this.ringReadPos];
        outputR[i] = this.ringR[this.ringReadPos];
        this.ringReadPos = (this.ringReadPos + 1) % this.ringSize;
      }
      this.ringAvailable -= available;
    }

    // ── Mix in standalone instrument players ──
    if (this.wasm && this.playerOutPtrs) {
      const heapF32 = this.wasm.HEAPF32;
      for (const h of Object.keys(this.playerOutPtrs)) {
        const hi = parseInt(h);
        const ptrs = this.playerOutPtrs[hi];
        if (!ptrs) continue;

        const n = this.wasm._hively_player_render(hi, ptrs.l, ptrs.r, numSamples);
        if (n > 0) {
          const offL = ptrs.l >> 2;
          const offR = ptrs.r >> 2;
          for (let i = 0; i < n; i++) {
            outputL[i] += heapF32[offL + i];
            outputR[i] += heapF32[offR + i];
          }
        }
      }
    }

    // Report position periodically
    this.reportCounter++;
    if (this.reportCounter >= this.reportInterval) {
      this.reportCounter = 0;
      if (this.tuneLoaded) {
        this.port.postMessage({
          type: 'position',
          position: this.wasm._hively_get_position(),
          row: this.wasm._hively_get_row(),
          speed: this.wasm._hively_get_speed(),
        });
      }
    }

    return true;
  }
}

registerProcessor('hively-processor', HivelyProcessor);
